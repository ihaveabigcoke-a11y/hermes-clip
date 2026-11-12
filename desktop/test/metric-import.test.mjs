import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {startLocalServer,sessionCookie,importModule} from './helpers/local-server.mjs';
const {contentPlanSchema}=await importModule('lib/lab/operations.ts');
const {previewMetrics}=await importModule('lib/lab/metric-import.ts');
test('T019 local atomic batch rejects all on invalid/stale row, appends history, replays once and protects post identity',async()=>{
 const root=resolve('outputs/T-019-transaction');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'isolated-'));
 const product={id:'product',kind:'product',revision:1,updatedAt:1,data:{name:'Fixture'}},plan={id:'plan',kind:'content_plan',revision:1,updatedAt:1,data:contentPlanSchema.parse({productId:'product',accountId:'account',productionId:'',name:'Published',status:'published_manual',postUrl:'https://instagram.com/p/test'})};
 const seedPath=join(dir,'seed.json');await writeFile(seedPath,JSON.stringify({records:[product,plan,{id:'account',kind:'social_account',revision:1,updatedAt:1,data:{name:'Fixture',productId:'product',handle:'fixture'}}]}));const local=await startLocalServer({root:join(dir,'workspace'),seedPath});
 try{const post=async body=>{const r=await fetch(local.origin+'/api/lab',{method:'POST',headers:{Cookie:sessionCookie+'='+local.session,Origin:local.origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};const read=async()=> (await(await fetch(local.origin+'/api/lab',{headers:{Cookie:sessionCookie+'='+local.session}})).json()).records;
 const rows=previewMetrics('planId,observedAt,source,views\nplan,2026-11-13T00:00:00Z,Insights,123',[plan]).rows;
 assert.equal((await post({action:'import_social_metrics',input:{batchId:'bad',rows:[...rows,{...rows[0],planId:'foreign'}]}})).status,409);assert.equal((await read()).filter(r=>r.kind==='social_metric').length,0);
 const body={action:'import_social_metrics',input:{batchId:'ok',rows}};const first=await post(body);assert.equal(first.status,200,JSON.stringify(first));assert.deepEqual((await post(body)).records,first.records);
 assert.equal((await post({...body,input:{batchId:'next',rows:[{...rows[0],observedAt:'2026-11-14T00:00:00Z',views:456}]}})).status,200);assert.equal((await read()).filter(r=>r.kind==='social_metric').length,2);
 assert.equal((await post({...first.records[0],data:{...first.records[0].data,views:999}})).status,422);
 assert.equal((await post({...plan,data:{...plan.data,postUrl:'https://instagram.com/p/other'}})).status,422);
 }finally{await local.close();}
});
