import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Integrations} from '../src/integrations.mjs';

const python=process.env.PRODUCT_LAB_TEST_PYTHON,montage=process.env.PRODUCT_LAB_TEST_MONTAGE,reach=process.env.PRODUCT_LAB_TEST_REACH;
test('real pinned OpenMontage extracts hook frames, preserves order in MP4, validates media and keeps original bytes',{skip:!python||!montage||!reach,timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lab-montage-live-')),store=new Store(join(dir,'state.sqlite'));
 try{
  const i=new Integrations(store,dir);i.saveConfig({python,montage,reach});
  const health=await i.doctor();assert.equal(health.montage.ready,true);assert.equal(health.reach.ready,true);
  const clips=[];for(const color of ['red','blue']){const path=join(dir,color+'.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=90x160:r=24:d=3`,'-c:v','libx264','-pix_fmt','yuv420p',path]);const bytes=new Uint8Array(await readFile(path));clips.push({bytes,sha256:createHash('sha256').update(bytes).digest('hex'),duration:3});}
  const ref=await i.analyze({projectId:'p',assetId:'source',name:'synthetic.mp4',...clips[0]});const frames=await i.frames(ref.id);assert.ok(frames.length>=4);assert.equal(frames[0].timestamp,0);assert.equal(ref.result.semanticReview,'pending');assert.equal(ref.result.hookPerformance,null);
  const job=await i.compose({projectId:'p',variantId:'variant',ratio:'9:16',clips});assert.ok(Math.abs(job.output.metadata.duration-6)<.25);assert.equal(job.output.fullDecode,true);
  const pixel=sec=>execFileSync('ffmpeg',['-v','error','-ss',String(sec),'-i',job.path,'-vf','scale=1:1','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
  assert.ok(pixel(1)[0]>pixel(1)[2]+100);assert.ok(pixel(4)[2]>pixel(4)[0]+100);
  const out=await i.output(job.id);assert.equal(createHash('sha256').update(out.bytes).digest('hex'),out.sha256);assert.deepEqual(new Uint8Array(await readFile(join(dir,'red.mp4'))),clips[0].bytes);
  const second=await i.compose({projectId:'p',variantId:'variant',ratio:'9:16',clips});assert.notEqual(second.id,job.id);assert.ok((await readFile(job.path)).length>0);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
