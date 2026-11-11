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
const render = records => renderToStaticMarkup(React.createElement(ViralFormulas, {records}));

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
