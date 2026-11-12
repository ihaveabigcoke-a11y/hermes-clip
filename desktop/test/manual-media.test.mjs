import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile, readdir, copyFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Store} from '../src/store.mjs';
import {ManualMedia, probeManualMedia} from '../src/manual-media.mjs';
import {startLocalServer, importModule} from './helpers/local-server.mjs';

const {emptyProduct}=await importModule('lib/lab/domain.ts');
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'hermes-t002-'));
  const store=new Store(join(root,'worker.sqlite'));
  const local=await startLocalServer({root:join(root,'workspace'),seedPath:join(root,'no-seed.json'),workerStore:store});
  const media=new ManualMedia({store,local});
  t.after(async()=>{await media.close();await local.close();store.close();await rm(root,{recursive:true,force:true});});
  const post=async(path,body)=>(await media.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  await post('/api/lab',{id:'product_fixture',kind:'product',revision:0,data:{...emptyProduct,name:'Manual test product'}});
  let project=(await post('/api/production',{id:'project_fixture',revision:0,commandId:'create',action:'create',input:{name:'T-002 fixture',productId:'product_fixture',locale:'en-US'}})).record;
  let sequence=0;
  const command=async(action,input)=>{
    project=(await media.records()).find(row=>row.id===project.id);
    return (await post('/api/production',{id:project.id,revision:project.revision,commandId:'command_'+(++sequence),action,input})).record;
  };
  for(const id of ['one','two']) {
    await command('scene',{id,name:'Scene '+id,prompt:'Show the product in a softly lit studio.',mediaType:'video',ratio:'9:16',duration:8,referenceIds:[]});
    if(id==='one')await command('storyboard',{sceneId:id});
  }
  await media.configure({inbox:join(root,'inbox')});
  const scene=async id=>(await media.status()).scenes.find(row=>row.sceneId===id);
  const clip=async(name,{size='90x160',color='red',duration=1}={})=>{
    const path=join(media.inbox(),name);
    execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=${color}:s=${size}:r=10`,'-t',String(duration),'-c:v','libx264','-pix_fmt','yuv420p',path],{windowsHide:true,stdio:'inherit'});
    return path;
  };
  return {root,store,local,media,command,scene,clip};
}

test('manual pack contains approved scenes, English instructions, exact pinned reference bytes and durable codes',async t=>{
  const f=await fixture(t), {media,command,scene}=f;
  const png=join(f.root,'reference.png');
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=90x160','-frames:v','1',png],{windowsHide:true,stdio:'inherit'});
  const bytes=await readFile(png), form=new FormData();form.append('file',new File([bytes],'ref.png',{type:'image/png'}));
  const asset=await (await media.request('/api/assets',{method:'POST',body:form})).json();
  await command('reference',{id:'ref',name:'Product',role:'product',assetId:asset.id,sourceUrl:'',notes:'Keep the blue finish.'});
  await command('scene',{id:'one',name:'Scene one',prompt:'Show the product in a softly lit studio.',ratio:'9:16',duration:8,mediaType:'video',referenceIds:['ref']});
  await command('storyboard',{sceneId:'one'});
  const code=(await scene('one')).code;
  await assert.rejects(media.assertMuseScene({projectId:'project_fixture',sceneId:'one',sceneRevision:1,productRevision:1}),/chưa chọn nhà cung cấp Muse/);
  assert.match(code,/^P\d+-S\d+$/);
  const pack=await media.exportPack({projectId:'project_fixture'},new Date(2026,10,12,19,5));
  assert.equal(pack.path,join(f.local.root,'exports','prompt-packs','P1-20261112-1905'));
  assert.deepEqual((await readdir(pack.path)).sort(),[`${code}-ref-1.png`,`${code}.txt`,'README-VI.txt'].sort());
  const prompt=await readFile(join(pack.path,`${code}.txt`),'utf8');
  assert.match(prompt,/9:16/);assert.match(prompt,/8 seconds/);assert.match(prompt,/Show the product/);assert.match(prompt,/Keep the blue finish/);
  assert.deepEqual(await readFile(join(pack.path,`${code}-ref-1.png`)),bytes);
  assert.match(await readFile(join(pack.path,'README-VI.txt'),'utf8'),/Flow\/Gemini/);
  assert.equal((await scene('one')).state,'Đã xuất');
  await media.waitForFiles({projectId:'project_fixture'});assert.equal((await scene('one')).state,'Chờ file');
  await assert.rejects(media.exportPack({projectId:'project_fixture'},new Date(2026,10,12,19,5)),/Đã có gói/);
  const reopened=new ManualMedia({store:f.store,local:f.local});
  assert.equal((await reopened.status()).scenes.find(row=>row.sceneId==='one').code,code);
  await command('scene',{id:'one',name:'Edited',prompt:'Show a close-up.',referenceIds:[]});
  assert.equal((await scene('one')).state,'Chờ xuất prompt');
  await assert.rejects(media.exportPack({projectId:'project_fixture'}),/Duyệt/);
});

test('real FFmpeg MP4 is matched, imported once across duplicate names and restart; unknown codes stay unassigned',async t=>{
  const f=await fixture(t),{media,scene,clip}=f;
  const code=(await scene('one')).code, path=await clip(`${code}-x.mp4`), original=await readFile(path);
  await media.scan();assert.equal(media.receipts().length,0,'first observation must wait for a stable file');
  await media.scan();
  let receipt=media.receipts()[0];assert.equal(receipt.state,'received');assert.equal(receipt.sceneId,'one');
  assert.equal(receipt.metadata.width,90);assert.equal(receipt.metadata.height,160);assert.equal(receipt.metadata.duration,1);
  assert.match(receipt.sha256,/^[a-f0-9]{64}$/);assert.ok(receipt.commandId);
  assert.equal((await scene('one')).state,'Đã nhận');
  await copyFile(path,join(media.inbox(),`${code}-take2.mp4`));await media.scan();await media.scan();
  const restarted=new ManualMedia({store:f.store,local:f.local});await restarted.scan();await restarted.scan();
  const project=(await media.records()).find(row=>row.id==='project_fixture');
  assert.equal(project.data.scenes.find(row=>row.id==='one').takes.length,1);
  assert.equal(project.data.scenes.find(row=>row.id==='one').takes[0].review,'pending');
  assert.ok(project.data.receipts.includes(receipt.commandId));assert.equal(media.receipts().length,1);
  assert.deepEqual(await readFile(path),original,'original file must remain unchanged');
  await clip('P999-S99-unknown.mp4',{size:'160x90',color:'blue'});await restarted.scan();await restarted.scan();
  const unmatched=(await restarted.status()).unmatched;assert.equal(unmatched.length,1);assert.match(unmatched[0].warning,/Sai tỷ lệ 9:16/);
  assert.equal(unmatched[0].state,'unmatched');
  await restarted.assign({sha256:unmatched[0].sha256,projectId:'project_fixture',sceneId:'two'});
  assert.equal((await restarted.status()).unmatched.length,0);
  const saved=(await media.records()).find(row=>row.id==='project_fixture').data.scenes.find(row=>row.id==='two');
  assert.equal(saved.takes.length,1);assert.match(saved.takes[0].notes,/Tỷ lệ 160×90 khác 9:16/);
  await assert.rejects(restarted.assign({sha256:unmatched[0].sha256,projectId:'project_fixture',sceneId:'one'}),/cảnh khác/);
});

test('manual watcher survives changing/invalid files, respects provider selection, and receives images',async t=>{
  const f=await fixture(t),{media,scene,clip,command}=f;
  const code=(await scene('one')).code;
  const path=await clip(`${code}-changing.mp4`);await media.scan();
  await clip(`${code}-changing.mp4`,{color:'green',duration:2});await media.scan();
  assert.equal(media.receipts().length,0);await media.scan();assert.equal(media.receipts().length,1);
  await writeFile(join(media.inbox(),`${code}-broken.mp4`),'not a video');await media.scan();await media.scan();
  assert.equal(media.receipts().length,1);assert.equal((await media.status()).errors.length,1);
  await assert.rejects(command('media_provider',{provider:'fal'}),/báo giá/);
  await assert.rejects(command('media_provider',{provider:'grok-cli'}),/chưa kiểm/);
  await assert.rejects(command('media_provider',{sceneId:'two',provider:'muse'}),/Muse đang tạm dừng/);
  f.store.set('muse_paused',false); // Explicit local fixture opt-in; no worker or browser is running.
  await command('media_provider',{sceneId:'two',provider:'muse'});
  f.store.set('muse_paused',true);
  const two=(await scene('two')).code;await clip(`${two}-muse.mp4`,{color:'yellow'});await media.scan();await media.scan();
  assert.equal((await media.status()).unmatched.length,1);
  await command('media_provider',{provider:'manual'});
  assert.equal((await media.records()).find(row=>row.id==='project_fixture').data.scenes.find(row=>row.id==='two').mediaProvider,undefined);
  const imagePath=join(media.inbox(),`${two}-image.png`);
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=white:s=90x160','-frames:v','1',imagePath],{windowsHide:true,stdio:'inherit'});
  await media.scan();await media.scan();
  const imageReceipt=media.receipts().find(row=>row.name.endsWith('.png'));
  assert.equal(imageReceipt.state,'received');assert.equal(imageReceipt.metadata.duration,null);
  assert.equal((await probeManualMedia(path)).type,'video/mp4');
  assert.ok((await stat(path)).size);
});

test('manual import reconciles a committed take after the receipt response is lost',async t=>{
  const f=await fixture(t),{media,scene,clip}=f;
  const code=(await scene('one')).code;await clip(`${code}-receipt.mp4`);
  const save=media.saveReceipt.bind(media);let lose=true;
  media.saveReceipt=row=>{if(lose&&row.state==='received'){lose=false;throw Error('Fixture crash after API commit');}return save(row);};
  await media.scan();await media.scan();
  assert.equal(media.receipts()[0].state,'unmatched');
  const restarted=new ManualMedia({store:f.store,local:f.local});await restarted.scan();await restarted.scan();
  assert.equal(restarted.receipts()[0].state,'received');
  const project=(await media.records()).find(row=>row.id==='project_fixture');
  assert.equal(project.data.scenes.find(row=>row.id==='one').takes.length,1);
});

test('running inbox monitor discovers a dropped MP4 in the configured folder without a renderer',async t=>{
  const f=await fixture(t), code=(await f.scene('one')).code;
  await f.media.configure({inbox:join(f.root,'configured-inbox')});
  assert.equal(new ManualMedia({store:f.store,local:f.local}).inbox(),join(f.root,'configured-inbox'));
  f.media.start();
  const path=await f.clip(`${code}-watcher.mp4`,{duration:8});
  const deadline=Date.now()+12000;
  while(!f.media.receipts().some(row=>row.state==='received')&&Date.now()<deadline)await delay(100);
  assert.equal(f.media.receipts().length,1);
  assert.equal(f.media.receipts()[0].state,'received');assert.equal(f.media.receipts()[0].sceneId,'one');
  assert.ok((await stat(path)).isFile());
  await f.media.close();
});
