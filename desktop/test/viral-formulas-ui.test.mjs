import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Actual React source rendered offline. No browser, network, desktop IPC or
// real workspace is involved. Match the existing source component test setup.
const root = new URL('../../', import.meta.url);
registerHooks({resolve(specifier, context, next) {
  let url;
  if (specifier.startsWith('@/')) url = new URL(specifier.slice(2), root);
  else if (specifier.startsWith('.') && /\.tsx?$/.test(context.parentURL ?? '')) url = new URL(specifier, context.parentURL);
  if (url) {
    const path = fileURLToPath(url), found = [path, path+'.ts', path+'.tsx'].find(p => existsSync(p));
    if (found) return {url: pathToFileURL(found).href, shortCircuit: true};
  }
  return next(specifier, context);
}, load(url, context, next) {
  if (/\.tsx?$/.test(url)) return {format: 'module', source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
    fileName: fileURLToPath(url), compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
  }).outputText, shortCircuit: true};
  return next(url, context);
}});
const {default: ViralFormulas} = await import('../../components/lab/viral-formulas.tsx');
const {viralFormulas, viralFormulaRecordId} = await import('../../lib/lab/viral-formulas.ts');
const {FormulaDraftPanel} = await import('../../components/lab/production-intelligence.tsx');
const {newProduction} = await import('../../lib/lab/production.ts');
const {ReferenceDraftPreview} = await import('../../components/lab/reference-video.tsx');
const {draftReferenceVideo} = await import('../../lib/lab/viral-reference.ts');
const render = records => renderToStaticMarkup(React.createElement(ViralFormulas, {records}));

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
  assert.match(html,/Mẫu kịch bản từ công thức/);
  assert.match(html,/Saved English formula · v3 · Gợi ý/);
  assert.match(html,/User formula · v3/);
  assert.match(html,/Từ khóa CTA · một từ tiếng Anh in hoa/);
  assert.match(html,/value="LINK"/);
  assert.match(html,/Soạn hai mở đầu A\/B/);
  assert.match(html,/Chỉ lưu cảnh nháp, chưa duyệt hoặc gửi Muse/);
  assert.match(html,/<select[^>]*disabled/);assert.match(html,/<button[^>]*disabled/);
  assert.doesNotMatch(html,/<(?:img|video|iframe)\b/);assert.equal(saves,0);
});

test('formula viewer shows beats, relative CTA, all references and guardrails without edit or network controls', () => {
  const html = render([]);
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
