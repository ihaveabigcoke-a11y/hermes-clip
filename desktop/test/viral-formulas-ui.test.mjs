import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importModule} from './helpers/local-server.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {analysisReferences,analysisResponse,structureFor} from '../../tests/fixtures/formula-analysis.mjs';

// Actual React source rendered offline. No browser, network, desktop IPC or
// real workspace is involved. Match the existing source component test setup.
const {default: ViralFormulas} = await importModule('components/lab/viral-formulas.tsx');
const {viralFormulas, viralFormulaRecordId} = await importModule('lib/lab/viral-formulas.ts');
const {FormulaDraftPanel} = await importModule('components/lab/production-intelligence.tsx');
const {newProduction} = await importModule('lib/lab/production.ts');
const {ReferenceDraftPreview} = await importModule('components/lab/reference-video.tsx');
const {FormulaAnalysisPreview,FormulaChangeProposals,ReferenceAnalysisInput}=await importModule('components/lab/reference-video.tsx');
const {parseFormulaAnalysis,proposeFormulaChanges}=await importModule('lib/lab/formula-analysis.ts');
const {draftReferenceVideo} = await importModule('lib/lab/viral-reference.ts');
const render = records => renderToStaticMarkup(React.createElement(ViralFormulas, {records}));

test('T-008: timeline labels cover all twelve fixtures without mutating source values or English prompts',async()=>{
  const {ReaTimeline}=await importModule('components/lab/rea-video.tsx');
  const {parseReaVideo}=await importModule('lib/lab/rea-video.ts');
  const labels=new Set();let sample;
  for(let i=1;i<=12;i++){
    const folder=new URL(`./fixtures/rea-video/V${String(i).padStart(2,'0')}/`,import.meta.url);
    const raw=JSON.parse(await readFile(new URL('breakdown.json',folder),'utf8'));
    const timeline=JSON.parse(await readFile(new URL('packaging/timeline.json',folder),'utf8'));
    const data=parseReaVideo(raw,{timeline,readBy:'manual'}),before=JSON.stringify(data);
    const html=renderToStaticMarkup(React.createElement(ReaTimeline,{data}));
    const rows=[...html.matchAll(/<tr>(.*?)<\/tr>/gs)].slice(1);
    assert.equal(rows.length,data.shots.length);
    for(const row of rows){
      const cells=[...row[1].matchAll(/<td\b[^>]*>(.*?)<\/td>/gs)];
      const display=cells[1][1].replace(/<[^>]*>/g,'\n');
      assert.doesNotMatch(display,/Khác \(|\b[a-z]+(?:_[a-z]+)+\b|\b(?:static|push-in|pull-out|hook|proof|payoff|context|info|turn|cta)\b/);
      for(const label of display.split('\n'))if(label)labels.add(label);
    }
    for(const p of data.remakePrompts){
      const escaped=renderToStaticMarkup(React.createElement('p',null,p.prompt));
      assert.ok(html.includes(escaped),'English recreation prompt must render unchanged.');
    }
    assert.equal(JSON.stringify(data),before,'Rendering must not change stored/exported data.');
    sample=data;
  }
  assert.equal(labels.size,14,'All seven camera and seven narrative labels must be covered.');
  for(const label of ['Máy đứng yên','Máy đứng, chủ thể chuyển động','Đẩy máy vào','Mở đầu','Bằng chứng','Kết quả'])assert.ok(labels.has(label));
  const unknown=structuredClone(sample);
  unknown.shots[0].camera='<custom_move>';
  unknown.narrative[0].role='unknown_role';
  let html=renderToStaticMarkup(React.createElement(ReaTimeline,{data:unknown}));
  assert.ok(html.includes('Khác (&lt;custom_move&gt;)'));
  assert.ok(html.includes('Khác (unknown_role)'));
  unknown.shots[0].camera=null;unknown.narrative=[];
  html=renderToStaticMarkup(React.createElement(ReaTimeline,{data:unknown}));
  assert.match(html,/Chưa biết/);assert.match(html,/Chờ đọc ảnh/);
});

test('Muse analysis prompt states the two attached sheets and parse keeps partial coverage visible',async()=>{
  const {referenceMusePrompt,parseReferenceMuseResponse}=await importModule('lib/lab/reference-muse.ts');
  const structure=structureFor();
  structure.contactSheets.dense.push({...structure.contactSheets.dense[0],path:'later-sheet.jpg',fromSec:30,toSec:40});
  const context={structure,caption:'Comment LED',fileName:'example.mp4',formulas:viralFormulas};
  const original=structuredClone(context),prompt=referenceMusePrompt(context);
  assert.match(prompt,/FIRST dense sheet/);assert.match(prompt,/Later dense pages are NOT attached/);
  assert.doesNotMatch(prompt,/later-sheet\.jpg/);assert.ok(prompt.length<16000);
  assert.match(referenceMusePrompt(context,true),/^Repair your previous response as valid JSON/);
  assert.match(referenceMusePrompt(context,true),/same two images already attached/);
  assert.throws(()=>parseReferenceMuseResponse('invalid',context),/chưa đúng cấu trúc/);
  const parsed=parseReferenceMuseResponse(JSON.stringify(analysisResponse()),context);
  assert.equal(parsed.durationSec,structure.durationSec);assert.ok(parsed.warnings.some(w=>w.includes('sheet dày đầu tiên')));
  assert.deepEqual(context,original);
});

test('Muse controls disclose cost and review-only behavior; no profile or receipt read means no Send',async()=>{
  const {ReferenceMuseAnalysis}=await importModule('components/lab/reference-video.tsx');let calls=0;
  const html=renderToStaticMarkup(React.createElement(ReferenceMuseAnalysis,{jobId:'fixture',structure:structureFor(),caption:'',fileName:'',formulas:viralFormulas,
    disabled:false,onBusy:()=>calls++,onResponse:()=>calls++}));
  for(const text of ['Muse đang tạm dừng','Tốn 1 lượt Muse','Kết quả chỉ điền để bạn duyệt, chưa lưu','Chưa có profile đang bật'])assert.ok(html.includes(text),text);
  assert.match(html,/<button[^>]*disabled/);assert.equal(calls,0);
});

test('offline JSON analysis preview exposes beats, CTA provenance, matches and warnings as escaped text',()=>{
  const structure=structureFor(),analysis=parseFormulaAnalysis(JSON.stringify({...analysisResponse(),hookText:'<script>fake</script>',ctaSource:'caption'}),structure,{caption:'Missing keyword'});
  const html=renderToStaticMarkup(React.createElement(FormulaAnalysisPreview,{analysis,formulas:viralFormulas}));
  for(const text of ['<table class="lab-table">','Thời gian (giây)','Loại beat','Nguồn CTA: Chưa xác minh','Khớp đủ','Không xác minh','&lt;script&gt;fake&lt;/script&gt;'])assert.ok(html.includes(text),text);
  assert.match(html,/10.73–14.30/);assert.doesNotMatch(html,/10.725000000000001/);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/Chưa có transcript/);
});

test('manual prompt input lists every sparse/dense path and no render invokes copy, parser, provider or persistence',()=>{
  let actions=0;
  const structure=structureFor(),html=renderToStaticMarkup(React.createElement(ReferenceAnalysisInput,{structure,caption:'Comment LED',fileName:'LED.mp4',jsonText:'{}',disabled:false,formulas:viralFormulas,
    onJson:()=>actions++,onParse:()=>actions++,onCopy:()=>actions++}));
  for(const text of ['Sao chép prompt phân tích','Dán kết quả JSON','Đọc kết quả JSON',structure.contactSheetPath,structure.contactSheets.dense[0].path])assert.ok(html.includes(text),text);
  assert.equal(actions,0);
  const legacy=renderToStaticMarkup(React.createElement(ReferenceAnalysisInput,{structure:{...structure,contactSheets:undefined},caption:'',fileName:'',jsonText:'',disabled:true,formulas:viralFormulas,onJson:()=>actions++,onParse:()=>actions++,onCopy:()=>actions++}));
  assert.match(legacy,/chưa có sheet dày/);assert.match(legacy,/<button[^>]*\sdisabled=""/);
});

test('formula proposals expose exact new version preview and candidate is disabled; rendering never saves',()=>{
  let saves=0;
  const renderChanges=changes=>renderToStaticMarkup(React.createElement(FormulaChangeProposals,{changes,disabled:false,onCreate:()=>saves++}));
  const one=analysisReferences[9],candidate=renderChanges(proposeFormulaChanges([one],viralFormulas));
  assert.match(candidate,/Ứng viên công thức/);assert.match(candidate,/cần thêm 1 ví dụ/);assert.match(candidate,/<button[^>]*\sdisabled=""/);
  const html=renderChanges(proposeFormulaChanges([one,{...one,id:'R2'}],viralFormulas));
  assert.match(html,/Xem phiên bản sẽ lưu · v1/);assert.match(html,/Tạo phiên bản công thức mới/);assert.doesNotMatch(html,/<button[^>]*\sdisabled=""/);assert.equal(saves,0);
});

test('formula library exposes analysis only with a save handler and renders a separate draft with bounded preview',()=>{
  const draft=draftReferenceVideo({id:'sample',product:'<script>sample</script>',structure:{durationSec:6,width:90,height:160,aspectRatio:'9:16',cuts:[2,4],cutCount:2,contactSheetPath:'private/local/sheet.jpg',frames:[{t:0,path:'private/local/0.jpg'}]}});
  let saves=0;
  const html=renderToStaticMarkup(React.createElement(ViralFormulas,{records:[{id:'reference_video_draft_sample',kind:'reference_video_draft',data:draft}],disabled:true,onSaveDraft:async()=>{saves++;}}));
  assert.match(html,/Phân tích video mẫu/);assert.match(html,/<button[^>]*disabled/);assert.match(html,/Tham chiếu nháp đã lưu · 1/);
  assert.match(html,/&lt;script&gt;sample&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/private\/local/);
  assert.match(html,/6 giây · 2 lần cắt/);assert.match(html,/90 × 160 · 9:16/);assert.match(html,/Chưa có nhãn chữ/);
  assert.equal(saves,0);
  const preview=renderToStaticMarkup(React.createElement(ReferenceDraftPreview,{draft,contactUrl:'blob:verified-fixture'}));
  assert.match(preview,/<img[^>]*src="blob:verified-fixture"/);assert.match(preview,/max-width:100%/);
});
test('formula composer includes saved versions, keyword entry and draft-only controls without provider calls',()=>{
  const custom={...viralFormulas[0],version:3,name:'Saved English formula'};
  const extra={...custom,id:'user_formula',name:'User formula'};
  let saves=0;
  const html=renderToStaticMarkup(React.createElement(FormulaDraftPanel,{
    records:[custom,extra].map(data=>({id:viralFormulaRecordId(data),kind:'viral_formula',data})),
    production:newProduction('Fixture','p',1),product:{traits:['night_glow']},disabled:true,onDrafts:async()=>{saves++;},
  }));
  assert.match(html,/Khung content từ công thức/);
  assert.match(html,/Saved English formula · v3 · Gợi ý/);
  assert.match(html,/User formula · v3/);
  assert.match(html,/Từ khóa CTA · một từ tiếng Anh in hoa/);
  assert.doesNotMatch(html,/value="LINK"/);
  assert.match(html,/id="formula-keyword"[^>]*required/);
  for(const label of ["Vị trí CTA","Tên bao bì","Chữ trên hộp","Tình huống mở đầu"])assert.ok(html.includes(label));
  assert.match(html,/Soạn hai mở đầu A\/B/);
  assert.match(html,/Chỉ lưu cảnh nháp, chưa duyệt hoặc gửi Muse/);
  assert.match(html,/<select[^>]*disabled/);assert.match(html,/<button[^>]*disabled/);
  assert.doesNotMatch(html,/<(?:img|video|iframe)\b/);assert.equal(saves,0);
});

test('formula viewer shows beats, relative CTA, all references and guardrails without edit or network controls', () => {
  const html = render(viralFormulas.map(data=>({id:viralFormulaRecordId(data),kind:"viral_formula",data})));
  assert.match(html, /Công thức video/);
  assert.match(html, /6 công thức/);
  assert.match(html, /0–4 giây từ đầu video/);
  assert.match(html, /3–0 giây trước khi hết video/);
  assert.match(html, /Chỉ dựng hiệu ứng mà sản phẩm thật làm được/);
  assert.match(html, /CHƯA chép lời audio/);
  assert.equal((html.match(/Phiên bản 1/g) ?? []).length, 6);
  for (let n = 1; n <= 12; n++) assert.match(html, new RegExp(`<summary>V${n} ·`));
  assert.doesNotMatch(html, /<(button|input|textarea|form|img|video|iframe)\b/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
});
test('T-007: default library exposes six v2 formulas, measured pacing and no keyword default',()=>{
  const html=render([]);
  assert.equal((html.match(/Phiên bản 2/g)??[]).length,6);
  for(const text of ['41 cắt/phút','1,5 giây/shot','trắng viền đen','Thẻ chuyện hư cấu','Tour tính năng'])assert.ok(html.includes(text),text);
  const composer=renderToStaticMarkup(React.createElement(FormulaDraftPanel,{records:[],production:newProduction('Fixture','p',1),product:{traits:['pet']},disabled:false,onDrafts:async()=>{throw Error('No save while rendering');}}));
  assert.match(composer,/id="formula-keyword"[^>]*value=""/);assert.doesNotMatch(composer,/value="LINK"/);
  assert.match(composer,/PAWS/);assert.match(html,/The idea 🤢/);assert.doesNotMatch(composer,/AI label|AI-generated/);
});
test('formula viewer prefers saved version, escapes user text and labels missing reference data', () => {
  const custom = {...viralFormulas[0], name: '<script>fixture</script>', version: 2, updatedAt: null, references: ['missing']};
  const html = render([{id: viralFormulaRecordId(custom), kind: 'viral_formula', data: custom},
    {id: 'invalid', kind: 'viral_formula', data: {}}]);
  assert.match(html, /Phiên bản 2/);
  assert.match(html, /&lt;script&gt;fixture&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Cập nhật: Chưa biết/);
  assert.match(html, /missing · Chưa có phân tích video/);
  assert.equal((html.match(/Phiên bản /g) ?? []).length, 6);
});
