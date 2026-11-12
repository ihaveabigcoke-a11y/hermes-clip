import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Integrations} from '../src/integrations.mjs';
const configPath=resolve('desktop/.integrations/config.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
test('T-012 real OpenMontage: trimmed three clips, ASS, source audio and three hooks',{skip:!existsSync(configPath),timeout:180000},async()=>{
 const out=resolve('outputs/T-012-render');await mkdir(out,{recursive:true});const root=await mkdtemp(join(out,'acceptance-'));
 const store=new Store(':memory:'),i=new Integrations(store,root);i.saveConfig(JSON.parse((await readFile(configPath,'utf8')).replace(/^\uFEFF/,'')));
 try {
  const sources=[];
  for(const [index,color] of ['red','yellow','magenta','blue','green'].entries()){
   const path=join(root,color+'.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=720x1280:r=30:d=3`,'-f','lavfi','-i',`sine=frequency=${440+index*110}:sample_rate=48000:duration=3`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',path],{windowsHide:true});
   const bytes=new Uint8Array(await readFile(path));sources.push({bytes,sha256:hash(bytes),duration:3,inSec:.3,outSec:1.8,path});
  }
  const overlays=[{text:'The result',fromSec:1,toSec:2},{text:'Comment GLOW',fromSec:2,toSec:4}],renders=[];
  for(let hook=0;hook<3;hook++){
   const clips=[{...sources[hook],outSec:1.3},...sources.slice(3)];
   const job=await i.compose({planVersion:1,projectId:'render_project',variantId:'hook_'+hook,ratio:'9:16',clips,overlays});
   const result=await i.output(job.id);assert.equal(result.metadata.width,720);assert.equal(result.metadata.height,1280);assert.ok(Math.abs(result.metadata.duration-4)<=.1);assert.equal(result.fullDecode,true);assert.equal(result.sha256,hash(result.bytes));assert.ok(Math.abs(result.audio.duration-result.audio.videoDuration)<=.1);
   // White glyphs appear at the top during the label interval; solid source has none.
   const frame=execFileSync('ffmpeg',['-v','error','-ss','1.5','-i',result.path,'-vf','crop=650:200:35:30','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:2000000});
   let white=0;for(let n=0;n<frame.length;n+=3)if(frame[n]>200&&frame[n+1]>200&&frame[n+2]>200)white++;assert.ok(white>100,'ASS glyphs were burned into the picture');
   // Each output section retains the source tone; a silent/replaced audio track fails.
   for(const [at,expected] of [[.2,440+hook*110],[1.3,770],[2.8,880]]){
    const samples=execFileSync('ffmpeg',['-v','error','-ss',String(at),'-i',result.path,'-t','0.25','-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'],{windowsHide:true});let crossings=0,power=0,prev=0;
    for(let n=0;n<samples.length;n+=4){const value=samples.readFloatLE(n);if(prev<=0&&value>0)crossings++;power+=value*value;prev=value;}
    assert.ok(power/(samples.length/4)>.001,'Original audio remains audible');assert.ok(Math.abs(crossings/.25-expected)<20,'Original tone stays synchronized with each cut');
   }
   renders.push({variantId:'hook_'+hook,path:result.path,sha256:result.sha256,metadata:result.metadata,audio:result.audio,body:clips.slice(1).map(({bytes,path,...c})=>c),whitePixels:white});
  }
  assert.deepEqual(renders[0].body,renders[1].body);assert.deepEqual(renders[1].body,renders[2].body);
  for(const source of sources)assert.equal(hash(await readFile(source.path)),source.sha256);
  await writeFile(join(out,'result.json'),JSON.stringify({fixture:true,externalService:false,engine:'real pinned OpenMontage',sources:sources.map(({bytes,...s})=>s),renders},null,2));
 }finally{store.close();}
});
