import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {startLocalServer,sessionCookie,getTestBuild,outputs,localUiFile} from './helpers/local-server.mjs';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {assertSender} from '../src/contracts.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {initializeMuseConnection,MUSE_START_URL} from '../src/defaults.mjs';
import {analysisResponse,structureFor} from '../../tests/fixtures/formula-analysis.mjs';

const {buildRoot,moduleUrl}=await getTestBuild();
assert.equal(dirname(buildRoot),resolve(outputs));
const compiledUrl=name=>moduleUrl('lib/lab/'+name);
const {emptyProduct,productFromCandidate,unitMargin,productMarginLabel}=await import(compiledUrl('domain.mjs'));
const {researchProductId}=await import(compiledUrl('operations.mjs'));
const {viralFormulas,viralFormulaRecordId,workspaceFormulas,formulasForProduct}=await import(compiledUrl('viral-formulas.mjs'));
const {formulaStoryboard}=await import(compiledUrl('formula-storyboard.mjs'));
const {draftReferenceVideo}=await import(compiledUrl('viral-reference.mjs'));
const {parseFormulaAnalysis}=await import(compiledUrl('formula-analysis.mjs'));

test('caption, editable filename, dense metadata and parsed analysis survive isolated local SQLite restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'t21-local-analysis-'));let server;
  const request=async payload=>{
    const response=await fetch(server.origin+'/api/lab',{method:payload?'POST':'GET',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:response.status,...await response.json()};
  };
  try{
    server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    const structure=structureFor(),caption='Comment LED for the link',fileName='Original LED.mp4';
    const analysis=parseFormulaAnalysis(JSON.stringify({...analysisResponse(),ctaSource:'caption',cutCount:999}),structure,{caption,fileName});
    const draft={...draftReferenceVideo({id:'t21_persist',product:'Synthetic fixture',structure}),caption,fileName,analysis};
    const payload={kind:'reference_video_draft',id:'ignored',revision:0,data:draft};
    const saved=await request(payload);assert.equal(saved.status,200);assert.deepEqual(saved.record.data,draft);
    await server.close();server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    assert.deepEqual((await request()).records,[saved.record]);
    assert.equal((await request(payload)).status,409);
    const invalid=await request({...payload,revision:1,data:{...draft,caption:'No keyword'}});assert.equal(invalid.status,422);
    assert.deepEqual((await request()).records,[saved.record]);
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});

test('reference video draft round-trips through source-built local API and restart independently of formulas',async()=>{
  const root=await mkdtemp(join(tmpdir(),'t12-local-reference-'));
  let server;
  const request=async payload=>{
    const response=await fetch(server.origin+'/api/lab',{method:payload?'POST':'GET',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:response.status,...await response.json()};
  };
  try {
    server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    const draft=draftReferenceVideo({id:'offline',product:'Fixture',structure:{durationSec:6,cuts:[2,4],cutCount:2,contactSheetPath:'fixture/sheet.jpg',frames:[{t:0,path:'fixture/0.jpg'}]}});
    const payload={kind:'reference_video_draft',id:'ignored',revision:0,data:draft};
    const saved=await request(payload);assert.equal(saved.status,200);assert.deepEqual(saved.record.data,draft);
    assert.equal((await request(payload)).status,409);
    await server.close();server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    const read=await request();assert.equal(read.status,200);assert.deepEqual(read.records,[saved.record]);
    const invalid=await request({...payload,revision:1,data:{...draft,ctaType:'buy_now'}});assert.equal(invalid.status,422);
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});

test('formula draft scenes and shared variants survive isolated local restart without approving or enqueueing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'product-lab-formula-draft-'));
  let server;
  const request=async(path,payload)=>{
    const response=await fetch(server.origin+path,{method:payload?'POST':'GET',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:response.status,...await response.json()};
  };
  try{
    server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    assert.equal((await request('/api/lab',{id:'draft_product',kind:'product',revision:0,data:{...emptyProduct,name:'Fixture light'}})).status,200);
    const created=await request('/api/production',{id:'draft_project',revision:0,commandId:'create_draft',action:'create',input:{name:'Formula',productId:'draft_product',locale:'en-US'}});
    assert.equal(created.status,200);
    const draft=formulaStoryboard({},created.record.data,viralFormulas[0],'LED');
    const saved=await request('/api/production',{id:'draft_project',revision:1,commandId:'save_formula',action:'formula_draft',input:draft});
    assert.equal(saved.status,200);
    await server.close();server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    const restored=(await request('/api/lab')).records.find(row=>row.id==='draft_project');
    assert.deepEqual(restored,saved.record);
    assert.equal(restored.data.variants[0].ctaKeyword,'LED');
    assert.equal(restored.data.variants[0].bodyId,restored.data.variants[1].bodyId);
    assert.ok(restored.data.bodies[0].items.every(item=>item.takeId===null));
    assert.ok(restored.data.scenes.every(scene=>scene.overlayText&&!scene.storyboardApproved&&scene.attempts.length===0));
    assert.equal((await request('/api/production',{id:'draft_project',revision:restored.revision,commandId:'blocked_prepare',action:'prepare',input:{sceneId:restored.data.scenes[0].id}})).status,422);
  }finally{await server?.close();assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});}
});

test('fresh local API build packages the exact formula seed without a prebuilt server',async()=>{
  const source=await readFile(new URL('../../lib/lab/viral-formulas.seed.json',import.meta.url));
  assert.deepEqual(await readFile(new URL(compiledUrl('viral-formulas.seed.json'))),source);
  assert.equal(viralFormulas.length,6);
  assert.ok(formulasForProduct(['night_glow']).some(formula=>formula.id==='problem-vs-result-cta'));
});

test('promoted currencies survive local API storage and restart without a numeric mixed margin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'product-lab-currencies-'));
  let server;
  const request = async (method, json) => {
    const response = await fetch(server.origin+'/api/lab', {method, headers:{
      Cookie:sessionCookie+'='+server.session, Origin:server.origin, 'Content-Type':'application/json',
    }, ...(json ? {body:JSON.stringify(json)} : {})});
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    server = await startLocalServer({root, port:0});
    const candidate = {id:'quote', name:'Currency quote', supplierUrl:'https://example.test/item', evidenceNotes:'Fixture quote', cost:36.5, costCurrency:'CNY', shipping:4.25, shippingCurrency:'USD', price:19.99, currency:'USD'};
    const batch = await request('POST', {kind:'research_batch', id:'currency_batch', revision:0, data:{name:'Currency batch', candidates:[candidate], selectedIds:['quote']}});
    const data = {...productFromCandidate(batch.record.id, batch.record.data, batch.record.data.candidates[0]), fees:0, buffer:0};
    const productId = researchProductId(batch.record.id, 'quote');
    const created = await request('POST', {kind:'product', id:productId, revision:0, action:'promote', data});
    assert.deepEqual(created.record.data, data);
    await server.close();
    server = await startLocalServer({root, port:0});
    const restored = (await request('GET')).records.find(row => row.id === productId);
    assert.deepEqual(restored.data, data);
    assert.equal(unitMargin(restored.data), null);
    assert.equal(productMarginLabel(restored.data), 'Khác tiền tệ · chưa tính biên');
  } finally {
    await server?.close();
    await rm(root, {recursive:true, force:true});
  }
});

test('bundled formula seed and immutable workspace versions survive local fixture restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'product-lab-formulas-'));
  let server;
  const request = async (method, json) => {
    const response = await fetch(server.origin+'/api/lab', {method, headers: {
      Cookie: sessionCookie+'='+server.session, Origin: server.origin, 'Content-Type': 'application/json',
    }, ...(json ? {body: JSON.stringify(json)} : {})});
    return {status: response.status, ...await response.json()};
  };
  try {
    server = await startLocalServer({root, seedPath: join(root, 'missing-seed.json')});
    assert.equal((await request('GET')).records.length, 0);
    assert.equal(workspaceFormulas([]).length, 6);
    const formula = {...viralFormulas[0], version: 2, name: 'Local formula fixture'};
    const payload = {kind: 'viral_formula', id: 'ignored', revision: 0, data: formula};
    const created = await request('POST', payload);
    assert.equal(created.status, 200);
    assert.equal(created.record.id, viralFormulaRecordId(formula));
    assert.equal((await request('POST', payload)).status, 409);
    const records = (await request('GET')).records;
    await server.close();
    server = await startLocalServer({root, seedPath: join(root, 'missing-seed.json')});
    const restored = (await request('GET')).records;
    assert.deepEqual(restored, records);
    assert.equal(workspaceFormulas(restored).find(row => row.id === formula.id).name, formula.name);
    assert.equal(viralFormulas[0].version, 1);
  } finally {await server?.close(); await rm(root, {recursive: true, force: true});}
});

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
  const root=await mkdtemp(join(tmpdir(),'product-lab-muse-url-')),store=new Store(join(root,'worker.sqlite'));store.set('muse_paused',false);
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
  const index=await readFile(await localUiFile('index.html'),'utf8');
  const css=index.match(/href="(\/assets\/[^" ]+\.css)"/)[1];
  const text=await readFile(await localUiFile(css),'utf8');
  const fonts=[...new Set([...text.matchAll(/\/fonts\/[^)"'\s]+\.woff2/g)].map(x=>x[0]))];
  assert.ok(fonts.length>=10);
  for(const font of fonts)assert.ok((await readFile(await localUiFile(font))).length>100);
});
