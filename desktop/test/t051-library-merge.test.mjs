import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {libraryMerger} from '../local/library-merge.mjs';
import {productionSchema} from '../../lib/lab/production.ts';
import {mediaCatalog} from '../../lib/lab/media-catalog.ts';
import {originalMedia} from '../../lib/lab/library-compare.ts';
import {concatLibraryClips} from '../src/media.mjs';
import {captureMediaTool,probeMedia} from '../src/compress.mjs';
import {libraryFixture,digest} from './fixtures/t051-library.mjs';
import {startLocalServer,sessionCookie} from './helpers/local-server.mjs';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'t051-')),f=await libraryFixture(root),db=new DatabaseSync(join(root,'fixture.sqlite'));
 t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});
 db.exec('CREATE TABLE lab_records(owner_id TEXT,id TEXT,kind TEXT,data TEXT,revision INTEGER,created_at INTEGER,updated_at INTEGER,PRIMARY KEY(owner_id,id))');
 for(const r of f.records)db.prepare('INSERT INTO lab_records VALUES(?,?,?,?,?,?,?)').run('local-owner',r.id,r.kind,JSON.stringify(r.data),r.revision,r.updatedAt,r.updatedAt);
 const filePath=key=>join(root,'media',key),bucket={put:async(key,bytes)=>{await mkdir(join(root,'media/local-owner'),{recursive:true});await writeFile(filePath(key),bytes,{flag:'wx'});},delete:key=>rm(filePath(key),{force:true})};
 for(const m of f.media)await bucket.put(m.key,Buffer.from(m.base64,'base64'));
 const options={db,root,filePath,bucket,productionSchema};return {...f,...options,library:libraryMerger(options)};
}
test('T-051 concat mixed frames and missing audio preserves originals, duration, order and saved provenance',async t=>{
 const f=await fixture(t),oldRows=f.db.prepare('SELECT * FROM lab_records ORDER BY id').all();
 const result=await f.library.merge(f.input),asset=JSON.parse(f.db.prepare('SELECT data FROM lab_records WHERE id=?').get(result.assetId).data),path=f.filePath(asset.key),p=await probeMedia(path);
 const sum=f.records.filter(r=>r.kind==='asset').reduce((s,r)=>s+r.data.metadata.duration,0);
 assert.ok(Math.abs(p.duration-sum)<=.1);assert.deepEqual([p.width,p.height],[720,1280]);assert.equal(p.audio.length,1);
 await captureMediaTool('ffmpeg',['-v','error','-xerror','-i',path,'-map','0:v:0','-map','0:a:0','-f','null','-']);
 // Decode color at each segment center; a successful concat with wrong order fails.
 let start=0;for(const [i,m] of f.records.filter(r=>r.kind==='asset').entries()){
  const frame=join(f.root,'pixel'+i+'.rgb');await captureMediaTool('ffmpeg',['-v','error','-ss',String(start+m.data.metadata.duration/2),'-i',path,'-frames:v','1','-vf','crop=2:2:iw/2:ih/2,scale=1:1','-pix_fmt','rgb24','-f','rawvideo',frame]);
  const rgb=await readFile(frame),channel=[0,2,1][i];assert.ok(rgb[channel]>rgb[(channel+1)%3]+50);start+=m.data.metadata.duration;
 }
 const audio=join(f.root,'silent.pcm');await captureMediaTool('ffmpeg',['-v','error','-ss','1.3','-t','0.7','-i',path,'-map','0:a','-f','s16le','-ac','1',audio]);
 const pcm=await readFile(audio);assert.ok(pcm.length>1000);assert.ok([...pcm].every(v=>v===0),'silent middle clip');
 const project=JSON.parse(f.db.prepare('SELECT data FROM lab_records WHERE id=?').get('project').data),merged=productionSchema.parse(project).scenes.at(-1);
 assert.equal(merged.libraryMerge,true);assert.deepEqual(merged.takes[0].merge.sources.map(s=>s.silent),[false,true,false]);assert.equal(merged.takes[0].review,'pending');assert.deepEqual(project.scenes.slice(0,3),f.records.at(-1).data.scenes);
 for(const old of oldRows.filter(r=>r.kind!=='production'))assert.deepEqual(f.db.prepare('SELECT * FROM lab_records WHERE id=?').get(old.id),old);
 for(const m of f.media)assert.equal(digest(await readFile(f.filePath(m.key))),digest(Buffer.from(m.base64,'base64')));
 const duplicate=await libraryMerger(f).merge(f.input);assert.equal(duplicate.assetId,result.assetId);assert.equal(duplicate.reused,true);assert.equal(f.db.prepare("SELECT count(*) n FROM lab_records WHERE kind='asset'").get().n,4);
 await assert.rejects(f.library.merge({...f.input,name:'Khác'}),/Mã ghép/);
});
test('T-051 malformed selection, foreign project, path names and changed source bytes cannot write',async t=>{
 const f=await fixture(t),before=f.db.prepare('SELECT * FROM lab_records').all();
 for(const input of [{...f.input,clips:[]},{...f.input,clips:[f.input.clips[0],f.input.clips[0]]},{...f.input,clips:[f.input.clips[0],{sceneId:'foreign',takeId:'take2'}]},{...f.input,name:'../overwrite.mp4'},{...f.input,name:'CON.mp4'}])await assert.rejects(f.library.merge(input));
 await writeFile(f.filePath(f.media[0].key),Buffer.alloc(Buffer.from(f.media[0].base64,'base64').length));await assert.rejects(f.library.merge(f.input),/Hash/);
 assert.deepEqual(f.db.prepare('SELECT * FROM lab_records').all(),before);
});
test('T-051 reordered first clip determines the output frame without changing source duration',async t=>{
 const f=await fixture(t),input={...f.input,clips:[f.input.clips[1],f.input.clips[0]]};
 const result=await f.library.merge(input),asset=JSON.parse(f.db.prepare('SELECT data FROM lab_records WHERE id=?').get(result.assetId).data),probe=await probeMedia(f.filePath(asset.key));
 assert.deepEqual([probe.width,probe.height],[320,320]);assert.ok(Math.abs(probe.duration-(f.records[0].data.metadata.duration+f.records[1].data.metadata.duration))<=.1);
 const project=JSON.parse(f.db.prepare("SELECT data FROM lab_records WHERE id='project'").get().data);
 assert.deepEqual(project.scenes.at(-1).takes[0].merge.sources.map(s=>s.assetId),['clip1','clip0']);
});
test('T-051 project conflict rolls back asset, keeps concurrent edit and releases render lock',async t=>{
 const f=await fixture(t);let calls=0;
 const library=libraryMerger({...f,render:async(...args)=>{calls++;const result=await concatLibraryClips(...args);f.db.prepare("UPDATE lab_records SET revision=revision+1 WHERE id='project'").run();return result;}});
 const first=library.merge(f.input),same=library.merge(f.input);await assert.rejects(library.merge({...f.input,requestId:'another'}),/Đang ghép/);
 const results=await Promise.allSettled([first,same]);assert.ok(results.every(r=>r.status==='rejected'&&/vừa thay đổi/.test(r.reason.message)));assert.equal(calls,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM lab_records WHERE kind='asset'").get().n,3);assert.equal(f.db.prepare("SELECT revision FROM lab_records WHERE id='project'").get().revision,2);
 assert.equal((await readdir(join(f.root,'media/local-owner'))).length,3);
 await f.library.merge({...f.input,requestId:'after-conflict'});
});
test('T-051 explicit retry link resolves result variants; missing source is honest, unrelated videos have no comparison',async t=>{
 const f=await fixture(t),catalog=mediaCatalog(f.records),result=catalog.find(e=>e.take.assetId==='clip1');
 assert.equal(originalMedia(result,catalog,f.jobs).entry.take.assetId,'clip0');
 const alternative={...result,take:{...result.take,id:'alternate',assetId:'alternate'}};assert.equal(originalMedia(alternative,catalog,f.jobs).entry.take.assetId,'clip0');
 assert.equal(originalMedia(result,catalog.filter(e=>e.take.assetId!=='clip0'),f.jobs).entry,null);
 assert.equal(originalMedia(result,catalog,f.jobs.filter(j=>j.id!=='job0')).entry,null);
 assert.equal(originalMedia(catalog.find(e=>e.take.assetId==='clip2'),catalog,f.jobs),null);
});
test('T-051 HTTP local merge requires session and same origin, saves new asset and survives reload',async t=>{
 const root=await mkdtemp(join(tmpdir(),'t051-http-')),f=await libraryFixture(root),local=await startLocalServer({root:join(root,'workspace'),seedPath:f.seedPath});
 t.after(async()=>{await local.close();await rm(root,{recursive:true,force:true});});
 const request=headers=>fetch(local.origin+'/api/library/merge',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(f.input)});
 assert.equal((await request({Origin:local.origin})).status,401);const cookie=`${sessionCookie}=${local.session}`;
 assert.equal((await request({Cookie:cookie,Origin:'https://invalid.example'})).status,403);assert.equal((await request({Cookie:cookie})).status,403);
 const response=await request({Cookie:cookie,Origin:local.origin});assert.equal(response.status,200);const result=await response.json();
 const saved=await fetch(local.origin+'/api/assets/'+result.assetId,{headers:{Cookie:cookie}});assert.equal(saved.status,200);assert.equal(digest(Buffer.from(await saved.arrayBuffer())),result.sha256);
 assert.equal((await (await request({Cookie:cookie,Origin:local.origin})).json()).assetId,result.assetId);
});
