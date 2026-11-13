// T-025: same persisted fixture, exact viewports, visible glyphs (including shell).
// No account, external service or installed workspace is used.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
import {todayFixture} from '../tests/fixtures/t024.mjs';
const phase=process.argv[2]??'after',out=resolve('outputs/T-025-ui');
assert.ok(['before','after'].includes(phase));await mkdir(out,{recursive:true});
const now=Date.parse('2026-11-13T07:00:00Z');
const production=await importModule('lib/lab/production.ts');
const {emptyProduct}=await importModule('lib/lab/domain.ts');
const {getRenderPlan}=await importModule('lib/lab/render-plan.ts');
const {planHookDrafts}=await importModule('lib/lab/hook-matrix.ts');
let f;
try{f=JSON.parse(await readFile(join(out,'fixture.json'),'utf8'));}catch(error){
 if(error.code!=='ENOENT'||phase!=='before')throw error;
 f=todayFixture({...production,emptyProduct,getRenderPlan,planHookDrafts},now);
 f.first.data.price=18;f.second.data.price=40;
 const older=structuredClone(f.measurements[0]);older.id='measure_yesterday';older.data.observedAt=new Date(now-86400000).toISOString();older.data.views=250;f.records.push(older);
 const {quickVideoSuggestions}=await import('../lib/lab/quick-video.ts');
 const {formulaStoryboard}=await importModule('lib/lab/formula-storyboard.ts');
 const suggestion=quickVideoSuggestions(f.product,f.records),content=production.newProduction('Khung content kiểm thử',f.product.id,1);
 f.records.push({id:'content_visual_fixture',kind:'production',revision:1,updatedAt:1,data:production.applyProduction(content,'formula_draft',formulaStoryboard(f.product.data,content,suggestion.formula,{...suggestion.values,packaging:{brandName:suggestion.values.brandName,boxText:suggestion.values.boxText}}),'content_fixture')});
 const {candidateSchema,researchBatchSchema}=await importModule('lib/lab/operations.ts');
 const names=['Đèn vòng cổ thú cưng','Túi đựng đồ đi bộ','Đèn đọc sách','Găng chải lông thú cưng','Đai phản quang chạy bộ','Túi đựng giày gấp gọn'];
 const candidates=names.map((name,i)=>candidateSchema.parse({id:'visual_candidate_'+i,name,supplierUrl:'https://fixture.invalid/item/'+i,evidenceNotes:'Dữ liệu kiểm thử',imageUrl:'https://fixture.invalid/photo.svg',cost:i<3?5.2:null,shipping:i<3?2.6:null,price:34,matchType:i===0?'exact_sku':'similar',verdict:['try','hold','reject'][i%3],visualPayoff:'Kết quả nhìn thấy trong cùng một góc máy.',marketEvidence:[{label:'Lượt xem',value:1200,unit:'lượt',period:'Tháng 11/2026',market:'US',sourceUrl:'https://fixture.invalid/reviews',observedAt:new Date(now).toISOString()}]}));
 f.records.push({id:'visual_batch',kind:'research_batch',revision:1,updatedAt:now,data:researchBatchSchema.parse({name:'Sáu ứng viên · kiểm thử',candidates})});
 for(const r of f.records.filter(r=>r.kind==='product'))r.data.imageUrl='https://fixture.invalid/photo.svg';
 const {parseReaVideo}=await importModule('lib/lab/rea-video.ts'),reaRoot=resolve('desktop/test/fixtures/rea-video/V01');
 const rea=parseReaVideo(JSON.parse(await readFile(join(reaRoot,'breakdown.json'),'utf8')),{timeline:JSON.parse(await readFile(join(reaRoot,'packaging/timeline.json'),'utf8')),readBy:'manual'});
 f.records.push({id:'reference_video_draft_visual_fixture',kind:'reference_video_draft',revision:1,updatedAt:now,data:{id:'visual_fixture',product:'Video mẫu kiểm thử',durationSec:rea.durationSec,cuts:rea.shots.length-1,reaVideo:rea,structure:{durationSec:rea.durationSec,cutCount:rea.shots.length-1,cuts:rea.shots.slice(1).map(s=>s.start),contactSheetPath:'fixture.jpg',frames:rea.shots.map(s=>({t:s.start,path:'fixture.jpg'}))}}});
 await writeFile(join(out,'fixture.json'),JSON.stringify(f,null,2));
}
const project=f.records.find(r=>r.kind==='production'),scene=project.data.scenes[0];
const jobs=['queued','failed','needs_attention'].map((state,i)=>({id:'signal_'+i,state,provider:'muse',createdAt:now-i*60000,updatedAt:now-i*30000,errorKind:i===2?'refused':undefined,request:{projectId:project.id,sceneId:scene.id},history:[{state,at:now-i*30000}]}));
const {buildOfficeView}=await importModule('lib/lab/office-view.ts'),office=buildOfficeView(f.records,jobs,{},[],now);
const screens=[
 ['today','', '.today-view'],['research','?view=research&ops_id=visual_batch','.research-comparison'],
 ['products','?view=products','.product-grid'],['profile','?view=products&product='+f.product.id,'.product-profile'],
 ['content','?view=content&production=content_visual_fixture&stage=scenes','.content-board'],
 ['media','?view=production&production='+project.id+'&stage=scenes','.production-workspace'],
 ['library','?view=library','.workspace-library'],['matrix','?view=social&ops_id='+f.product.id+'&ig_tab=matrix','.hook-matrix'],
 ['results','?view=results','.metrics-table'],['signals','?view=signals','[data-service]'],
 ['settings','?view=settings','.connection-hero'],['references','?view=competitors','.reference-gallery'],
];
await officeUI('T-025',f.records,async({page,origin})=>{
 await page.addInitScript(at=>{Date.now=()=>at;},now);
 page.setDefaultTimeout(15000);
 const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 const illustration='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="#eae1d3"/><ellipse cx="240" cy="282" rx="116" ry="18" fill="#252720" opacity=".15"/><path d="M153 108 Q240 58 327 108 L344 249 Q240 290 136 249 Z" fill="#545b45"/><path d="M171 128 Q240 87 309 128" fill="none" stroke="#d4ff3a" stroke-width="16"/><path d="M177 168 Q240 144 303 168" fill="none" stroke="#b7c58b" stroke-width="5"/><text x="240" y="328" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#545b45">Hình kiểm thử</text></svg>';
 await page.route('https://fixture.invalid/photo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:illustration}));
 execFileSync(resolve('desktop/tools/ffmpeg/bin/ffmpeg.exe'),['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=gray:s=720x1280:r=1','-t','3','-c:v','libx264','-pix_fmt','yuv420p',join(out,'fixture.mp4')],{windowsHide:true});
 const bytes=await readFile(join(out,'fixture.mp4'));
 await page.route('**/api/assets/*',r=>r.fulfill({contentType:r.request().url().includes('thumbnail')?'image/svg+xml':'video/mp4',body:r.request().url().includes('thumbnail')?illustration:bytes}));
 await page.route('**/api/lab?view=office',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({view:office})}));
 const rows=[];
 for(const [name,query] of screens){
  await page.setViewportSize({width:1366,height:768});await page.goto(origin+'/'+query);
  await page.waitForFunction(()=>!document.body.innerText.includes('Đang mở không gian làm việc…'));
  await page.waitForTimeout(350);await page.evaluate(()=>document.fonts.ready);
  if(name==='matrix'&&!await page.getByRole('region',{name:'Bảng hook × tài khoản'}).isVisible())await page.getByRole('button',{name:'Ma trận',exact:true}).click();
  for(const [width,height] of [[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(150);
   const metrics=await page.evaluate(()=>{
    const visible=(el,r)=>{
     if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||el.closest('[aria-hidden=true],.sr-only,option,script,style'))return false;
     let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
     for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}if(/hidden|clip|auto|scroll/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}
     return right>left&&bottom>top;
    };
    let text='';const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const n=walker.currentNode,el=n.parentElement;if(!el||!n.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(n);if(!visible(el,r.getBoundingClientRect()))continue;
     for(let i=0;i<n.textContent.length;i++){r.setStart(n,i);r.setEnd(n,i+1);if(visible(el,r.getBoundingClientRect()))text+=n.textContent[i];}text+=' ';
    }
    // Selected option labels are rendered by the native select, not the option node.
    for(const el of document.querySelectorAll('select'))if(visible(el,el.getBoundingClientRect()))text+=(el.selectedOptions[0]?.textContent??'')+' ';
    text=text.replace(/\s+/g,' ').trim();
    const visuals=[...document.querySelectorAll('img,svg,canvas')].filter(el=>{const r=el.getBoundingClientRect();return r.width>=48&&r.height>=48&&visible(el,r);}).map(el=>({tag:el.tagName,cls:el.getAttribute('class')}));
    const paragraphs=[...document.querySelectorAll('#lab-main p')].filter(el=>visible(el,el.getBoundingClientRect())).map(el=>el.innerText.trim()).filter(t=>t.length>120);
    return {characters:text.length,text,visuals,paragraphs,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   await page.screenshot({path:join(out,phase+'-'+name+'-'+width+'.png'),animations:'disabled'});
   rows.push({screen:name,width,height,...metrics});
  }
 }
 await writeFile(join(out,phase+'-metrics.json'),JSON.stringify({phase,now,fixture:true,rows,consoleErrors},null,2));
 const root=resolve('D:/hermes-wt/mockups/van-phong-phong-ban');
 await page.route('**/mockup/**',async r=>{const path=resolve(root,decodeURIComponent(new URL(r.request().url()).pathname.slice('/mockup/'.length)));assert.ok(path.startsWith(root+sep));await r.fulfill({contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.webp':'image/webp','.woff':'font/woff','.mp4':'video/mp4'})[extname(path)]??'application/octet-stream',body:await readFile(path)});});
 for(const [name,file] of [['today','index.html'],['profile','product.html'],['content','script.html'],['references','references.html'],['signals','signals.html'],['department','department.html']]){
  if(phase==='before'){await page.goto(origin+'/mockup/'+file);await page.waitForTimeout(300);for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await page.screenshot({path:join(out,'mock-'+name+'-'+width+'.png'),animations:'disabled'});}}
  if(phase==='after'&&name!=='department'){
   const mock=await readFile(join(out,'mock-'+name+'-1366.png')),app=await readFile(join(out,'after-'+name+'-1366.png'));
   await page.setViewportSize({width:2732,height:812});await page.setContent(`<body style="margin:0;background:#111217;color:white;font:18px sans-serif"><div style="display:flex"><section><div style="height:44px">Bản mẫu người dùng</div><img src="data:image/png;base64,${mock.toString('base64')}"></section><section><div style="height:44px">App · dữ liệu kiểm thử</div><img src="data:image/png;base64,${app.toString('base64')}"></section></div></body>`);await page.screenshot({path:join(out,'compare-'+name+'-1366.png')});
  }
 }
 assert.deepEqual(consoleErrors,[]);
 console.log(JSON.stringify(rows.filter(r=>r.width===1366).map(r=>({screen:r.screen,chars:r.characters,visuals:r.visuals.length,long:r.paragraphs.length}))));
 return {phase,fixture:true};
});
