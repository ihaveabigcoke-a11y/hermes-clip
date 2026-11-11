import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {newProduction,applyProduction,checkMedia,takeGate,variantItems,parseCsv,productionSchema,providerAdapter,creativeDrafts,creativeDuration} from '../lib/lab/production.ts';
import {inspectMedia} from '../lib/lab/media.ts';
import {productionPackage,buildManifest,zipFiles,crc32} from '../lib/lab/package.ts';
import {formulaStoryboard} from '../lib/lab/intelligence.ts';
import {viralFormulas} from '../lib/lab/viral-formulas.ts';
import {sceneInputSchema} from '../lib/lab/production.ts';
import {pendingTakeSelection,ProductionError} from '../lib/lab/production.ts';
import {variantExportStatus} from '../lib/lab/package.ts';
import {workflowGuidance} from '../lib/lab/workflow-guidance.ts';
import {queueTakeSelections,groupQueueJobs} from '../lib/lab/queue-view.ts';
import {mediaCatalog} from '../lib/lab/media-catalog.ts';
import {instagramProductSummary,instagramAccountContentRows} from '../lib/lab/instagram-summary.ts';
import {formulaProduction,formulaRecords} from './fixtures/formula-production.mjs';
let seq=0;const run=(p,a,d,key=`cmd_${++seq}`,productRevision=p.productRevision)=>applyProduction(p,a,d,key,1000+seq,productRevision);

test('nullable formula draft has safe waiting status across package preflight, guidance, queue and Instagram; export does no I/O',async t=>{
  const p=productionSchema.parse(JSON.parse(JSON.stringify(formulaProduction()))),before=structuredClone(p),records=formulaRecords(p);
  const fetched=t.mock.method(globalThis,'fetch',()=>{throw Error('Draft must never fetch media');});
  const progress=[];
  for(const variant of p.variants){
    const status=variantExportStatus(p,variant.id);
    assert.equal(status.state,'waiting_take');assert.equal(status.label,'Chờ chọn take');
    const blocked=error=>error instanceof ProductionError&&/Chờ chọn take/.test(error.message);
    assert.throws(()=>buildManifest(p,variant.id,records[0]),blocked);
    await assert.rejects(productionPackage(p,variant.id,records[0],new AbortController().signal,message=>progress.push(message)),blocked);
    assert.throws(()=>run(p,'export',{variantId:variant.id,filename:'draft.zip',kind:'package',assetId:null}),blocked);
    assert.throws(()=>run(p,'export',{variantId:variant.id,filename:'draft.mp4',kind:'render',assetId:'fixture_render'}),blocked);
  }
  assert.equal(fetched.mock.callCount(),0);assert.deepEqual(progress,[]);
  assert.equal(workflowGuidance(p,1).takeSelection.label,'Chờ chọn take');
  assert.equal(workflowGuidance(p,1).stage,'scenes','Storyboard approval remains the first action');
  const queue=queueTakeSelections(records);
  assert.equal(queue.length,1);assert.equal(queue[0].label,'Chờ chọn take');assert.equal(queue[0].variantIds.length,2);
  assert.deepEqual(queueTakeSelections(records,'another_project'),[]);
  assert.deepEqual(mediaCatalog(records),[]);assert.deepEqual(groupQueueJobs([]),[]);
  const summary=instagramProductSummary(records,'draft_product');
  assert.equal(summary.waitingTakeProjects[0].label,'Chờ chọn take');assert.equal(summary.publishedPosts,0);
  assert.equal(summary.totals.views.value,null);assert.deepEqual(instagramAccountContentRows(records,'draft_product'),[]);
  assert.deepEqual(instagramProductSummary(records,'another_product').waitingTakeProjects,[]);
  assert.deepEqual(p,before);
});

test('approved available takes are not implicitly selected; pinning clears waiting but still enforces revision and review',()=>{
  const unpinned=formulaProduction({approved:true}),records=formulaRecords(unpinned);
  assert.equal(workflowGuidance(unpinned,1).title,'Chờ chọn take');
  assert.equal(workflowGuidance(unpinned,2).stage,'references');
  unpinned.scenes[0].attempts.push({status:'unknown'});
  assert.equal(workflowGuidance(unpinned,1).stage,'queue');unpinned.scenes[0].attempts.pop();
  // A post referencing an actual take must not borrow CTA from an unselected variant.
  records.push({id:'plan',kind:'content_plan',updatedAt:1000,data:{productId:'draft_product',productionId:'draft_project',status:'published_manual',postUrl:'https://www.instagram.com/reel/fixture/',assetId:unpinned.scenes[0].takes[0].assetId}});
  assert.equal(instagramAccountContentRows(records,'draft_product')[0].ctaKeyword,null);
  const pinned=formulaProduction({approved:true,pinned:true});
  assert.equal(pendingTakeSelection(pinned),null);assert.deepEqual(queueTakeSelections(formulaRecords(pinned)),[]);
  assert.deepEqual(instagramProductSummary(formulaRecords(pinned),'draft_product').waitingTakeProjects,[]);
  const variant=pinned.variants[0];assert.equal(variantExportStatus(pinned,variant.id).state,'ready');
  assert.ok(buildManifest(pinned,variant.id,records[0]).media.every(item=>typeof item.takeId==='string'));
  pinned.scenes.find(s=>s.id===variant.hook.sceneId).takes[0].review='rejected';
  assert.equal(variantExportStatus(pinned,variant.id).state,'blocked');
  assert.equal(variantExportStatus(pinned,'missing').state,'blocked');
});

test('body, hook and CTA null pins each block the entire timeline even after an earlier stale take',()=>{
  for(const target of ['body','hook','cta']){
    const p=formulaProduction({approved:true,pinned:true}),variant=p.variants[0];
    const pin=target==='body'?p.bodies[0].items.at(-1):variant[target];assert.ok(pin);
    pin.takeId=null;p.scenes[0].storyboardApproved=false;
    assert.equal(variantExportStatus(p,variant.id).state,'waiting_take',target);
    assert.throws(()=>variantItems(p,variant.id),/Chờ chọn take/);
    assert.ok(pendingTakeSelection(p).variantIds.includes(variant.id));
  }
  const legacy=newProduction('Legacy','draft_product',1);
  assert.equal(pendingTakeSelection(productionSchema.parse(legacy)),null);
  assert.deepEqual(queueTakeSelections([...formulaRecords(legacy),{id:'bad',kind:'production',data:{}}]),[]);
  assert.equal(instagramProductSummary(formulaRecords(legacy),'draft_product').totals.views.value,null);
});
test('formula draft atomically stores a shared body and CTA with two hooks, no approval or attempts',()=>{
  const p=newProduction('Formula','product1',1),draft=formulaStoryboard({},p,viralFormulas[0],'LED');
  const saved=run(p,'formula_draft',draft,'formula');
  assert.equal(p.scenes.length,0);assert.equal(saved.scenes.length,draft.rows.length+1);
  assert.ok(saved.scenes.every(scene=>!scene.storyboardApproved&&!scene.takes.length&&!scene.attempts.length));
  assert.equal(saved.bodies.length,1);assert.equal(saved.variants.length,2);
  const [a,b]=saved.variants;
  assert.equal(a.bodyId,b.bodyId);assert.deepEqual(a.cta,b.cta);assert.equal(a.ctaKeyword,'LED');assert.equal(b.ctaKeyword,'LED');
  assert.equal(a.ctaText,b.ctaText);assert.notEqual(a.hook.sceneId,b.hook.sceneId);
  const timeline=v=>[v.hook,...saved.bodies.find(body=>body.id===v.bodyId).items,...(v.cta?[v.cta]:[])];
  assert.deepEqual(timeline(a).slice(1),timeline(b).slice(1));
  assert.ok(timeline(a).every(item=>item.takeId===null));
  const restored=productionSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(run(restored,'formula_draft',draft,'formula'),restored);
  for(const scene of saved.scenes)assert.throws(()=>run(saved,'prepare',{sceneId:scene.id}),/Duyệt kịch bản/);
  assert.throws(()=>run(saved,'export',{variantId:a.id,filename:'draft.zip',assetId:null,kind:'package'}),/Biến thể nháp/);
  assert.throws(()=>run(saved,'pin_formula',{bodyId:a.bodyId,items:[{sceneId:a.hook.sceneId,takeId:'missing'}]}),/mỗi cảnh/);
  const foreign={...draft,rows:draft.rows.map(row=>({...row,referenceIds:['foreign']})),alternateHook:{...draft.alternateHook,referenceIds:['foreign']}};
  assert.throws(()=>run(p,'formula_draft',foreign),/Tham chiếu/);assert.equal(p.scenes.length,0);
  assert.throws(()=>run(p,'formula_draft',{...draft,alternateHook:{...draft.alternateHook,duration:9}}));
  assert.throws(()=>run(p,'formula_draft',{...draft,rows:draft.rows.map(row=>({...row,duration:10}))}));
});
test('formula variants pin only explicitly selected approved videos; later overlay edits invalidate takes and preserve snapshots',()=>{
  let p=newProduction('Formula','product1',1);
  p=run(p,'formula_draft',formulaStoryboard({},p,viralFormulas[0],'LED'),'formula_pin');
  const bodyId=p.bodies[0].id,variantId=p.variants[0].id;
  const selections=[];
  for(const original of p.scenes){
    const take={assetId:'asset_'+original.id,name:'fixture.mp4',type:'video/mp4',size:100,sha256:'a'.repeat(64),metadata:{width:720,height:1280,duration:original.duration,verifiedBy:'container'}};
    p=run(p,'attach',{sceneId:original.id,attemptId:null,take});
    const takeId=p.scenes.find(scene=>scene.id===original.id).takes[0].id;
    selections.push({sceneId:original.id,takeId});
    assert.throws(()=>run(p,'review',{sceneId:original.id,takeId,review:'approved',notes:''}),/Kịch bản chưa duyệt/);
    p=run(p,'storyboard',{sceneId:original.id});
    p=run(p,'review',{sceneId:original.id,takeId,review:'approved',notes:'Synthetic fixture review'});
  }
  assert.throws(()=>run(p,'pin_formula',{bodyId,items:selections.map((item,index)=>index?item:{...item,takeId:'missing'})}),/chưa được duyệt/);
  assert.throws(()=>variantItems(p,variantId),/Biến thể nháp/);
  p=run(p,'pin_formula',{bodyId,items:selections});
  const [a,b]=p.variants;
  assert.deepEqual(variantItems(p,a.id).slice(1),variantItems(p,b.id).slice(1));
  assert.equal(variantItems(p,variantId).length,viralFormulas[0].beats.length);
  assert.throws(()=>run(p,'pin_formula',{bodyId,items:selections}),/đã ghim/);
  const manifest=buildManifest(p,a.id,{id:'product1',revision:1,data:{}});
  assert.equal(manifest.media[0].overlayText,p.scenes[0].overlayText);assert.equal(manifest.variant.ctaKeyword,'LED');
  const prior=p.scenes[0],snapshot=prior.takes[0].snapshot;
  assert.equal(JSON.parse(snapshot).overlayText,prior.overlayText);
  p=run(p,'prepare',{sceneId:prior.id});
  assert.equal(JSON.parse(p.scenes[0].attempts[0].snapshot).overlayText,prior.overlayText);
  p=run(p,'scene',{...prior,overlayText:'A revised POV',referenceIds:[]});
  assert.equal(p.scenes[0].revision,2);assert.equal(p.scenes[0].storyboardApproved,false);
  assert.equal(p.scenes[0].takes[0].snapshot,snapshot);assert.equal(p.scenes[0].takes.length,1);
  assert.throws(()=>variantItems(p,variantId),/Kịch bản chưa duyệt/);
  p=run(p,'storyboard',{sceneId:prior.id});
  assert.throws(()=>variantItems(p,variantId),/cảnh cũ/);
});
test('overlay and CTA fields remain optional for old records and enforce single-line limits for new drafts',()=>{
  const legacy=newProduction('Old','product1',1);
  const old=run(legacy,'scene',{id:'old',name:'Old scene',prompt:'Product shot'});
  assert.equal(productionSchema.parse(JSON.parse(JSON.stringify(old))).scenes[0].overlayText,undefined);
  for(const overlayText of [null,undefined,'', 'A short overlay'])assert.equal(sceneInputSchema.safeParse({name:'S',prompt:'Shot',overlayText}).success,true);
  for(const overlayText of ['First\nsecond','x'.repeat(61)])assert.equal(sceneInputSchema.safeParse({name:'S',prompt:'Shot',overlayText}).success,false);
  const draft=formulaStoryboard({},legacy,viralFormulas[0]);
  assert.throws(()=>run(legacy,'formula_draft',{...draft,ctaKeyword:'two words'}));
  const saved=run(legacy,'formula_draft',draft);
  for(const variant of saved.variants){delete variant.ctaKeyword;delete variant.ctaText;delete variant.formulaId;delete variant.formulaVersion;}
  assert.equal(productionSchema.safeParse(saved).success,true);
});
const input=(id='scene1',patch={})=>({id,name:id,role:'body',mediaType:'video',prompt:'A product scene with one camera movement',ratio:'9:16',duration:5,referenceIds:[],...patch});
const media=(patch={})=>({assetId:'asset1',name:'source.mp4',type:'video/mp4',sha256:'a'.repeat(64),size:100,metadata:{width:720,height:1280,duration:5,verifiedBy:'container'},...patch});
const start=()=>newProduction('International multi-product production','product1',1,'en-US');
test('frame reference roles require one first and last image before storyboard approval', () => {
  let production = start();
  for (const role of ['first_frame','last_frame']) production = run(production,'reference',{id:role,name:role,role,assetId:'asset_'+role,sourceUrl:'',notes:''});
  production = run(production,'scene',input('frames',{referenceIds:['first_frame']}));
  assert.throws(() => run(production,'storyboard',{sceneId:'frames'}), /một ảnh đầu/);
  production = run(production,'scene',input('frames',{referenceIds:['first_frame','last_frame']}));
  production = run(production,'storyboard',{sceneId:'frames'});
  assert.equal(production.scenes[0].storyboardApproved,true);
  production = run(production,'scene',input('frames',{mediaType:'image',referenceIds:['first_frame','last_frame']}));
  assert.throws(() => run(production,'storyboard',{sceneId:'frames'}), /cảnh video/);
});
function withApproved(p=start(),sid='scene1',patch={}){p=run(p,'scene',input(sid,patch));p=run(p,'storyboard',{sceneId:sid});p=run(p,'attach',{sceneId:sid,attemptId:null,take:media()});const t=p.scenes.find(s=>s.id===sid).takes.at(-1);return run(p,'review',{sceneId:sid,takeId:t.id,review:'approved',notes:'Viewed real file'});}
test('draft imports create no attempts and an invalid reference rejects the entire batch',()=>{const p=start();const ok=run(p,'import',{rows:[input('s1'),input('s2')]});assert.equal(ok.scenes.length,2);assert.equal(ok.scenes.flatMap(s=>s.attempts).length,0);assert.throws(()=>run(p,'import',{rows:[input('s1'),input('s2',{referenceIds:['other_product_ref']})]}),/Tham chiếu/);assert.equal(p.scenes.length,0);});
test('duplicate command replay survives serialization and does not add a second attempt',()=>{let p=run(start(),'scene',input());p=run(p,'storyboard',{sceneId:'scene1'});p=run(p,'prepare',{sceneId:'scene1'},'request_stable');const snapshot=JSON.parse(JSON.stringify(p));const again=run(snapshot,'prepare',{sceneId:'scene1'},'request_stable');assert.equal(again.scenes[0].attempts.length,1);assert.equal(again.events.length,p.events.length);assert.equal(again.scenes[0].attempts[0].usageUsd,null);assert.equal(providerAdapter.connected,false);});
test('pause remains effective when adding another draft',()=>{let p=run(start(),'pause',{paused:true});p=run(p,'scene',input());p=run(p,'storyboard',{sceneId:'scene1'});assert.equal(p.paused,true);assert.throws(()=>run(p,'prepare',{sceneId:'scene1'}),/tạm dừng/);});
test('storyboard review gates attempt preparation',()=>{const p=run(start(),'scene',input());assert.throws(()=>run(p,'prepare',{sceneId:'scene1'}),/Duyệt kịch bản/);});
test('wrong aspect and wrong duration cannot be approved despite receiving a file',()=>{let p=run(start(),'scene',input());p=run(p,'storyboard',{sceneId:'scene1'});p=run(p,'attach',{sceneId:'scene1',attemptId:null,take:media({metadata:{width:832,height:1104,duration:10,verifiedBy:'container'}})});const s=p.scenes[0],t=s.takes[0];assert.equal(checkMedia(s,t).length,2);assert.throws(()=>run(p,'review',{sceneId:s.id,takeId:t.id,review:'approved',notes:''}),/Tỷ lệ/);assert.equal(t.review,'pending');});
test('near 9:16 is accepted at the documented one-percent tolerance',()=>{assert.equal(checkMedia(input(),media({metadata:{width:704,height:1248,duration:5.035,verifiedBy:'container'}})).length,0);});
test('reference updates preserve the old version and invalidate dependent reviews',()=>{let p=start();const ref={id:'ref1',name:'Product',role:'product',assetId:'asset1',sourceUrl:'',notes:'Dimensions unknown'};p=run(p,'reference',ref);p=withApproved(p,'scene1',{referenceIds:['ref1'],camera:'Slow push',voice:'Exact spoken line'});p=run(p,'prepare',{sceneId:'scene1'});const snapshot=JSON.parse(p.scenes[0].attempts[0].snapshot);assert.deepEqual(snapshot.references,[{id:'ref1',version:1,assetId:'asset1'}]);assert.equal(snapshot.camera,'Slow push');assert.equal(snapshot.voice,'Exact spoken line');assert.equal(snapshot.model,null);const oldTake=p.scenes[0].takes[0].id;p=run(p,'reference',{...ref,assetId:'asset2'});assert.equal(p.references.length,2);assert.equal(p.references[0].assetId,'asset1');assert.equal(p.scenes[0].takes[0].id,oldTake);assert.ok(takeGate(p,p.scenes[0],p.scenes[0].takes[0]));assert.throws(()=>run(p,'prepare',{sceneId:'scene1'}),/Tham chiếu/);});
test('editing one scene preserves old takes and leaves another scene unchanged',()=>{let p=withApproved();p=run(p,'scene',input('scene2'));const second=structuredClone(p.scenes[1]);p=run(p,'scene',input('scene1',{prompt:'Changed action'}));assert.deepEqual(p.scenes[1],second);assert.equal(p.scenes[0].takes.length,1);assert.equal(p.scenes[0].takes[0].sceneRevision,1);assert.equal(p.scenes[0].revision,2);assert.equal(p.scenes[0].storyboardApproved,false);});
test('approved manual take retains full instructions after scene edits and serialization',()=>{
  let p=withApproved(start(),'scene1',{action:'Keep lid closed',camera:'Slow push',voice:'English line'});
  const snapshot=p.scenes[0].takes[0].snapshot;
  const saved=JSON.parse(snapshot);
  assert.equal(saved.productId,'product1');assert.equal(saved.productRevision,1);
  assert.equal(saved.action,'Keep lid closed');assert.equal(saved.camera,'Slow push');assert.equal(saved.voice,'English line');
  assert.equal(saved.ratio,'9:16');assert.equal(saved.duration,5);assert.equal(saved.mediaType,'video');
  assert.deepEqual(saved.references,[]);
  p=run(p,'scene',input('scene1',{prompt:'Changed',action:'Open lid',camera:'Static',voice:'Changed line',ratio:'16:9',duration:10}));
  p=productionSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.equal(p.scenes[0].takes[0].snapshot,snapshot);
  assert.equal(p.scenes[0].takes[0].review,'approved');
});
test('retry creates a new immutable attempt without deleting an approved take',()=>{let p=withApproved();p=run(p,'prepare',{sceneId:'scene1'});const t=structuredClone(p.scenes[0].takes);p=run(p,'retry',{sceneId:'scene1'});assert.equal(p.scenes[0].attempts.length,2);assert.deepEqual(p.scenes[0].takes,t);});
test('unknown external result blocks blind retry',()=>{let p=withApproved();p=run(p,'prepare',{sceneId:'scene1'});p.scenes[0].attempts[0].status='unknown';p.scenes[0].attempts[0].providerJobId='provider-job';assert.throws(()=>run(p,'retry',{sceneId:'scene1'}),/đối soát/);});
test('product revision change requires an explicit sync and invalidates previous takes',()=>{let p=withApproved();assert.throws(()=>run(p,'prepare',{sceneId:'scene1'},'newrev',2),/Hồ sơ sản phẩm/);p=run(p,'sync_product',{},'sync',2);assert.equal(p.productRevision,2);assert.equal(p.scenes[0].takes.length,1);assert.equal(p.scenes[0].storyboardApproved,false);});
test('product sync preserves legacy take instructions before changing revisions',()=>{
  let p=withApproved(start(),'scene1',{action:'Keep lid closed',camera:'Slow push',voice:'English line'});
  delete p.scenes[0].takes[0].snapshot;
  p=run(p,'sync_product',{},'legacy_sync',2);
  const snapshot=p.scenes[0].takes[0].snapshot;
  const saved=JSON.parse(snapshot);
  assert.equal(saved.productRevision,1);
  assert.equal(saved.sceneRevision,1);
  assert.equal(saved.action,'Keep lid closed');
  assert.equal(saved.camera,'Slow push');
  assert.equal(saved.voice,'English line');
  p=run(p,'scene',input('scene1',{prompt:'Changed instructions'}));
  p=productionSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.equal(p.scenes[0].takes[0].snapshot,snapshot);
});

test('body and variants reference approved take IDs without generating another body',()=>{let p=withApproved();const t=p.scenes[0].takes[0];p=run(p,'body',{name:'Body v1',items:[{sceneId:'scene1',takeId:t.id}]},'body1');p=run(p,'variant',{name:'US v1',bodyId:'body1',hook:null,cta:null,locale:'en-US',caption:'Caption'},'var1');p=run(p,'variant',{name:'UK v1',bodyId:'body1',hook:null,cta:null,locale:'en-GB',caption:'Caption'},'var2');assert.equal(p.bodies.length,1);assert.equal(p.scenes[0].takes.length,1);assert.equal(variantItems(p,'var2')[0].take.id,t.id);});
test('rejection of a take invalidates an already assembled variant',()=>{let p=withApproved();const t=p.scenes[0].takes[0];p=run(p,'body',{name:'Body',items:[{sceneId:'scene1',takeId:t.id}]},'body1');p=run(p,'variant',{name:'Variant',bodyId:'body1',hook:null,cta:null,locale:'en-US',caption:''},'var1');p=run(p,'review',{sceneId:'scene1',takeId:t.id,review:'rejected',notes:'Product detail mismatch'});assert.throws(()=>variantItems(p,'var1'),/chưa được duyệt/);});
test('CSV handles quoted commas/newlines/BOM and rejects unfinished quotes',()=>{assert.deepEqual(parseCsv('\uFEFFname,prompt\r\nA,"One, two\nthree"'),[['name','prompt'],['A','One, two\nthree']]);assert.throws(()=>parseCsv('name,prompt\nA,"unfinished'),/chưa đóng/);});
test('aggregate schemas bound data and strip unexpected credential fields',()=>{const p=start();assert.equal('apiKey' in productionSchema.parse({...p,apiKey:'do-not-save'}),false);assert.throws(()=>run(p,'import',{rows:Array.from({length:31},(_,i)=>input('s'+i))}));});
test('legacy concept seeds reviewed-later scene drafts without changing the source',()=>{const c={name:'Existing concept',script:'0–3s: Hook\n3–8s: Demo\n8–15s: Product\n15–20s: CTA',prompt:'Approved product facts'};const before=structuredClone(c),rows=creativeDrafts(c,'seed');assert.deepEqual(rows.map(r=>r.duration),[3,5,7,5]);assert.deepEqual(rows.map(r=>r.role),['hook','body','body','cta']);const p=run(start(),'import',{rows});assert.ok(p.scenes.every(s=>!s.storyboardApproved&&!s.attempts.length&&!s.takes.length));assert.deepEqual(c,before);});
test('ZIP has standard CRC and rejects traversal',()=>{assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);assert.throws(()=>zipFiles([{name:'../bad',bytes:new Uint8Array()}]),/ZIP/);});
test('variant measurements replace a cumulative snapshot and reject an impossible funnel',()=>{let p=withApproved();const t=p.scenes[0].takes[0];p=run(p,'body',{name:'Body',items:[{sceneId:'scene1',takeId:t.id}]},'body_m');p=run(p,'variant',{name:'Measured',bodyId:'body_m',hook:null,cta:null,locale:'en-US',caption:''},'var_m');const m={variantId:'var_m',views:100,clicks:10,sessions:8,orders:1,delivered:1,returned:0,netRevenue:35,totalCosts:20,source:'Manual store cohort',notes:''};p=run(p,'measurement',m);p=run(p,'measurement',{...m,views:120});assert.equal(p.measurements.length,1);assert.equal(p.measurements[0].views,120);assert.throws(()=>run(p,'measurement',{...m,orders:9}));});

test('MP4 track display dimensions accept fractional fixed-point values',()=>{
  const atom=(tag,body)=>{const head=Buffer.alloc(8);head.writeUInt32BE(body.length+8);head.write(tag,4);return Buffer.concat([head,body]);};
  const mvhd=Buffer.alloc(20);mvhd.writeUInt32BE(1000,12);mvhd.writeUInt32BE(3000,16);
  const tkhd=Buffer.alloc(84);tkhd.writeInt32BE(65536,40);tkhd.writeInt32BE(65536,56);tkhd.writeUInt32BE(Math.round(360.6136*65536),76);tkhd.writeUInt32BE(640*65536,80);
  const hdlr=Buffer.alloc(12);hdlr.write('vide',8);
  const bytes=Buffer.concat([atom('ftyp',Buffer.from('isom0000')),atom('mdat',Buffer.from([1])),atom('moov',Buffer.concat([atom('mvhd',mvhd),atom('trak',Buffer.concat([atom('tkhd',tkhd),atom('mdia',atom('hdlr',hdlr))]))]))]);
  assert.deepEqual(inspectMedia(bytes,'video/mp4'),{width:361,height:640,duration:3,verifiedBy:'container'});
  tkhd.writeInt32BE(0,40);tkhd.writeInt32BE(65536,44);tkhd.writeInt32BE(-65536,52);tkhd.writeInt32BE(0,56);
  const rotated=Buffer.concat([atom('ftyp',Buffer.from('isom0000')),atom('mdat',Buffer.from([1])),atom('moov',Buffer.concat([atom('mvhd',mvhd),atom('trak',Buffer.concat([atom('tkhd',tkhd),atom('mdia',atom('hdlr',hdlr))]))]))]);
  assert.equal(inspectMedia(rotated,'video/mp4').width,640);
  assert.equal(inspectMedia(rotated,'video/mp4').height,361);
});

test('real MP4 container metadata, rejection of truncated MP4, and a runnable source package',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'product-lab-qa-'));
  try{
    const source=join(dir,'source.mp4');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=90x160:r=24:d=5','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',source]);
    const bytes=new Uint8Array(readFileSync(source)),m=inspectMedia(bytes,'video/mp4');assert.equal(m.width,90);assert.equal(m.height,160);assert.equal(m.duration,5);assert.throws(()=>inspectMedia(bytes.slice(0,100),'video/mp4'));
    let p=run(start(),'scene',input());p=run(p,'storyboard',{sceneId:'scene1'});
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
    p=run(p,'attach',{sceneId:'scene1',attemptId:null,take:media({metadata:m,sha256:hash,size:bytes.length})});
    p=run(p,'review',{sceneId:'scene1',takeId:p.scenes[0].takes[0].id,review:'approved',notes:''});
    p=run(p,'body',{name:'Body',items:[{sceneId:'scene1',takeId:p.scenes[0].takes[0].id}]},'body1');
    const audioSource=join(dir,'audio-source.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=5','-f','lavfi','-i','sine=frequency=440:duration=5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',audioSource]);
    const audioBytes=new Uint8Array(readFileSync(audioSource)),audioMetadata=inspectMedia(audioBytes,'video/mp4'),audioHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',audioBytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
    p=run(p,'scene',input('audio_hook',{role:'hook'}));p=run(p,'storyboard',{sceneId:'audio_hook'});p=run(p,'attach',{sceneId:'audio_hook',attemptId:null,take:media({assetId:'audio_asset',metadata:audioMetadata,sha256:audioHash,size:audioBytes.length})});const audioTake=p.scenes.find(s=>s.id==='audio_hook').takes[0];p=run(p,'review',{sceneId:'audio_hook',takeId:audioTake.id,review:'approved',notes:''});
    p=run(p,'variant',{name:'Export',bodyId:'body1',hook:{sceneId:'audio_hook',takeId:audioTake.id},cta:null,locale:'en-US',caption:'Test caption'},'var1');
    const product={id:'product1',kind:'product',revision:1,updatedAt:0,data:{name:'QA',sku:'QA1'}};
    t.mock.method(globalThis,'fetch',async url=>new Response(String(url).endsWith('/audio_asset')?audioBytes:bytes,{status:200}));
    const {blob,manifest}=await productionPackage(p,'var1',product,new AbortController().signal,()=>{});
    assert.equal(manifest.render_status,'source_package_not_merged');
    assert.equal(manifest.approval_scope, 'internal');
    assert.equal(manifest.product.sampleVerified, false);
    writeFileSync(join(dir,'export.zip'),new Uint8Array(await blob.arrayBuffer()));
    if (process.platform === 'win32') {
      const archive = join(dir, 'export.zip').replaceAll("'", "''");
      const destination = dir.replaceAll("'", "''");
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destination}' -Force`]);
    } else {
      execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])', join(dir, 'export.zip'), dir]);
    }
    assert.deepEqual(new Uint8Array(readFileSync(join(dir,manifest.media[0].path))),audioBytes);
    assert.deepEqual(new Uint8Array(readFileSync(join(dir,manifest.media[1].path))),bytes);
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'render.ps1')], {stdio: 'pipe', timeout: 120000});
    } else {
      execFileSync('sh', [join(dir, 'render.sh')], {stdio: 'pipe', timeout: 120000});
    }
    assert.ok(existsSync(join(dir,'output.mp4')));
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',join(dir,'output.mp4')],{encoding:'utf8'}));
    const v=probe.streams.find(s=>s.codec_type==='video');assert.equal(v.width,720);assert.equal(v.height,1280);assert.ok(Math.abs(Number(probe.format.duration)-10)<0.25);assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
    const pixel=sec=>execFileSync('ffmpeg',['-v','error','-ss',String(sec),'-i',join(dir,'output.mp4'),'-vf','scale=1:1','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);const first=pixel(1),second=pixel(6);assert.ok(first[2]>first[0]+100);assert.ok(second[0]>second[2]+100);
    const rms=sec=>{const pcm=execFileSync('ffmpeg',['-v','error','-ss',String(sec),'-i',join(dir,'output.mp4'),'-t','0.5','-vn','-f','f32le','-ac','1','-ar','16000','pipe:1']);let sum=0;for(let o=0;o+4<=pcm.length;o+=4)sum+=pcm.readFloatLE(o)**2;return Math.sqrt(sum/(pcm.length/4));};assert.ok(rms(1)>0.02);assert.ok(rms(6)<0.001);
    execFileSync('ffmpeg',['-v','error','-i',join(dir,'output.mp4'),'-f','null','-'],{stdio:'pipe'});
    t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([1,2]),{status:200}));
    await assert.rejects(()=>productionPackage(p,'var1',product,new AbortController().signal,()=>{}),/Kích thước/);
    assert.throws(()=>buildManifest(p,'var1',{...product,revision:2}),/Hồ sơ/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('concept duration follows complete script timing and stays unknown for untimed or inconsistent drafts',()=>{
  assert.equal(creativeDuration('0–3s: Hook\n3–6s: Product\n6–9s: Action\n9–12s: CTA'),12);
  assert.equal(creativeDuration('0-1.5s: Hook\n1.5-3s: CTA'),3);
  for(const script of ['', 'A product idea', '0–3s: Hook\nUntimed CTA', '0–3s: Hook\n5–8s: Gap', '0–3s: Hook\n2–5s: Overlap', '3–0s: Reversed'])assert.equal(creativeDuration(script),null);
});
