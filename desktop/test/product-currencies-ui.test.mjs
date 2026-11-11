import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Compile actual UI source offline, without a browser/profile or loader hooks.
const root = fileURLToPath(new URL('../../', import.meta.url));
const outputs = join(root, 'outputs');
await mkdir(outputs, {recursive:true});
const scratch = await mkdtemp(join(outputs, 'currency-ui-test-'));
assert.equal(dirname(scratch), resolve(outputs));
after(() => rm(scratch, {recursive:true, force:true}));
const entry = join(scratch, 'entry.ts');
await writeFile(entry, [
  'export {RecordForm} from "../../components/lab/primitives";',
  'export {Dialog} from "../../components/ui/dialog";',
  'export {currencyFields} from "../../components/lab/currency-fields";',
  'export {schemas, emptyProduct} from "../../lib/lab/domain";',
].join('\n'));
await build({configFile:false, root, publicDir:false, logLevel:'error', plugins:[react()],
  resolve:{alias:{'@':root}}, build:{ssr:entry, outDir:join(scratch, 'bundle'),
    rollupOptions:{output:{entryFileNames:'entry.mjs'}}}});
const {Dialog, RecordForm, currencyFields, schemas, emptyProduct} = await import(pathToFileURL(join(scratch, 'bundle/entry.mjs')));

const render = (initial, kind = 'product') => renderToStaticMarkup(React.createElement(Dialog, {}, React.createElement(RecordForm, {
  kind, initial, fields:currencyFields, onSave:async()=>{}, onCancel(){}, onDirty(){},
})));
function selected(html, field) {
  const select = html.match(new RegExp(`<select[^>]*id="field-${field}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(select, field + ' select rendered');
  return select[1].match(/<option value="([^"]*)" selected=""/)[1];
}

test('shared currency controls show saved CNY and independent cost/shipping units', () => {
  const html = render({...emptyProduct, currency:'USD', costCurrency:'CNY', shippingCurrency:'GBP'});
  assert.equal(selected(html, 'currency'), 'USD');
  assert.equal(selected(html, 'costCurrency'), 'CNY');
  assert.equal(selected(html, 'shippingCurrency'), 'GBP');
  assert.match(html, /Tiền tệ giá vốn/);
  assert.match(html, /Tiền tệ ship/);
  assert.equal(selected(render({...emptyProduct, currency:'CNY'}), 'currency'), 'CNY');
});

test('legacy and null override controls show inheritance, accept null and retain all supported codes', () => {
  for (const initial of [{currency:'USD'}, {...emptyProduct, currency:'CNY'}]) {
    const html = render(initial);
    for (const field of ['costCurrency', 'shippingCurrency']) {
      assert.equal(selected(html, field), '');
      const definition = currencyFields.find(row => row.name === field);
      assert.equal(definition.nullable, true);
      assert.equal(definition.options[0].label, 'Theo tiền tệ chung');
      for (const currency of ['USD', 'VND', 'GBP', 'EUR', 'CNY']) assert.ok(definition.options.some(row => row.value === currency));
    }
  }
  const product = schemas.product.parse({...emptyProduct, name:'Quote', costCurrency:null, shippingCurrency:null});
  assert.equal(product.costCurrency, null);
  assert.equal(product.shippingCurrency, null);
});

test('product form explains the shared fee currency only when mixed units and unknown/nonzero fees need it', () => {
  for (const currency of ['USD', 'CNY']) {
    const other = currency === 'USD' ? 'CNY' : 'USD';
    for (const field of ['costCurrency', 'shippingCurrency']) {
      const data = {...emptyProduct, currency, [field]: other};
      for (const amounts of [{fees: null, buffer: null}, {fees: 2, buffer: 0}, {fees: 0, buffer: 3}]) {
        const html = render({...data, ...amounts});
        assert.ok(html.includes(`<p role="status">Phí và dự phòng tính theo ${currency}</p>`));
        assert.equal(selected(html, field), other);
      }
      assert.doesNotMatch(render({...data, fees: 0, buffer: 0}), /Phí và dự phòng tính theo/);
      assert.doesNotMatch(render(data, 'settings'), /Phí và dự phòng tính theo/);
    }
  }
  assert.doesNotMatch(render(emptyProduct), /Phí và dự phòng tính theo/);
});
