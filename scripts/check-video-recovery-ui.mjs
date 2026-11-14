// Prerequisite: check-t026f-ui.mjs supplies synthetic media and verified render records.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat,copyFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {officeUI} from './office-ui.mjs';
import {ManualMedia} from '../desktop/src/manual-media.mjs';
import {Store} from '../desktop/src/store.mjs';
import {emptyProduct} from '../lib/lab/domain.ts';
const records=JSON.parse(await readFile('outputs/T-026f-media/acceptance-records.json','utf8'));
const product=records.find(r=>r.kind==='product'),old=records.find(r=>r.kind==='production');
product.data.imageUrl='';old.data.name='Bộ clip trước (fixture)';
records.push({id:'other_product',kind:'product',revision:1,createdAt:1,updatedAt:1,data:{...emptyProduct,name:'Sản phẩm chưa có clip'}});
const assets=records.filter(r=>r.kind==='asset'),dirs=(await readdir('outputs/T-026f-ui',{withFileTypes:true})).filter(d=>d.isDirectory()&&d.name.startsWith('isolated-'));
let source;
for(const dir of dirs){const path=resolve('outputs/T-026f-ui',dir.name,'workspace');try{await stat(join(path,'media',assets[0].data.key));source=path;break;}catch{}}
assert.ok(source,'Run check-t026f-ui.mjs first');
const store=new Store(':memory:');store.set('muse_paused',true);
try{await officeUI('M-20261114-video-recovery',records,async({page,local,origin,screenshot,out})=>{
 for(const asset of assets){const from=join(source,'media',asset.data.key),to=join(local.root,'media',asset.data.key);await mkdir(dirname(to),{recursive:true});await copyFile(from,to);assert.equal(createHash('sha256').update(await readFile(to)).digest('hex'),asset.data.sha256);}
 const manual=new ManualMedia({store,local}),fixedDate=new Date(2026,10,14,10,0),packs=[];let selectedProject,opens=0;
 const oldBefore=structuredClone((await manual.records()).find(r=>r.id===old.id));
 await page.exposeFunction('recoveryStatus',()=>({musePaused:true,generationReady:true,active:0,paused:true,profiles:[],batch:null,jobs:store.jobs()}));
 await page.exposeFunction('recoveryManualStatus',()=>manual.status());
 await page.exposeFunction('recoveryExport',async input=>{selectedProject=input.projectId;const pack=await manual.exportPack(input,fixedDate);packs.push(pack);if(packs.length===1){const job=store.enqueue({projectId:selectedProject,productId:product.id,sceneId:'auto_0',sceneRevision:1,name:'Fixture no media',mediaType:'video',references:[]},'no_media_fixture').job;store.put({...job,state:'needs_attention',failureCode:'MUSE_NO_MEDIA',providerId:'fixture_receipt',history:[...job.history,{at:Date.now(),state:'needs_attention',note:'Fixture no media'}]});}return pack;});
 await page.exposeFunction('recoveryOpen',async input=>{opens++;assert.equal(input.projectId,selectedProject);return manual.waitForFiles(input);});
 await page.addInitScript(()=>Object.assign(window.productLabDesktop,{status:()=>window.recoveryStatus(),manualMediaStatus:()=>window.recoveryManualStatus(),manualMediaExport:p=>window.recoveryExport(p),manualMediaOpen:p=>window.recoveryOpen(p),musePackageStart:()=>{throw Error('Fixture must never send Muse');}}));
 await page.goto(origin+'/?view=production&product='+product.id);const screen=page.locator('[data-screen=video]'),run=screen.getByRole('button',{name:'Làm video',exact:true});await run.waitFor();
 await run.click();await page.getByRole('complementary',{name:'Tiếp tục video'}).getByText(/Gói prompt:/).waitFor();
 const recovery=page.getByRole('complementary',{name:'Tiếp tục video'});
 await recovery.getByText(/Muse đã trả lời nhưng chưa tạo video/).waitFor();
 assert.equal(await screen.locator('[data-video-exports] video').count(),0,'Old renders must not become current exports');
 assert.equal(await screen.locator('[data-previous-exports] video').count(),3);
 const library=screen.locator('details').filter({has:page.locator('summary').filter({hasText:'Thư viện sản phẩm'})});
 assert.equal(await library.getAttribute('open'),'');assert.equal(await library.locator('video').count(),8);
 for(const video of await library.locator('video').all())await video.evaluate(async v=>{v.muted=true;await v.play();const deadline=Date.now()+10000;while(!v.error&&v.currentTime<=0&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));if(v.error||v.currentTime<=0)throw Error('Fixture video did not play');v.pause();});
 const first=await readFile(join(packs[0].path,'README-VI.txt'));
 await recovery.getByRole('button',{name:'Xuất gói prompt'}).click();await page.waitForFunction(()=>!document.querySelector('[data-screen=video] header button').disabled);assert.equal(packs.length,2);
 await run.click();await page.waitForFunction(()=>!document.querySelector('[data-screen=video] header button').disabled);assert.equal(packs.length,3);
 assert.equal(new Set(packs.map(p=>p.path)).size,3);assert.deepEqual(await readFile(join(packs[0].path,'README-VI.txt')),first);
 await recovery.getByRole('button',{name:'Mở Hộp nhận'}).click();assert.equal(opens,1);
 await page.reload();await recovery.getByText(/Muse đã trả lời nhưng chưa tạo video/).waitFor();await recovery.getByText('Gói prompt: '+packs.at(-1).path,{exact:true}).waitFor();
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('recovered-'+width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await screen.getByRole('combobox',{name:'Sản phẩm',exact:true}).selectOption('other_product');assert.equal(await screen.locator('video').count(),0);assert.equal(await recovery.count(),0);assert.equal(await screen.getByRole('alert').count(),0);
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('other-product-'+width);}
 const saved=await manual.records();assert.deepEqual(saved.find(r=>r.id===old.id),oldBefore);assert.equal(saved.find(r=>r.id===selectedProject).data.exports.length,0);
 // Same product, different project, same minute: preserve the other project's pack too.
 const request=async body=>{const response=await manual.request('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value.record;};
 let another=await request({id:'another_project',revision:0,action:'create',commandId:'another_create',input:{name:'Another project',productId:product.id,locale:'en-US'}});
 for(const [action,input] of [['scene',{id:'one',name:'Another scene',prompt:'Show the product.',mediaType:'video',ratio:'9:16',duration:8,referenceIds:[]}],['storyboard',{sceneId:'one'}],['media_provider',{provider:'manual'}]])another=await request({id:another.id,revision:another.revision,action,input,commandId:'another_'+action});
 const otherPack=await manual.exportPack({projectId:another.id},fixedDate);assert.ok(!packs.some(p=>p.path===otherPack.path));assert.deepEqual(await readFile(join(packs[0].path,'README-VI.txt')),first);
 return {sameMinutePacks:4,oldClips:5,oldExports:3,playback:true,reloadPersists:true,productIsolation:true,oldProjectUnchanged:true,museSubmissions:0,opens};
},{workerStore:store});}finally{store.close();}
