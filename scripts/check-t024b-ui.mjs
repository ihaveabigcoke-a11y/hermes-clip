import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
import {todayFixture} from '../tests/fixtures/t024.mjs';
const production=await importModule('lib/lab/production.ts'),{emptyProduct}=await importModule('lib/lab/domain.ts'),{getRenderPlan}=await importModule('lib/lab/render-plan.ts'),{planHookDrafts}=await importModule('lib/lab/hook-matrix.ts'),{buildOfficeView}=await importModule('lib/lab/office-view.ts');
const f=todayFixture({...production,emptyProduct,getRenderPlan,planHookDrafts}),now=Date.now();
f.first.data.price=18;f.second.data.price=40;
const older=structuredClone(f.measurements[0]);older.id='measure_yesterday';older.data.observedAt=new Date(now-86400000).toISOString();older.data.views=250;f.records.push(older);
const project=f.records.find(r=>r.kind==='production'),scene=project.data.scenes[0];
const {parseReaVideo}=await importModule('lib/lab/rea-video.ts');
const reaRoot=resolve('desktop/test/fixtures/rea-video/V01');
const rea=parseReaVideo(JSON.parse(await readFile(join(reaRoot,'breakdown.json'),'utf8')),{timeline:JSON.parse(await readFile(join(reaRoot,'packaging/timeline.json'),'utf8')),readBy:'manual'});
const structure={durationSec:rea.durationSec,cutCount:rea.shots.length-1,cuts:rea.shots.slice(1).map(s=>s.start),contactSheetPath:'fixture.jpg',frames:rea.shots.map(s=>({t:s.start,path:'fixture.jpg'}))};
f.records.push({id:'reference_video_draft_visual_fixture',kind:'reference_video_draft',revision:1,updatedAt:now,data:{id:'visual_fixture',product:'Video mẫu kiểm thử',durationSec:rea.durationSec,cuts:rea.shots.length-1,reaVideo:rea,structure}});
const jobs=['queued','failed','needs_attention'].map((state,i)=>({id:'signal_'+i,state,provider:'muse',createdAt:now-i*60000,updatedAt:now-i*30000,errorKind:i===2?'refused':undefined,request:{projectId:project.id,sceneId:scene.id},history:[{state,at:now-i*30000}]}));
const office=buildOfficeView(f.records,jobs,{},[],now);
// A separate saved v2 draft for visual review; it does not replace the rendered fixture.
const {quickVideoSuggestions}=await import('../lib/lab/quick-video.ts'),{formulaStoryboard}=await importModule('lib/lab/formula-storyboard.ts');
const suggestion=quickVideoSuggestions(f.product,f.records),content=production.newProduction('Khung content kiểm thử',f.product.id,1);
const contentDraft=production.applyProduction(content,'formula_draft',formulaStoryboard(f.product.data,content,suggestion.formula,{...suggestion.values,packaging:{brandName:suggestion.values.brandName,boxText:suggestion.values.boxText}}),'content_fixture');
f.records.push({id:'content_visual_fixture',kind:'production',revision:1,updatedAt:1,data:contentDraft});
await officeUI('T-024b',f.records,async({page,origin,out,screenshot})=>{
 execFileSync(resolve('desktop/tools/ffmpeg/bin/ffmpeg.exe'),['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=gray:s=720x1280:r=1','-t','3','-c:v','libx264','-pix_fmt','yuv420p',join(out,'fixture.mp4')],{windowsHide:true});
 const videoBytes=await readFile(join(out,'fixture.mp4'));await page.route('**/api/assets/*',route=>route.fulfill({contentType:route.request().url().includes('thumbnail')?'image/svg+xml':'video/mp4',body:route.request().url().includes('thumbnail')?'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240"><rect width="160" height="240" fill="#333843"/><text x="20" y="120" fill="white">Clip fixture</text></svg>':videoBytes}));
 page.setDefaultTimeout(12000);const consoleErrors=[];page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text()+' '+msg.location().url);});
 await page.route('**/api/lab?view=office',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({view:office})}));
 const visit=async query=>{await page.goto(origin+'/'+query);await page.waitForFunction(()=>!document.body.innerText.includes('Đang mở không gian làm việc…'));await page.evaluate(()=>document.fonts.ready);};
 const shots=async name=>{for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name);await screenshot(name+'-'+width);}};
 await visit('');assert.deepEqual(await page.locator('.funnel-count').allTextContents(),['2','1','1','1','1','1']);await page.locator('.views-line circle').nth(1).waitFor();await shots('today');
 await visit('?view=products');await page.getByRole('button',{name:'Bảng',exact:true}).click();const table=page.getByRole('region',{name:'Bảng sản phẩm'});await table.waitFor();
 const orders={};for(const col of ['Sản phẩm','Giá bán','Bước hiện tại']){await table.getByRole('button',{name:col,exact:false}).click();orders[col]=await table.locator('tbody tr').evaluateAll(rows=>rows.map(r=>r.getAttribute('data-product-row')));}
 assert.deepEqual(orders['Giá bán'],[f.first.id,f.product.id,f.second.id]);assert.deepEqual(orders['Bước hiện tại'],[f.first.id,f.second.id,f.product.id]);await shots('products-table');
 await visit('?view=results');await page.locator('.hook-product-row').nth(2).waitFor();assert.equal(await page.locator('.hook-product-row').first().locator('rect').count(),3);assert.equal(await page.locator('tr[data-leading=true]').count(),0);assert.doesNotMatch(await page.locator('.hook-product-list').innerHTML(),/NaN|undefined/);await shots('results');
 await visit('?view=social&ops_id='+f.product.id+'&ig_tab=matrix');
 // Existing product workspace exposes the matrix in its own tab.
 if(!await page.getByRole('region',{name:'Bảng hook × tài khoản'}).isVisible())await page.getByRole('button',{name:'Ma trận',exact:true}).click();
 await page.getByRole('region',{name:'Bảng hook × tài khoản'}).waitFor();assert.equal(await page.locator('[data-state=measured]').count(),2);assert.equal(await page.locator('[data-state=draft]').count(),1);await shots('matrix');
 await visit('?view=signals');await page.locator('[data-service]').nth(3).waitFor();
 await page.evaluate(async()=>{const bridge=window.productLabDesktop;const worker=await bridge.status();bridge.status=async()=>({...worker,musePaused:true,profiles:[],jobs:[],active:0});bridge.manualMediaStatus=async()=>({inbox:'fixture',scenes:[],errors:[],unmatched:[]});bridge.integrationStatus=async()=>({config:{},health:{checkedAt:Date.now(),montage:{ready:false}}});bridge.instagramStatus=async()=>({api:{enabled:false},profiles:[]});window.dispatchEvent(new Event('product-lab:workspace-changed'));});
 await page.waitForFunction(()=>document.querySelector('[data-service=render]')?.getAttribute('data-tone')==='error');
 assert.deepEqual(await page.locator('[data-service]').evaluateAll(cards=>cards.map(c=>c.dataset.tone)),['waiting','active','error','unconfigured']);
 assert.equal(await page.locator('[data-event-type=refused]').count(),1);assert.equal(await page.locator('[data-event-type=error]').count(),1);
 await page.getByLabel('Lọc loại sự kiện').selectOption('refused');assert.equal(await page.locator('.signal-events li').count(),1);await page.getByLabel('Lọc loại sự kiện').selectOption('');await shots('signals');
 await visit('?view=products&product='+f.product.id);await page.getByRole('tablist',{name:'Hồ sơ sản phẩm'}).waitFor();await shots('profile');
 await visit('?view=content&production=content_visual_fixture&stage=scenes');await page.getByRole('heading',{name:'Danh sách shot',exact:true}).waitFor();assert.equal(await page.locator('.content-track-row').count(),3);assert.ok(await page.locator('.content-block').count()>=8);
 for(const variant of contentDraft.variants){await page.getByLabel('Biến thể trên dòng thời gian').selectOption(variant.id);const spans=await page.locator('.content-track-row').first().locator('.content-block').evaluateAll(nodes=>nodes.map(n=>({left:parseFloat(n.style.left),width:parseFloat(n.style.width)})));assert.ok(spans.every((s,i)=>!i||s.left>=spans[i-1].left+spans[i-1].width-.001),'Alternative hooks must not overlap on one timeline');}
 await page.getByLabel('Biến thể trên dòng thời gian').selectOption(contentDraft.variants[0].id);await shots('content');
 await visit('?view=competitors');const referenceTable=page.getByRole('region',{name:'Bảng video mẫu'});await referenceTable.waitFor();assert.equal(await referenceTable.locator('tbody tr').count(),1);assert.equal(await page.locator('.reference-shot-strip span').count(),rea.shots.length);assert.equal(await referenceTable.locator('tbody td').nth(2).innerText(),((rea.shots.length-1)/rea.durationSec*60).toLocaleString('vi-VN',{maximumFractionDigits:1}));await shots('references');
 const mockRoot=resolve('D:/hermes-wt/mockups/van-phong-phong-ban');const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.webp':'image/webp','.woff':'font/woff','.mp4':'video/mp4'};
 await page.route('**/mockup/**',async route=>{const relative=decodeURIComponent(new URL(route.request().url()).pathname.slice('/mockup/'.length)),path=resolve(mockRoot,relative);assert.ok(path.startsWith(mockRoot+'\\'));await route.fulfill({contentType:types[extname(path)]??'application/octet-stream',body:await readFile(path)});});
 for(const [name,path] of [['today','index.html'],['profile','product.html'],['content','script.html'],['references','references.html'],['signals','signals.html'],['department','department.html']]){await page.goto(origin+'/mockup/'+path);await page.waitForTimeout(200);await shots('mock-'+name);}
 const comparisons=[];for(const name of ['today','profile','content','references','signals']){const mock=await readFile(join(out,'mock-'+name+'-1366.png')),app=await readFile(join(out,name+'-1366.png'));await page.setViewportSize({width:2732,height:1000});await page.setContent(`<html><body style="margin:0;background:#111217;color:white;font:18px sans-serif"><div style="display:grid;grid-template-columns:1fr 1fr"><section><p style="padding:12px">Bản mẫu của người dùng</p><img style="width:1366px" src="data:image/png;base64,${mock.toString('base64')}"></section><section><p style="padding:12px">App · dữ liệu fixture</p><img style="width:1366px" src="data:image/png;base64,${app.toString('base64')}"></section></div></body></html>`);await screenshot('compare-'+name+'-1366');comparisons.push(name);}
 assert.deepEqual(consoleErrors,[]);return {orders,consoleErrors,comparisons,funnel:[2,1,1,1,1,1],nullHook:true,serviceColors:['waiting','active','error','unconfigured'],refusalSeparate:true};
});
await officeUI('T-024b-empty',[],async({page,origin,screenshot})=>{await page.goto(origin);await page.getByText('Cần ít nhất 2 lần đo',{exact:true}).waitFor();assert.deepEqual(await page.locator('.funnel-count').allTextContents(),Array(6).fill('—'));assert.doesNotMatch(await page.locator('#lab-main').innerText(),/\b0\b/);for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await screenshot('empty-'+width);}return {emptyCharts:true,noFalseZeros:true};});
