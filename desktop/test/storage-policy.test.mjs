import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat,readdir,utimes,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {putImmutableMedia,digest,saveDownload,maintainStorage,assertDiskSpace,rotateLog} from '../src/storage-policy.mjs';
import {startLocalServer,sessionCookie} from './helpers/local-server.mjs';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
async function fixture(run){const root=await mkdtemp(join(tmpdir(),'hermes-storage-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}

test('immutable media uses one physical file, keeps independent paths and rejects overwrite',()=>fixture(async root=>{
 const bytes=Buffer.from('one immutable result'),first=join(root,'first.mp4'),second=join(root,'second.mp4');
 await putImmutableMedia({root,path:first,bytes});await putImmutableMedia({root,path:second,bytes,candidates:[first]});
 assert.equal((await stat(first)).ino,(await stat(second)).ino);assert.equal((await stat(first)).nlink,2);
 await assert.rejects(putImmutableMedia({root,path:first,bytes:Buffer.from('different')}),/nội dung khác/);
 await rm(first);assert.deepEqual(await readFile(second),bytes);
 assert.deepEqual(await readdir(root),['second.mp4']);
}));
test('download verifies target, removes browser artifact and temp; changed download preserves old result',()=>fixture(async root=>{
 let removed=0;const path=join(root,'result.mp4');const download={saveAs:p=>writeFile(p,'valid result'),failure:async()=>null,delete:async()=>{removed++;}};
 await saveDownload(download,path);assert.equal(await readFile(path,'utf8'),'valid result');assert.ok(removed>0);
 await saveDownload(download,path);assert.deepEqual(await readdir(root),['result.mp4']);
 await assert.rejects(saveDownload({...download,saveAs:p=>writeFile(p,'changed')},path),/khác bản đã lưu/);
 assert.equal(await readFile(path,'utf8'),'valid result');assert.deepEqual(await readdir(root),['result.mp4']);
 await assert.rejects(saveDownload({...download,failure:async()=> 'network'},join(root,'failed.mp4')),/Tải file/);
 assert.deepEqual(await readdir(root),['result.mp4']);
}));
test('startup cleanup preserves active/recent/referenced/unknown files and SQLite',()=>fixture(async root=>{
 await mkdir(join(root,'outputs'));
 const stale=join(root,'outputs','x.mp4.hermes-part-'+'a'.repeat(36)),active=join(root,'outputs','y.mp4.hermes-part-'+'b'.repeat(36)),recent=join(root,'outputs','z.mp4.hermes-part-'+'c'.repeat(36));
 for(const file of [stale,active,recent,join(root,'outputs','unknown.tmp'),join(root,'worker.sqlite')])await writeFile(file,'keep');
 await utimes(stale,0,0);await utimes(active,0,0);
 const store={get:(_k,f)=>f,jobs:()=>[{failedFilePath:active}]};
 const removed=await maintainStorage(root,store);assert.deepEqual(removed.map(r=>r.path),[stale]);
 for(const file of [active,recent,join(root,'outputs','unknown.tmp'),join(root,'worker.sqlite')])assert.equal(await readFile(file,'utf8'),'keep');
}));
test('low disk pauses queued dispatch without altering submitted receipts',()=>fixture(async root=>{
 const store=new Store(join(root,'worker.sqlite'));try{
 const worker=new Worker(store,root,{},{});const request={references:[]};
 const q=store.enqueue(request,'q').job,s=store.enqueue(request,'s').job;store.put({...s,state:'submitted',providerId:'remote-receipt'});
 worker.diskStatus=()=>({blocked:true,message:'Ổ đĩa thiếu dung lượng'});worker.paused=false;worker.approvedIds=[q.id];worker.tick();
 assert.equal(worker.paused,true);assert.equal(store.job(q.id).state,'queued');assert.equal(store.job(s.id).providerId,'remote-receipt');assert.equal(store.job(s.id).state,'submitted');
 assert.throws(()=>assertDiskSpace(root,100,{minFreeBytes:200},()=>({bsize:1,bavail:250})),{code:'STORAGE_LOW'});
 }finally{store.close();}
}));
test('log rotation bounds regenerable logs and preserves latest files',()=>fixture(async root=>{
 const path=join(root,'maintenance.log');for(let i=0;i<5;i++){await writeFile(path,String(i).repeat(30));await rotateLog(path,{maxBytes:20,keep:2});}
 assert.deepEqual((await readdir(root)).sort(),['maintenance.log.1','maintenance.log.2']);assert.equal(await readFile(path+'.1','utf8'),'4'.repeat(30));
}));
test('real local upload retries keep one record and independent jobs share bytes across restart',()=>fixture(async root=>{
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7V8AAAAASUVORK5CYII=','base64');
 let local=await startLocalServer({root,seedPath:join(root,'none.json')});
 try{
 const upload=async command=>{const f=new FormData();f.set('file',new File([bytes],'test.png',{type:'image/png'}));if(command)f.set('commandId',command);const r=await fetch(local.origin+'/api/assets',{method:'POST',headers:{Cookie:sessionCookie+'='+local.session,Origin:local.origin},body:f});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 const [a,b]=await Promise.all([upload(),upload()]);assert.equal(a.id,b.id);
 const c=await upload('different_job');assert.notEqual(c.id,a.id);
 const files=await readdir(join(root,'media/local-owner'));assert.equal(files.length,2);const info=await Promise.all(files.map(f=>stat(join(root,'media/local-owner',f))));assert.equal(info[0].ino,info[1].ino);
 await local.close();local=await startLocalServer({root,seedPath:join(root,'none.json')});assert.equal((await upload()).id,a.id);
 const original=await fetch(local.origin+'/api/assets/'+a.id,{headers:{Cookie:sessionCookie+'='+local.session}});assert.equal(digest(Buffer.from(await original.arrayBuffer())),digest(bytes));
 }finally{await local.close();}
}));
