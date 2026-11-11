// Verify this repository snapshot without Windows, Muse, credentials or FFmpeg.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const json=async rel=>JSON.parse((await fs.readFile(path.join(root,rel),'utf8')).replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=await json('MANIFEST.json');
let bytes=0;
for(const f of manifest.files){
 const abs=path.resolve(root,f.path);assert(abs.startsWith(root+path.sep),'Manifest traversal');
 const content=await fs.readFile(abs);assert.equal(content.length,f.bytes,f.path+' size');assert.equal(sha(content),f.sha256,f.path+' SHA-256');bytes+=content.length;
}
const current=await json('data/research/2026-11-11/candidates-1745.json');
const earlier=await json('data/research/2026-11-11/candidates-earlier.json');
assert.equal(current.record.data.candidates.length,10);assert.equal(earlier.record.data.candidates.length,10);
assert.notEqual(current.record.id,earlier.record.id);
assert(current.record.data.candidates.every(c=>c.cost===null&&c.shipping===null));
const workspace=await json('data/2026-11-11/workspace-records.json');
assert.deepEqual(workspace.records.find(r=>r.id===current.record.id),current.record);
assert.deepEqual(workspace.records.find(r=>r.id===earlier.record.id),earlier.record);
const media=await json('data/2026-11-11/media-index.json');
assert.equal(media.assets.length,workspace.records.filter(r=>r.kind==='asset').length);
for(const asset of media.assets){const content=await fs.readFile(path.join(root,asset.repositoryPath));assert.equal(sha(content),asset.sha256);assert.equal(content.length,asset.bytes);}
const provenance=await json('evidence/2026-11-11/PROVENANCE.json');
for(const f of provenance.files){assert.equal(f.sourceSha256,f.exportSha256);assert.equal(sha(await fs.readFile(path.join(root,f.target))),f.sourceSha256);}
const suite=await json('evidence/2026-11-11/tests/suite-verification.json');
let testCount=0;
for(const r of suite.results){assert.equal(r.passed,true);testCount+=Number(r.summary.find(x=>/tests \d+/.test(x)).match(/tests (\d+)/)[1]);assert(r.summary.some(x=>/fail 0$/.test(x)));assert(r.summary.some(x=>/skipped 0$/.test(x)));}
assert.equal(testCount,248);
const parity=await json('evidence/current/2026-11-11/source-parity.json');
assert.equal(parity.allMatch,true);assert.equal(parity.sourceFiles.length,261);
console.log(JSON.stringify({passed:true,verifiedFiles:manifest.files.length,verifiedBytes:bytes,records:workspace.records.length,mediaFiles:media.assets.length,researchBatchesWithTen:2,historicalTestsRecorded:testCount,note:'This verifies the published snapshot; it does not rerun the historical application tests or connect to Muse/Instagram.'},null,2));
