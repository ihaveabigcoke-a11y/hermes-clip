import test from 'node:test';
import assert from 'node:assert/strict';
import {threeVideoGuideSteps,threeVideoGuideTitle} from '../lib/lab/daily-guide.ts';
test('3 video guide has 6 Vietnamese steps with highlighted controls',()=>{
 assert.equal(threeVideoGuideTitle,'3 video cho 1 sản phẩm');
 const flat=threeVideoGuideSteps.map(p=>p.map(x=>x.text).join(''));
 assert.equal(flat.length,6);
 assert.ok(flat[2].includes('Cho')&&flat[2].includes('Duc')&&flat[2].includes('Chim'));
 assert.ok(flat[3].includes('1–1,5 phút'));
 const hl=threeVideoGuideSteps.flat().filter(x=>x.highlight).map(x=>x.text);
 assert.ok(hl.includes('Làm video')&&hl.includes('Thư viện')&&hl.includes('Video'));
});
