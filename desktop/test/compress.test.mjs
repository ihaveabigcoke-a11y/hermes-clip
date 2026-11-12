import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compressMedia,probeMedia,runMediaTool,VIDEO_MAX_BYTES,videoBudget,writeArchive,readArchive} from '../src/compress.mjs';
import {digest} from '../src/storage-policy.mjs';

const measurements=[];
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'hermes-t006-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function measure(name,input,result){const row={name,before:(await stat(input)).size,after:result.size,...result.metadata,videoBitrate: Number((await probeMedia(result.path)).video.bit_rate)||null};measurements.push(row);console.log('T-006 media '+JSON.stringify(row));}
test('12s heavy portrait: under 6 MiB, 720x1280, duration/decode, immutable source',{timeout:300000},async t=>{
  const root=await fixture(t),path=join(root,'heavy.mp4');
  await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=s=1080x1920:r=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libx264','-preset','ultrafast','-threads','2','-b:v','12M','-minrate','12M','-maxrate','12M','-bufsize','24M','-x264-params','nal-hrd=cbr:filler=1','-c:a','aac','-b:a','96k',path]);
  const bytes=await readFile(path),hash=digest(bytes);assert.ok(bytes.length>=15*1024**2&&bytes.length<=25*1024**2);
  const result=await compressMedia(path);t.after(result.cleanup);
  assert.ok(result.size<VIDEO_MAX_BYTES);assert.deepEqual([result.metadata.width,result.metadata.height],[720,1280]);assert.ok(Math.abs(result.metadata.duration-12)<=.2);
  assert.equal(digest(await readFile(path)),hash);assert.equal(result.compression.sourceSha256,hash);assert.equal(result.sha256,digest(await readFile(result.path)));
  const info=await probeMedia(result.path);assert.equal(info.video.codec_name,'h264');assert.equal(info.audio[0].codec_name,'aac');
  const output=await readFile(result.path);assert.ok(output.indexOf(Buffer.from('moov'))<output.indexOf(Buffer.from('mdat')));
  await measure('12s 1080x1920',path,result);
});
test('long light video is never inflated by the ~2 Mbps floor',{timeout:300000},async t=>{
  // Boss phụ: the floor protects quality when shrinking heavy videos; it must not
  // turn a 21 KB flat 60s clip into 15 MB (previous behaviour).
  const root=await fixture(t),path=join(root,'long.mp4');
  await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=720x1280:r=12','-t','60','-c:v','libx264','-threads','2','-preset','ultrafast',path]);
  const before=(await stat(path)).size,result=await compressMedia(path);t.after(result.cleanup);
  assert.deepEqual([result.metadata.width,result.metadata.height],[720,1280]);assert.ok(Math.abs(result.metadata.duration-60)<=.2);
  assert.ok(result.size<=before,`${result.size} > ${before}`);assert.ok(result.size<VIDEO_MAX_BYTES);
  await measure('60s light',path,result);
});
test('30s heavy portrait over the cap keeps the ~2 Mbps floor instead of being crushed to 6 MB',{timeout:600000},async t=>{
  const root=await fixture(t),path=join(root,'heavy-long.mp4');
  await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=s=1080x1920:r=24,noise=alls=40:allf=t','-t','30','-c:v','libx264','-preset','ultrafast','-threads','2','-b:v','10M',path]);
  const before=(await stat(path)).size,result=await compressMedia(path);t.after(result.cleanup);
  assert.deepEqual([result.metadata.width,result.metadata.height],[720,1280]);assert.ok(Math.abs(result.metadata.duration-30)<=.2);
  assert.ok(result.size<before);
  const rate=Number((await probeMedia(result.path)).video.bit_rate);
  // Either CRF already fit the cap, or the over-cap path stayed at the floor (not the ~1.4 Mbps 6 MB budget).
  if(result.size>=VIDEO_MAX_BYTES){assert.ok(rate>=1_900_000,`bitrate ${rate}`);assert.equal(result.compression.overLimit,true);}
  await measure('30s heavy',path,result);
});
test('15s boundary stays under cap; small compliant file remuxes; corrupt file is retained',{timeout:300000},async t=>{
  const root=await fixture(t),path=join(root,'boundary.mp4');
  await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=red:s=720x1280:r=12','-t','15','-c:v','libx264','-threads','2','-movflags','+faststart',path]);
  const result=await compressMedia(path);t.after(result.cleanup);assert.ok(result.size<VIDEO_MAX_BYTES);assert.equal(result.compression.mode,'remux');await measure('15s remux',path,result);
  const broken=join(root,'broken.mp4');await writeFile(broken,'not a video');await assert.rejects(compressMedia(broken));assert.equal(await readFile(broken,'utf8'),'not a video');
  assert.throws(()=>videoBudget(12,VIDEO_MAX_BYTES+1),/6 MB/);
});
test('4000px PNG becomes smaller WebP; tiny WebP remains byte-identical',{timeout:120000},async t=>{
  const root=await fixture(t),large=join(root,'large.png'),small=join(root,'small.png');
  await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=4000x4000','-frames:v','1',large]);
  const result=await compressMedia(large);t.after(result.cleanup);assert.equal(result.type,'image/webp');assert.ok(Math.max(result.metadata.width,result.metadata.height)<=2048);assert.ok(result.size<(await stat(large)).size);await measure('4000px PNG',large,result);
  // Once a tiny image is already WebP q82, re-encoding cannot save bytes.
  await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=2x2','-frames:v','1','-c:v','libwebp','-quality','82',small+'.webp']);
  const tiny=await compressMedia(small+'.webp');t.after(tiny.cleanup);assert.equal(tiny.compression.mode,'original');assert.deepEqual(await readFile(tiny.path),await readFile(small+'.webp'));await measure('2px WebP',small+'.webp',tiny);
});
test('archival text reads legacy plain and new gzip without changing old bytes',async t=>{
  const root=await fixture(t),old=join(root,'legacy.txt'),fresh=join(root,'research.json');const text='raw source '.repeat(500);
  await writeFile(old,text);const before=digest(await readFile(old));const path=await writeArchive(fresh,text,{flag:'wx'});
  assert.equal(path,fresh+'.gz');assert.equal(await readArchive(old),text);assert.equal(await readArchive(fresh),text);assert.equal(await readArchive(path),text);assert.equal(digest(await readFile(old)),before);assert.ok((await stat(path)).size<text.length);
});
test.after(async()=>{await mkdir('outputs/T-006-checks',{recursive:true});await writeFile('outputs/T-006-checks/media-measurements.json',JSON.stringify(measurements,null,2));});
