import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile, readdir, copyFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Store} from '../src/store.mjs';
import {ManualMedia, probeManualMedia} from '../src/manual-media.mjs';
import {runMediaTool,probeMedia} from '../src/compress.mjs';
import {startLocalServer, importModule} from './helpers/local-server.mjs';

const {emptyProduct}=await importModule('lib/lab/domain.ts');
test('T-007: manual export groups approved v2 shots and maps exact cuts; missing packaging or partial group blocks export',async t=>{
  const f=await fixture(t);
  const {formulaStoryboard}=await importModule('lib/lab/formula-storyboard.ts');
  const {viralFormulasV2}=await importModule('lib/lab/viral-formulas.ts');
  const {newProduction}=await importModule('lib/lab/production.ts');
  const formula=viralFormulasV2[0],draft=formulaStoryboard({},newProduction('V2','product_fixture',1),formula,{ctaKeyword:'BIKE',situation:formula.situationExamples[0],packaging:{brandName:'FIXTURE',boxText:'Night Kit'}});
  let project=await f.command('formula_draft',draft);
  const ids=project.data.scenes.filter(s=>s.storyboardVersion===2).map(s=>s.id);
  for(const sceneId of ids)await f.command('storyboard',{sceneId});
  await assert.rejects(f.media.exportPack({projectId:project.id,sceneIds:ids.slice(1)},new Date(2026,10,12,23,1)),/đủ shot/);
  const pack=await f.media.exportPack({projectId:project.id,sceneIds:ids},new Date(2026,10,12,23,2));
  const timeline=JSON.parse(await readFile(join(pack.path,'timeline.json'),'utf8'));
  assert.equal(timeline.units.length,4);assert.equal(timeline.units.flatMap(u=>u.shots).length,12);
  for(const group of timeline.units) {
    const prompt=await readFile(join(pack.path,group.file.replace('.mp4','.txt')),'utf8');
    assert.match(prompt,/exactly 8 seconds/);assert.match(prompt,/Constraints:/);assert.doesNotMatch(prompt,/narration|neutral handling|AI label|AI-generated/i);
    assert.equal(group.shots[0].trimFromSec,0);
    for(const shot of group.shots) {
      assert.equal(Number((shot.trimToSec-shot.trimFromSec).toFixed(3)),shot.duration);
      assert.equal(shot.duration,project.data.scenes.find(s=>s.id===shot.sceneId).duration);
      assert.ok(shot.duration>=1&&shot.duration<=2.5);
      assert.ok(shot.trimToSec<=8);assert.equal(shot.packaging.brandName,'FIXTURE');
      assert.equal(shot.ffmpegArgs.at(-1),shot.code+'-take1.mp4');
      assert.match(await readFile(join(pack.path,shot.code+'.txt'),'utf8'),/Editing overlay/);
    }
  }
  assert.equal(timeline.overlayStyle.transition,'hard-cut');
  // Probe/cut synthetic media with the same argument array emitted in the pack.
  const group=timeline.units[0],source=join(f.root,group.file),clip=join(f.root,'cut.mp4');
  await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=30','-t','8','-c:v','libx264','-pix_fmt','yuv420p',source]);
  const args=[...group.shots[1].ffmpegArgs];args[2]=source;args[args.length-1]=clip;
  await runMediaTool('ffmpeg',args);assert.equal(group.shots[1].duration,1.2);assert.equal((await probeMedia(clip)).duration,group.shots[1].duration);
  const records=await f.media.records();const damaged=structuredClone(records);
  delete damaged.find(r=>r.id===project.id).data.scenes.find(s=>s.id===ids[0]).packaging;
  f.media.records=async()=>damaged;
  await assert.rejects(f.media.exportPack({projectId:project.id,sceneIds:ids},new Date(2026,10,12,23,3)),/Chưa đặt tên bao bì/);
});
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

test('manual pack contains approved scenes, English instructions, compressed pinned reference and immutable asset and durable codes',async t=>{
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
  assert.deepEqual((await readdir(pack.path)).sort(),[`${code}-ref-1.webp`,`${code}.txt`,'README-VI.txt'].sort());
  const prompt=await readFile(join(pack.path,`${code}.txt`),'utf8');
  assert.match(prompt,/9:16/);assert.match(prompt,/8 seconds/);assert.match(prompt,/Show the product/);assert.match(prompt,/Keep the blue finish/);
  const packed=await readFile(join(pack.path,`${code}-ref-1.webp`));
  assert.ok(packed.length<bytes.length);assert.equal((await probeManualMedia(join(pack.path,`${code}-ref-1.webp`))).type,'image/webp');
  assert.equal((await (await media.request(`/api/assets/${asset.id}`)).arrayBuffer()).byteLength,asset.size);
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
  assert.equal((await media.records()).find(row=>row.id==='project_fixture').data.scenes.find(row=>row.id==='two').mediaProvider,'muse');
  // A scene's explicit choice wins over the project default until reset by the user.
  await command('media_provider',{sceneId:'two',provider:'auto'});
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

test('T-002b: unresolved Muse job blocks manual export and attach; no fallback take is created',async t=>{
  const f=await fixture(t),{media,store,scene,clip}=f;
  const code=(await scene('one')).code;
  const job=store.enqueue({projectId:'project_fixture',productId:'product_fixture',sceneId:'one',sceneRevision:1,references:[]},'uncertain').job;
  store.put({...job,state:'needs_attention'});
  assert.equal((await scene('one')).state,'Cần đối soát');
  await assert.rejects(media.exportPack({projectId:'project_fixture'}));
  await clip(code+'-unknown.mp4');await media.scan();await media.scan();
  const receipt=media.receipts()[0];assert.equal(receipt.state,'unmatched');assert.equal(receipt.provider,'manual');
  await assert.rejects(media.attach(receipt.sha256,'project_fixture','one'),/Cần đối soát/);
  const project=(await media.records()).find(row=>row.id==='project_fixture');
  assert.equal(project.data.scenes[0].takes.length,0);assert.equal(store.jobs().length,1);
  await assert.rejects(media.request('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:project.id,revision:project.revision,commandId:'bypass',action:'manual_result',input:{sceneId:'one',sceneRevision:1,assetId:receipt.assetId}})}),/Cần đối soát/);
});

test('T-002b A: unknown Muse job for scene X cannot block manual scene Y',async t=>{
  const {media,store,command}=await fixture(t);
  await command('storyboard',{sceneId:'two'});
  const job=store.enqueue({projectId:'project_fixture',sceneId:'one',references:[]},'scene_x').job;
  store.put({...job,state:'needs_attention'});
  const project=(await media.records()).find(row=>row.id==='project_fixture');
  assert.equal(media.route(project.data,project.data.scenes[0],project.id).reason,'Cần đối soát');
  assert.equal(media.route(project.data,project.data.scenes[1],project.id).blocked,false);
  const pack=await media.exportPack({projectId:project.id,sceneIds:['two']});
  assert.equal(media.route(project.data,project.data.scenes[1],project.id).provider,'manual');
  assert.equal(Object.values(store.get('manual_exports')).find(row=>row.path===pack.path).provider,'manual');
  assert.equal((await readdir(pack.path)).filter(name=>name.endsWith('.txt')&&name!=='README-VI.txt').length,1);
});

test('T-002c G: skip reconciliation unblocks manual for old Muse receipts only; running jobs, later jobs and replays stay safe',async t=>{
  const {media,store,scene,clip}=await fixture(t);
  const code=(await scene('one')).code;
  // Real-data shape: needs_attention, projectId + sceneId, no providerId/providerUrl.
  const old=store.enqueue({projectId:'project_fixture',productId:'product_fixture',sceneId:'one',sceneRevision:1,references:[]},'old_uncertain').job;
  store.put({...old,state:'needs_attention'});
  const project=async()=>(await media.records()).find(row=>row.id==='project_fixture');
  const post=async(body)=>media.request('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const skip=async(commandId)=>{const p=await project();return post({id:p.id,revision:p.revision,commandId,action:'skip_reconciliation',input:{sceneId:'one'}});};
  assert.equal((await scene('one')).state,'Cần đối soát');
  await assert.rejects(media.exportPack({projectId:'project_fixture'}));
  // (b) an in-flight Muse job cannot be skipped past.
  const running=store.enqueue({projectId:'project_fixture',productId:'product_fixture',sceneId:'one',sceneRevision:1,references:[{sha256:'a'.repeat(64)}]},'in_flight').job;
  store.put({...running,state:'submitted'});
  await assert.rejects(skip('skip_while_running'),/đang chạy/);
  assert.equal((await project()).data.scenes[0].museReconciledAt,undefined);
  store.put({...store.job(running.id),state:'ready'});
  // Skip: receipts and jobs are kept, manual works for that scene.
  const done=await (await skip('skip_once')).json();
  const mark=done.record.data.scenes[0].museReconciledAt;
  assert.ok(Number.isInteger(mark)&&mark>=old.createdAt);
  assert.equal(store.job(old.id).state,'needs_attention');assert.equal(store.jobs().length,2);
  assert.equal((await scene('one')).state,'Chờ xuất prompt');
  const pack=await media.exportPack({projectId:'project_fixture'});
  assert.ok((await readdir(pack.path)).includes(code+'.txt'));
  await clip(code+'-after-skip.mp4');await media.scan();await media.scan();
  assert.equal((await project()).data.scenes[0].takes.length,1);
  // (d) replaying the same command is deduplicated; skipping again with nothing uncertain is refused.
  const replay=await (await post({id:'project_fixture',revision:0,commandId:'skip_once',action:'skip_reconciliation',input:{sceneId:'one'}})).json();
  assert.equal(replay.deduplicated,true);assert.equal(replay.record.data.scenes[0].museReconciledAt,mark);
  await assert.rejects(skip('skip_nothing'),/không có kết quả Muse chưa rõ/);
  // (a) a Muse receipt created after the mark blocks again.
  const late=store.enqueue({projectId:'project_fixture',productId:'product_fixture',sceneId:'one',sceneRevision:1,references:[{sha256:'b'.repeat(64)}]},'late_uncertain').job;
  store.put({...late,createdAt:mark+1,state:'needs_attention'});
  assert.equal((await scene('one')).state,'Cần đối soát');
  await assert.rejects(media.exportPack({projectId:'project_fixture'}));
});

test('T-002c G (c): a skipped old job without providerId can never be resumed or rechecked into a new Muse send',async t=>{
  const {media,store}=await fixture(t);
  const {Worker}=await import('../src/worker.mjs');
  let launches=0;
  const worker=new Worker(store,media.local.root,{launchPersistentContext:async()=>{launches++;throw Error('Must not open Muse');}},{});
  worker.readProductionRecord=async id=>(await media.records()).find(row=>row.kind==='production'&&row.id===id);
  store.set('profiles',[{id:'one',enabled:true,proxy:{server:''}}]);
  const old=store.enqueue({projectId:'project_fixture',sceneId:'one',references:[]},'old_skip').job;
  store.put({...old,state:'needs_attention',profileId:'one'});
  const p=(await media.records()).find(row=>row.id==='project_fixture');
  await media.request('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,revision:p.revision,commandId:'skip_c',action:'skip_reconciliation',input:{sceneId:'one'}})});
  await worker.setMusePaused({paused:false});
  await assert.rejects(worker.resume(old.id),{message:'Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.'});
  await assert.rejects(worker.recheckResult({id:old.id}),{message:'Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.'});
  assert.equal(launches,0);assert.equal(store.job(old.id).state,'needs_attention');
});


test('T-006: compressed intake trashes once after take commit; original hash deduplicates retry',async t=>{
  const f=await fixture(t),code=(await f.scene('one')).code;
  const path=await f.clip(code+'-compressed.mp4'),original=await readFile(path),trashed=[];
  f.media.trashItem=async target=>{const p=(await f.media.records()).find(r=>r.id==='project_fixture');assert.equal(p.data.scenes[0].takes.length,1);trashed.push(target);};
  await f.media.scan();await f.media.scan();await f.media.scan();
  const receipt=f.media.receipts()[0];assert.equal(receipt.state,'received');assert.ok(receipt.sourceSha256);assert.ok(receipt.compression);assert.ok(receipt.trashedAt);assert.deepEqual(trashed,[path]);
  const take=(await f.media.records()).find(r=>r.id==='project_fixture').data.scenes[0].takes[0];assert.deepEqual(take.compression,receipt.compression);
  assert.deepEqual(await readFile(path),original,'trash mock does not delete any real file');
  const restarted=new ManualMedia({store:f.store,local:f.local,trashItem:f.media.trashItem});
  await writeFile(join(f.media.inbox(),code+'-duplicate.mp4'),original);await restarted.scan();await restarted.scan();
  assert.equal(restarted.receipts().length,1);assert.equal(trashed.length,1);
  assert.equal((await f.media.records()).find(r=>r.id==='project_fixture').data.scenes[0].takes.length,1);
});
test('T-006: compression failure never uploads or trashes; source remains in File cần kiểm tra',async t=>{
  const f=await fixture(t),code=(await f.scene('one')).code;
  const path=await f.clip(code+'-failure.mp4'),bytes=await readFile(path);let trash=0;
  f.media.trashItem=async()=>{trash++;};f.media.compress=async()=>{throw Error('Không nén được clip ≤ 15 giây xuống dưới giới hạn video');};
  await f.media.scan();await f.media.scan();assert.equal(trash,0);assert.equal(f.media.receipts().length,0);assert.deepEqual(await readFile(path),bytes);
  assert.match((await f.media.status()).errors[0].message,/Không nén được/);
  assert.equal((await f.media.records()).filter(r=>r.kind==='asset').length,0);
});
test('T-006: legacy receipt is never trashed; replaced source is retained',async t=>{
  const f=await fixture(t),code=(await f.scene('one')).code;
  const path=await f.clip(code+'-legacy.mp4');await f.media.scan();await f.media.scan();
  let trash=0;f.media.trashItem=async()=>{trash++;};const receipt=f.media.receipts()[0];
  await f.media.recycleSource({...receipt,sourceSha256:undefined,compression:undefined});assert.equal(trash,0);
  await writeFile(path,'replaced by user');await assert.rejects(f.media.recycleSource(receipt),/đã thay đổi/);assert.equal(trash,0);assert.equal(await readFile(path,'utf8'),'replaced by user');
});

test('T-006: long light intake is imported without inflation and trashes only after success',async t=>{
  // Boss phụ: the ~2 Mbps floor only guards shrinking heavy videos (see compress.test 30s heavy);
  // a light 60s clip must not be inflated to >6 MB as before.
  const f=await fixture(t),code=(await f.scene('one')).code,path=join(f.media.inbox(),code+'-long.mp4');
  await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=720x1280:r=12','-t','60','-c:v','libx264','-threads','2',path]);
  const before=(await stat(path)).size;
  const trashed=[];f.media.trashItem=async path=>{trashed.push(path);};await f.media.scan();await f.media.scan();
  const receipt=f.media.receipts()[0],take=(await f.media.records()).find(r=>r.id==='project_fixture').data.scenes[0].takes[0];
  assert.equal(receipt.state,'received');assert.equal(take.compression.overLimit,false);assert.ok(take.size<=before);assert.deepEqual([take.metadata.width,take.metadata.height],[720,1280]);assert.equal(take.metadata.duration,60);assert.deepEqual(trashed,[path]);
});

test('T-006: two distinct source hashes converging to one compressed hash keep both receipts',async t=>{
  const f=await fixture(t),code=(await f.scene('one')).code,first=await f.clip(code+'-a.mp4'),bytes=await readFile(first),trashed=[];
  const free=Buffer.alloc(64);free.writeUInt32BE(64);free.write('free',4);
  const second=join(f.media.inbox(),code+'-b.mp4');await writeFile(second,Buffer.concat([bytes,free]));
  f.media.trashItem=async path=>{trashed.push(path);};await f.media.scan();await f.media.scan();
  const receipts=f.media.receipts();assert.equal(receipts.length,2);assert.notEqual(receipts[0].sourceSha256,receipts[1].sourceSha256);assert.equal(receipts[0].sha256,receipts[1].sha256);
  assert.ok(receipts.every(r=>r.state==='received'&&r.trashedAt));assert.deepEqual(trashed.sort(),[first,second].sort());
});

test('T-006: Windows trash failure keeps original and retries at most three times',async t=>{
  const f=await fixture(t),code=(await f.scene('one')).code,path=await f.clip(code+'-trash-denied.mp4'),bytes=await readFile(path);let calls=0;
  f.media.trashItem=async()=>{calls++;throw Error('Windows trash denied');};
  for(let i=0;i<7;i++)await f.media.scan();
  assert.equal(calls,3);assert.deepEqual(await readFile(path),bytes);assert.equal(f.media.receipts()[0].state,'received');assert.equal(f.media.receipts()[0].trashedAt,undefined);
  assert.match((await f.media.status()).errors[0].message,/3 lần/);
  assert.equal((await f.media.records()).find(r=>r.id==='project_fixture').data.scenes[0].takes.length,1);
});
