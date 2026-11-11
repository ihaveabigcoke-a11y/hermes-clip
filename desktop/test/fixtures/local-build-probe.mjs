import test from 'node:test';
import assert from 'node:assert/strict';
import {getTestBuild,importApiModule} from '../helpers/local-server.mjs';

let first;
test('lazy build is available inside the first test',async()=>{
  first=await getTestBuild('api');
  console.log('BUILD_PROBE='+first.buildRoot);
  const {emptyProduct}=await importApiModule('lib/lab/domain.ts');
  assert.equal(emptyProduct.cost,null);
});
test('later tests keep the same build and can import a new module',async()=>{
  assert.strictEqual(await getTestBuild('api'),first);
  const {GET}=await importApiModule('app/api/lab/route.ts');
  assert.equal(typeof GET,'function');
});
