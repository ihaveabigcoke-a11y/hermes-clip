import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {instagramOverviewFixture} from '../../tests/fixtures/instagram-overview.mjs';

// Compile source offline, with no module hooks, browser, profile, DB or network.
const root=fileURLToPath(new URL('../../',import.meta.url)),outputs=join(root,'outputs');
await mkdir(outputs,{recursive:true});
const scratch=await mkdtemp(join(outputs,'instagram-ui-test-'));
assert.equal(dirname(scratch),resolve(outputs));
const originalLocation=globalThis.location;
after(async()=>{globalThis.location=originalLocation;await rm(scratch,{recursive:true,force:true});});
const entry=join(scratch,'entry.ts');
await writeFile(entry,[
  'export {default as Overview,ProductMetrics,InstagramContentTable} from "../../components/lab/instagram-overview";',
  'export {default as OperationsPanel} from "../../components/lab/operations";',
].join('\n'));
await build({configFile:false,root,publicDir:false,logLevel:'error',plugins:[react()],resolve:{alias:{'@':root}},
  build:{ssr:entry,outDir:join(scratch,'bundle'),rollupOptions:{output:{entryFileNames:'entry.mjs'}}}});
const {Overview,ProductMetrics,InstagramContentTable,OperationsPanel}=await import(pathToFileURL(join(scratch,'bundle/entry.mjs')));
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

test('overview renders profile/link columns, hidden-product switch and the fixed hook comparison note',()=>{
  globalThis.location={href:'http://fixture.invalid/?view=social'};
  const {records,product}=instagramOverviewFixture();
  const products=[product,{...product,id:'old',data:{name:'Archived fixture',archived:true}},{...product,id:'local_qa_product',data:{name:'QA fixture'}}];
  const props={products,records,demo:true,onOpen(){}};
  const html=render(Overview,props);
  for(const label of ['Vào profile','Bấm link','Hiện sản phẩm đã lưu trữ','So sánh hook chỉ có ý nghĩa trong cùng tài khoản, cùng từ khóa CTA.'])assert.ok(html.includes(label),label);
  assert.match(html,/role="switch"/);assert.match(html,/aria-expanded="false"/);
  assert.doesNotMatch(html,/Archived fixture|QA fixture/);
  assert.match(html,/<strong>1<\/strong> sản phẩm/);
  globalThis.location.href+='&ig_showArchived=true';
  const shown=render(Overview,props);
  assert.match(shown,/Archived fixture/);assert.match(shown,/QA fixture/);
  assert.match(shown,/<strong>3<\/strong> sản phẩm/);assert.match(shown,/<input type="checkbox" role="switch" aria-label="Hiện sản phẩm đã lưu trữ" checked=""\/>/);
});

test('content table shows six account/content rows, saved CTA, time, explicit zero and null dash',()=>{
  const {records,product}=instagramOverviewFixture();
  const html=render(InstagramContentTable,{records,productId:product.id});
  const body=html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows=[...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match=>match[1]);
  assert.equal(rows.length,6);
  for(const label of ['Tài khoản','Nội dung','Từ khóa CTA','Lần đo','Vào profile','Bấm link'])assert.ok(html.includes(label),label);
  assert.equal((body.match(/>LED<\/td>/g)||[]).length,4);assert.equal((body.match(/>LINK<\/td>/g)||[]).length,2);
  assert.equal((body.match(/Xem bài đã đăng/g)||[]).length,6);
  const expectedTime=new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date('2026-11-12T01:00:00Z'));
  for(let i=0;i<6;i++){assert.ok(rows[i].includes('Account '+(Math.floor(i/2)+1)));assert.ok(rows[i].includes('Hook '+(i%2+1)));assert.match(rows[i],/datetime="2026-11-12T01:00:00.000Z"/i);assert.ok(rows[i].includes('>'+expectedTime+'</time>'));}
  assert.equal((rows[5].match(/<span>—<\/span>/g)||[]).length,7);
  assert.match(rows[0],/<span>5<\/span>/);assert.match(rows[0],/<span>0<\/span>/);
  assert.doesNotMatch(rows[5],/<span>0<\/span>/);
  const totals=render(ProductMetrics,{records,productId:product.id});
  assert.match(totals,/<dt>Vào profile<\/dt>/);assert.match(totals,/<dt>Bấm link<\/dt>/);
  assert.match(totals,/5\/6 bài đã có số/);
});

test('social route passes archived products to overview and opens their stored content when selected',()=>{
  const {records,product}=instagramOverviewFixture();product.data.archived=true;
  const props={view:'social',records,demo:true,offline:false,persist:async()=>{throw Error('Read-only render');},notify(){},reload(){}};
  globalThis.location={href:'http://fixture.invalid/?view=social&ig_showArchived=true'};
  assert.match(render(OperationsPanel,props),/Fixture product/);
  globalThis.location.href+='&ops_id='+product.id;
  const detail=render(OperationsPanel,props);
  assert.match(detail,/instagram-content-table/);assert.match(detail,/Account 3/);assert.match(detail,/Bấm link/);
  globalThis.location={href:'http://fixture.invalid/?view=landing'};
  assert.match(render(OperationsPanel,{...props,view:'landing'}),/Cần hồ sơ sản phẩm/);
});

test('empty content retains comparison note; stored strings render as text',()=>{
  const {records,product}=instagramOverviewFixture();
  records.find(row=>row.id==='account_1').data.name='<script>bad()</script>';
  const html=render(InstagramContentTable,{records,productId:product.id});
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  const empty=render(InstagramContentTable,{records:[],productId:product.id});
  assert.match(empty,/Chưa có bài đăng/);assert.match(empty,/So sánh hook chỉ có ý nghĩa/);
});

test('UTM column shortens saved links with the full title and retains unknown as a dash',()=>{
  const {records,product}=instagramOverviewFixture();
  const plan=records.find(row=>row.id==='plan_1_1');
  const link='https://shop.example/landing?utm_source=instagram&utm_medium=dm&utm_campaign=light&utm_content=shop-hook-a&utm_term=led';
  plan.data.utmLink=link;
  const html=render(InstagramContentTable,{records,productId:product.id});
  assert.match(html,/<th scope="col">Link UTM<\/th>/);
  assert.ok(html.includes('title="'+link.replaceAll('&','&amp;')+'"'));
  assert.ok(html.includes('>'+link.slice(0,39)+'…</span>'));
  assert.match(html,/<td>LED<\/td><td>—<\/td>/);
  plan.data.utmLink='javascript:alert(1)';assert.doesNotMatch(render(InstagramContentTable,{records,productId:product.id}),/javascript:/);
});

test('plan detail offers landing default, explicit hook choice, saved link and copy without needing publication',()=>{
  const {records,product}=instagramOverviewFixture(),plan=records.find(row=>row.id==='plan_1_1');
  records.push({id:'landing',kind:'landing_page',data:{productId:product.id,ctaUrl:'https://shop.example/landing?ref=partner'}});
  const props={view:'social',records,demo:true,offline:false,persist:async()=>{throw Error('Read-only render');},notify(){},reload(){}};
  globalThis.location={href:'http://fixture.invalid/?view=social&ops_id='+product.id+'&ig_tab=content'};
  for(const status of ['draft','published_manual']){
    plan.data.status=status;
    const html=render(OperationsPanel,props);
    for(const label of ['Link landing gốc','Biến thể / hook cho link','Tạo và lưu link UTM','Sao chép link UTM','Link UTM đã lưu','@fixture_1'])assert.ok(html.includes(label),label);
    assert.match(html,/value="https:\/\/shop.example\/landing\?ref=partner"/);
    assert.match(html,/<option value="variant_plan_1_1" selected=""/);
  }
  plan.data.landingBaseUrl='https://shop.example/custom';plan.data.utmLink='https://shop.example/custom?utm_source=instagram';
  const saved=render(OperationsPanel,props);assert.ok(saved.includes('value="'+plan.data.landingBaseUrl+'"'));
  assert.ok(saved.includes('value="'+plan.data.utmLink+'"'));
});

test('keyword table separates measured zero from missing data and shows manual provenance and approximate view rate',()=>{
  const {records,product}=instagramOverviewFixture();
  const plan=records.find(r=>r.id==='plan_1_1'),metric=records.find(r=>r.id==='metric_'+plan.id);
  const measurement={id:'keyword_fixture',kind:'keyword_comment_measurement',revision:1,updatedAt:Date.now(),data:{planId:plan.id,accountId:plan.data.accountId,sourceUrl:plan.data.postUrl,source:'manual_paste',observedAt:'2026-11-12T02:00:00Z',keyword:'LED',rawText:'alice LED',inputFormat:'username',total:1,matched:1,matchedUniqueUsers:1,examples:['LED']}};
  records.push(measurement);metric.data.approximate=['views'];
  const html=render(InstagramContentTable,{records,productId:product.id});
  for(const label of ['Comment từ khóa','Tỷ lệ comment từ khóa / lượt xem','Dán tay','không cộng các lần dán'])assert.ok(html.includes(label));
  assert.match(html,/<td>1<small>Dán tay/);assert.match(html,/<td>≈ 1%<\/td>/);
  assert.match(html,/<td>—<\/td><td>—<\/td>/);
  measurement.data.matched=0;
  assert.match(render(InstagramContentTable,{records,productId:product.id}),/<td>0<small>Dán tay/);
  metric.data.views=0;
  assert.match(render(InstagramContentTable,{records,productId:product.id}),/<\/small><\/td><td>—<\/td>/);
});

test('published detail offers manual comment input and history while drafts do not',()=>{
  const {records,product}=instagramOverviewFixture();
  const plan=records.find(r=>r.id==='plan_1_1');
  const props={view:'social',records,demo:true,offline:false,persist:async()=>{throw Error('Read-only render');},notify(){},reload(){}};
  globalThis.location={href:'http://fixture.invalid/?view=social&ops_id='+product.id+'&ig_tab=content'};
  const html=render(OperationsPanel,props);
  for(const label of ['Dán comment','Định dạng comment','Chỉ nội dung comment','Username rồi đến comment','Lưu bản đo comment','Chưa có bản đo comment từ khóa'])assert.ok(html.includes(label),label);
  assert.match(html,/placeholder="LED \/ RUN \/ HELP" value="LED"/);
  records.push({id:'paste',kind:'keyword_comment_measurement',revision:1,updatedAt:Date.now(),data:{planId:plan.id,accountId:plan.data.accountId,sourceUrl:plan.data.postUrl,source:'manual_paste',observedAt:'2026-11-12T02:00:00Z',keyword:'LED',rawText:'<script>LED</script>',total:1,matched:1,matchedUniqueUsers:null}});
  const saved=render(OperationsPanel,props);
  assert.match(saved,/Nguồn: dán tay/);assert.match(saved,/thiếu username ở comment khớp/);assert.match(saved,/&lt;script&gt;LED&lt;\/script&gt;/);assert.doesNotMatch(saved,/<script>/);
  plan.data.status='draft';
  assert.doesNotMatch(render(OperationsPanel,props),/Lưu bản đo comment/);
});

test('content preview shows no AI label by default for legacy/null/off plans and required only when explicit',()=>{
  const {product}=instagramOverviewFixture();
  const plan={id:'ai_preview',kind:'content_plan',revision:1,updatedAt:Date.now(),data:{productId:product.id,name:'AI label draft',status:'draft',caption:'English concept'}};
  const props={view:'social',records:[product,plan],demo:true,offline:false,persist:async()=>{throw Error('Read-only render');},notify(){},reload(){}};
  globalThis.location={href:'http://fixture.invalid/?view=social&ops_id='+product.id+'&ig_tab=content'};
  for(const aiLabel of [undefined,null,'off']){
    plan.data.aiLabel=aiLabel;
    const text=render(OperationsPanel,props);
    assert.match(text,/Nhãn AI: Không gắn nhãn/);
    assert.match(text,/English concept/);
  }
  plan.data.aiLabel='required';
  assert.match(render(OperationsPanel,props),/Nhãn AI: Bắt buộc bật trước Share/);
  plan.data.status='published_manual';
  assert.doesNotMatch(render(OperationsPanel,props),/Nhãn AI:/);
});
