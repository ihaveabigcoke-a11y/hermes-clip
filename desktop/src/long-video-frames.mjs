import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runMediaTool} from './compress.mjs';
import {validateMedia} from './media.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const LONG_VIDEO_SEAM_THRESHOLD=12;
export async function lastVideoFrame(output,directory,index){
  // Only accept the exact clip the worker fully decoded and checksummed.
  if(!output.fullDecode||hash(await readFile(output.path))!==output.sha256)throw Error('Clip nguồn chưa kiểm hoặc đã đổi checksum.');
  await mkdir(directory,{recursive:true});
  const path=join(directory,`scene-${index+1}-last.png`);
  // update=1 writes each decoded frame in order; the final file is the LAST
  // frame, unlike -sseof -1 -frames:v 1 (the first frame in the last second).
  await runMediaTool('ffmpeg',['-y','-v','error','-sseof','-1','-i',output.path,'-map','0:v:0','-an','-fps_mode','passthrough','-update','1',path],60000);
  const checked=await validateMedia(path,{mediaType:'image',ratio:'9:16'});
  return {path,sourceSha256:output.sha256,...checked};
}
export async function videoSeam(previous,next,directory,index){
  await mkdir(directory,{recursive:true});
  const a=join(directory,`seam-${index}-last.rgb`),b=join(directory,`seam-${index}-first.rgb`);
  await runMediaTool('ffmpeg',['-y','-v','error','-sseof','-1','-i',previous.path,'-an','-vf','scale=32:32,format=rgb24','-fps_mode','passthrough','-f','rawvideo',a],60000);
  await runMediaTool('ffmpeg',['-y','-v','error','-i',next.path,'-an','-vf','scale=32:32,format=rgb24','-frames:v','1','-f','rawvideo',b],60000);
  const bytesA=await readFile(a),bytesB=await readFile(b),size=32*32*3;
  if(bytesA.length<size||bytesB.length!==size)throw Error('Không đọc đủ khung nối 32×32.');
  const frameA=bytesA.subarray(-size);let distance=0;
  for(let i=0;i<size;i++)distance+=Math.abs(frameA[i]-bytesB[i]);
  const differencePercent=Math.round(distance/(size*255)*10000)/100;
  return {index,hashLast:hash(frameA),hashFirst:hash(bytesB),differencePercent,thresholdPercent:LONG_VIDEO_SEAM_THRESHOLD,withinThreshold:differencePercent<=LONG_VIDEO_SEAM_THRESHOLD};
}
