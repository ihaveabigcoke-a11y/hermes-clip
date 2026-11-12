import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runMediaTool,compressMedia,probeMedia,VIDEO_MAX_BYTES} from '../src/compress.mjs';
import {saveDownload,digest} from '../src/storage-policy.mjs';
import {registerNewRender,assetCompression} from '../src/asset-compression.mjs';
import {startLocalServer,sessionCookie} from './helpers/local-server.mjs';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';

async function fixture(t){const root=await mkdtemp(join(tmpdir(),'hermes-t006-import-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function clip(path,duration=1){await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=green:s=720x1280:r=12','-t',String(duration),'-c:v','libx264','-threads','2',path]);return readFile(path);}
const headers=local=>({Cookie:sessionCookie+'='+local.session,Origin:local.origin});
async function post(local,form){const response=await fetch(local.origin+'/api/assets',{method:'POST',headers:headers(local),body:form});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;}

test('new render is decoded, imported, hash verified then deleted; retry returns saved asset; old render unchanged',async t=>{
  const root=await fixture(t),source=join(root,'source.mp4'),bytes=await clip(source);
  const store=new Store(join(root,'worker.sqlite'));
  const local=await startLocalServer({root:join(root,'workspace'),seedPath:join(root,'none.json')});
  try{
  const old=join(root,'renders','legacy');await mkdir(old,{recursive:true});await writeFile(join(old,'output.mp4'),bytes);
  const worker=new Worker(store,root,{},{}),result=await worker.render({ratio:'9:16',clips:[{bytes:new Uint8Array(bytes),sha256:digest(bytes),duration:1}]});
  assert.ok(result.size<VIDEO_MAX_BYTES);assert.ok((await stat(result.path)).size);assert.equal(result.fullDecode,true);
  const token=registerNewRender(local,result),form=new FormData();form.set('preparedToken',token);
  const asset=await post(local,form);assert.equal(asset.sha256,result.sha256);assert.equal(asset.type,'video/mp4');
  await assert.rejects(stat(result.path),{code:'ENOENT'});
  const saved=await fetch(local.origin+'/api/assets/'+asset.id,{headers:headers(local)});assert.equal(digest(Buffer.from(await saved.arrayBuffer())),result.sha256);
  assert.equal((await post(local,form)).id,asset.id,'response-loss retry works after deleting temporary render');
  assert.deepEqual(await readFile(join(old,'output.mp4')),bytes);assert.deepEqual(await readFile(source),bytes);
  }finally{await local.close();store.close();}
});
test('render cleanup callback cannot run until destination and source checksums match',async t=>{
  const root=await fixture(t),source=join(root,'new.mp4'),dest=join(root,'stored.mp4'),bytes=await clip(source),registry=assetCompression();let cleaned=0;
  const result={path:source,sha256:digest(bytes),size:bytes.length,type:'video/mp4'};
  const token=registry.register(result,()=>{cleaned++;});await writeFile(dest,'corrupt');
  await assert.rejects(registry.stored(token,dest,{sha256:result.sha256}),/checksum/);assert.equal(cleaned,0);assert.deepEqual(await readFile(source),bytes);
  await writeFile(dest,bytes);await registry.stored(token,dest,{id:'stored',sha256:result.sha256});assert.equal(cleaned,1);
});
test('legacy asset bytes/hash survive new compressed upload and server restart',async t=>{
  const root=await fixture(t),source=join(root,'old.mp4'),bytes=await clip(source),sha256=digest(bytes),seed=join(root,'seed.json');
  const data={key:'local-owner/legacy.mp4',name:'legacy.mp4',type:'video/mp4',size:bytes.length,sha256,metadata:{width:720,height:1280,duration:1,verifiedBy:'container'}};
  await writeFile(seed,JSON.stringify({records:[{id:'legacy',kind:'asset',revision:1,updatedAt:1,data}],media:[{key:data.key,base64:bytes.toString('base64')}]}));
  let local=await startLocalServer({root:join(root,'workspace'),seedPath:seed});
  try{
    const form=new FormData();form.set('file',new File([bytes],'new.mp4',{type:'video/mp4'}));const uploaded=await post(local,form);assert.ok(uploaded.compression);
    await local.close();local=await startLocalServer({root:join(root,'workspace'),seedPath:seed});
    const response=await fetch(local.origin+'/api/assets/legacy',{headers:headers(local)});assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    const records=await (await fetch(local.origin+'/api/lab',{headers:headers(local)})).json();assert.equal(records.records.find(r=>r.id==='legacy').data.sha256,sha256);assert.equal(records.records.find(r=>r.id==='legacy').data.compression,undefined);
  }finally{await local.close();}
});
test('new Muse download fixture compresses before publishing; existing download is byte-identical',async t=>{
  const root=await fixture(t),source=join(root,'input.png');
  await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=800x800','-frames:v','1',source]);const bytes=await readFile(source);
  let compression;const download={saveAs:path=>writeFile(path,bytes),failure:async()=>null,delete:async()=>{}};
  const path=await saveDownload(download,join(root,'new.png'),{compress:true,onCompression:value=>{compression=value;}});
  assert.ok(path.endsWith('.webp'));assert.ok((await stat(path)).size<bytes.length);assert.equal(digest(await readFile(path)),compression.sha256);await assert.rejects(stat(join(root,'new.png')),{code:'ENOENT'});
  const legacy=join(root,'legacy.png');await writeFile(legacy,bytes);let called=false;
  assert.equal(await saveDownload(download,legacy,{compress:true,onCompression:()=>{called=true;}}),legacy);assert.equal(called,false);assert.deepEqual(await readFile(legacy),bytes);
});
test('short clip impossible cap fails without touching original; tool timeout terminates',async t=>{
  const root=await fixture(t),path=join(root,'short.mp4'),bytes=await clip(path);
  await assert.rejects(compressMedia(path,{maxBytes:100,forceEncode:true}),/Không nén được/);assert.deepEqual(await readFile(path),bytes);
  await assert.rejects(runMediaTool(process.execPath,['-e','setTimeout(()=>{},10000)'],100),/quá thời gian|không xử lý/);
});
