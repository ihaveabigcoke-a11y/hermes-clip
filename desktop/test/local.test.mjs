import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {startLocalServer,sessionCookie} from '../local/server.mjs';
import {emptyProduct} from '../local-dist/server/lib/lab/domain.mjs';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {assertSender} from '../src/contracts.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {initializeMuseConnection,MUSE_START_URL} from '../src/defaults.mjs';

test('WebP upload reads signature at byte offsets when RIFF size contains UTF-8 byte sequences',async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-lab-webp-'));
  let server;
  try {
    const image=Buffer.from('UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoQABAAAgA0JaACdLoAA5gA/vmTb/+QH/+QH/+QH/8gP+IXeyAwAA==','base64');
    const bytes=Buffer.alloc(39666);
    image.copy(bytes);
    bytes.writeUInt32LE(bytes.length-8,4);
    bytes.write('JUNK',image.length,'ascii');
    bytes.writeUInt32LE(bytes.length-image.length-8,image.length+4);
    server=await startLocalServer({root,seedPath:join(root,'missing-seed.json')});
    const form=new FormData();
    form.append('file',new File([bytes],'muse-result.webp',{type:'image/webp'}));
    const response=await fetch(server.origin+'/api/assets',{method:'POST',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin},body:form});
    assert.equal(response.status,200);
    const asset=await response.json();
    assert.equal(asset.type,'image/webp');
    assert.equal(asset.metadata.width,16);
    assert.equal(asset.metadata.height,16);
    assert.equal(asset.sha256,createHash('sha256').update(bytes).digest('hex'));
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});

test('local HTTP workspace persists canonical records and media across restart, with cookie/host/origin checks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-lab-local-'));let server;
  try {
    server=await startLocalServer({root,seedPath:join(root,'missing-seed.json')});
    const request=(path,{method='GET',json,form,cookie=true,origin,extra={}}={})=>fetch(server.origin+path,{method,headers:{...(cookie?{Cookie:sessionCookie+'='+server.session}:{}),...(['GET','HEAD'].includes(method)?{}:{Origin:origin??server.origin}),...(json?{'Content-Type':'application/json'}:{}),...extra},...(json?{body:JSON.stringify(json)}:form?{body:form}:{})});
    assert.equal((await request('/api/lab',{cookie:false})).status,401);
    const rebound=await new Promise((yes,no)=>{const r=httpRequest(server.origin+'/api/lab',{headers:{Host:'rebinding.invalid',Cookie:sessionCookie+'='+server.session}},response=>{response.resume();yes(response.statusCode);});r.on('error',no);r.end();});
    assert.equal(rebound,403);
    assert.equal((await request('/api/lab',{extra:{Origin:'https://foreign.invalid'}})).status,403);
    assert.equal((await request('/api/lab',{method:'POST',json:{},origin:'https://foreign.invalid'})).status,403);
    assert.equal((await fetch(server.origin+'/api/lab',{method:'POST',headers:{Cookie:sessionCookie+'='+server.session,'Content-Type':'application/json'},body:'{}'})).status,403);
    const index=await request('/');assert.equal(index.status,200);assert.match(await index.text(),/assets\/index-.*\.js/);
    assert.equal((await request('/../../local/server.mjs')).status,404);
    const created=await request('/api/lab',{method:'POST',json:{id:'local_product',kind:'product',revision:0,data:{...emptyProduct,name:'LOCAL QA',price:30,cost:8}}});assert.equal(created.status,200);
    const project=await request('/api/production',{method:'POST',json:{id:'local_project',revision:0,commandId:'local_create',action:'create',input:{name:'Local QA',productId:'local_product',locale:'en-US'}}});assert.equal(project.status,200);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7V8AAAAASUVORK5CYII=','base64');
    const form=new FormData();form.append('file',new File([png],'test.png',{type:'image/png'}));
    const upload=await request('/api/assets',{method:'POST',form});assert.equal(upload.status,200);const asset=await upload.json();assert.equal(asset.metadata.width,1);
    const range=await request('/api/assets/'+asset.id,{extra:{Range:'bytes=8-15'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),png.subarray(8,16));
    const before=(await (await request('/api/lab')).json()).records;assert.equal(before.length,3);
    await server.close();server=await startLocalServer({root,seedPath:join(root,'missing-seed.json')});
    const after=(await (await request('/api/lab')).json()).records;assert.deepEqual(after,before);
    assert.deepEqual(Buffer.from(await (await request('/api/assets/'+asset.id)).arrayBuffer()),png);
    assert.equal((await request('/api/assistant')).status,200);
    assert.equal((await (await request('/api/assistant')).json()).connected,false);
  } finally {await server?.close();await rm(root,{recursive:true,force:true});}
});

test('IPC accepts only the bound local origin and its top-level frame',()=>{
  const local='http://127.0.0.1:41234';
  assert.doesNotThrow(()=>assertSender(local+'/?view=accounts',true,local));
  assert.throws(()=>assertSender(local,false,local));
  assert.throws(()=>assertSender('http://127.0.0.1:41235',true,local));
  assert.throws(()=>assertSender('https://foreign.invalid',true,local));
  assert.throws(()=>assertSender('http://localhost:41234',true,'http://localhost:41234'));
});

test('local Studio creates six templates atomically and preserves edits on retry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-lab-briefs-'));let server;
  try {
    server=await startLocalServer({root});
    const request=(path,json)=>fetch(server.origin+path,{method:json?'POST':'GET',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin,'Content-Type':'application/json'},...(json?{body:JSON.stringify(json)}:{})});
    const data={name:'QA Treat Trader',productId:'local_qa_product',market:'US',hypothesis:'QA template creation',offerUrl:'',status:'draft',targetSessions:100,decision:'pending',decisionNotes:'',archived:false};
    assert.equal((await request('/api/lab',{id:'qa_experiment',kind:'experiment',revision:0,data})).status,200);
    let response=await request('/api/briefs',{experimentId:'qa_experiment'});
    assert.equal(response.status,200);
    const first=(await response.json()).records;
    assert.equal(first.length,6);
    const changed={...first[0],data:{...first[0].data,name:'User-edited concept'}};
    assert.equal((await request('/api/lab',changed)).status,200);
    response=await request('/api/briefs',{experimentId:'qa_experiment'});
    assert.equal(response.status,200);
    const second=(await response.json()).records;
    assert.equal(second.length,6);
    assert.equal(second.find(r=>r.id===changed.id).data.name,'User-edited concept');
    assert.equal((await (await request('/api/lab')).json()).records.filter(r=>r.kind==='creative').length,6);
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});

test('bundled QA workspace seeds once and never replaces later edits',async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-lab-seed-'));let server;
  try {
    server=await startLocalServer({root});
    const records=async()=>await (await fetch(server.origin+'/api/lab',{headers:{Cookie:sessionCookie+'='+server.session}})).json();
    const first=(await records()).records,product=first.find(r=>r.kind==='product'),project=first.find(r=>r.kind==='production');
    assert.equal(product.data.sampleVerified,false);
    const image=first.find(r=>r.kind==='asset');
    const imageBytes=Buffer.from(await (await fetch(server.origin+'/api/assets/'+image.id,{headers:{Cookie:sessionCookie+'='+server.session}})).arrayBuffer());
    assert.equal(image.data.sha256,createHash('sha256').update(imageBytes).digest('hex'));
    assert.equal(image.data.metadata.width,820);
    assert.equal(image.data.metadata.height,550);
    assert.equal(project.data.scenes.length,4);
    assert.deepEqual(project.data.scenes.map(s=>s.duration),[3,3,3,3]);
    assert.ok(project.data.scenes.every(s=>!s.storyboardApproved&&!s.attempts.length&&!s.takes.length));
    const updated=await fetch(server.origin+'/api/lab',{method:'POST',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin,'Content-Type':'application/json'},body:JSON.stringify({...product,data:{...product.data,name:'Local edit to retain'}})});
    assert.equal(updated.status,200);
    await server.close();server=await startLocalServer({root});
    assert.equal((await records()).records.find(r=>r.id===product.id).data.name,'Local edit to retain');
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});

test('existing legacy reference assets gain metadata once while retaining user fields',async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-lab-legacy-'));let server;
  try {
    server=await startLocalServer({root});
    await server.close();server=null;
    const db=new DatabaseSync(join(root,'workspace.sqlite'));
    const row=db.prepare("SELECT * FROM lab_records WHERE kind='asset'").get();
    const data=JSON.parse(row.data);
    delete data.metadata;delete data.sha256;data.name='User reference name.png';
    db.prepare('UPDATE lab_records SET data=? WHERE id=?').run(JSON.stringify(data),row.id);
    db.close();
    server=await startLocalServer({root});
    const records=async()=>await (await fetch(server.origin+'/api/lab',{headers:{Cookie:sessionCookie+'='+server.session}})).json();
    const migrated=(await records()).records.find(r=>r.id===row.id);
    assert.equal(migrated.data.name,'User reference name.png');
    assert.match(migrated.data.sha256,/^[a-f0-9]{64}$/);
    assert.equal(migrated.data.metadata.width,820);
    assert.equal(migrated.revision,row.revision+1);
    await server.close();server=await startLocalServer({root});
    assert.deepEqual((await records()).records.find(r=>r.id===row.id),migrated);
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});

test('Muse login uses the chosen URL; changing domains disables an old flow instead of guessing a service',async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-lab-muse-url-')),store=new Store(join(root,'worker.sqlite'));
  try {
    const worker=new Worker(store,root,{},{});
    await assert.rejects(()=>worker.openProfile('profile1'),/Trang Muse/);
    initializeMuseConnection(worker);
    assert.equal(worker.connection().startUrl,MUSE_START_URL);
    assert.equal(worker.status().generationReady,false);
    assert.equal(worker.config(),null);
    assert.throws(()=>worker.saveMuseConnection({startUrl:'http://muse.invalid'}));
    assert.throws(()=>worker.saveMuseConnection({startUrl:'https://user:secret@muse.invalid'}));
    worker.saveMuseConnection({startUrl:'https://chosen-muse.invalid/create'});
    const flow={enabled:true,startUrl:'https://chosen-muse.invalid/create',loggedIn:'.account',prompt:'textarea',submitName:'Create',resultCards:'.result',resultIdAttribute:'data-job-id',readyWithinCard:'.ready',downloadButtonName:'Download',upload:'',timeoutSeconds:60,reviewed:true};
    worker.saveAdapter(flow);assert.equal(worker.status().generationReady,true);
    initializeMuseConnection(worker);
    assert.equal(worker.connection().startUrl,flow.startUrl);
    assert.equal(worker.status().generationReady,true);
    assert.throws(()=>worker.saveAdapter({...flow,startUrl:'https://other.invalid/create'}),/đúng miền/);
    let navigated;
    const quotaChecks=[];
    worker.checkProfile=async id=>{quotaChecks.push(id);};
    worker.context=async()=>({newPage:async()=>({goto:async url=>{navigated=url;}})});
    await worker.openProfile('profile1');assert.equal(navigated,flow.startUrl);assert.deepEqual(quotaChecks,['profile1']);
    worker.saveMuseConnection({startUrl:'https://chosen-muse.invalid/another-project'});assert.equal(worker.status().generationReady,false);
    worker.saveMuseConnection({startUrl:flow.startUrl});worker.saveAdapter(flow);
    worker.saveMuseConnection({startUrl:'https://new-muse.invalid/create'});assert.equal(worker.status().generationReady,false);
    const adapter=new MuseAdapter(flow);
    await assert.rejects(()=>adapter.fetch({}, {providerUrl:'https://other.invalid/result'},()=>{},'unused'),/Muse/);
  } finally {store.close();await rm(root,{recursive:true,force:true});}
});

test('local distribution includes the font bytes referenced by its compiled stylesheet',async()=>{
  const index=await readFile(new URL('../local-dist/ui/index.html',import.meta.url),'utf8');
  const css=index.match(/href="(\/assets\/[^" ]+\.css)"/)[1];
  const text=await readFile(new URL('../local-dist/ui'+css,import.meta.url),'utf8');
  const fonts=[...new Set([...text.matchAll(/\/fonts\/[^)"'\s]+\.woff2/g)].map(x=>x[0]))];
  assert.ok(fonts.length>=10);
  for(const font of fonts)assert.ok((await readFile(new URL('../local-dist/ui'+font,import.meta.url))).length>100);
});
