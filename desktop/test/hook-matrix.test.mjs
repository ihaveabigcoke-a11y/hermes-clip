import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {importModule,startLocalServer,sessionCookie} from './helpers/local-server.mjs';
import {hookFixture} from '../../tests/fixtures/hook-matrix.mjs';
const production=await importModule('lib/lab/production.ts'),{getRenderPlan}=await importModule('lib/lab/render-plan.ts'),{emptyProduct}=await importModule('lib/lab/domain.ts');
test('T-017: local transaction creates nine drafts, replay preserves edits, foreign selection rolls back, snapshot immutable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'t017-')),f=hookFixture({...production,getRenderPlan,emptyProduct});let local;
 try{const seedPath=join(dir,'seed.json');await writeFile(seedPath,JSON.stringify({records:f.records}));local=await startLocalServer({root:join(dir,'workspace'),seedPath});
 const post=async body=>{const r=await fetch(local.origin+'/api/lab',{method:'POST',headers:{Cookie:sessionCookie+'='+local.session,Origin:local.origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 const read=async()=>await(await fetch(local.origin+'/api/lab',{headers:{Cookie:sessionCookie+'='+local.session}})).json();
 const bad=await post({action:'create_hook_drafts',input:{...f.input,accountIds:['account_1','wrong']}});assert.equal(bad.status,409);assert.equal((await read()).records.filter(r=>r.kind==='content_plan').length,0);
 const made=await post({action:'create_hook_drafts',input:f.input});assert.equal(made.status,200,JSON.stringify(made));assert.equal(made.records.length,9);
 const row=made.records[0];const edited=await post({...row,data:{...row.data,ctaKeyword:'DOG'}});assert.equal(edited.status,200);
 const retry=await post({action:'create_hook_drafts',input:{...f.input,batchId:'another'}});assert.equal(retry.status,200);assert.equal(retry.records.find(r=>r.id===row.id).data.ctaKeyword,'DOG');assert.equal((await read()).records.filter(r=>r.kind==='content_plan').length,9);
 const forged=await post({...edited.record,data:{...edited.record.data,comparison:{...row.data.comparison,ctaKeyword:'DOG'}}});assert.equal(forged.status,422);
 assert.ok((await read()).records.filter(r=>r.kind==='content_plan').every(r=>r.data.status==='draft'));
 }finally{await local?.close();await rm(dir,{recursive:true,force:true});}
});
