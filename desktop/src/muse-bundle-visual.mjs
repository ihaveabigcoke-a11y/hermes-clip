import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runMediaTool} from './compress.mjs';

export const BUNDLE_FRAME_BYTES=32*32*3;
// Mean absolute RGB difference, normalized to [0,1]. <= 2.5% is too
// similar to trust appearance order. This is a duplicate guard, not proof
// that distinct clips depict the approved scenes or the correct SKU.
export const BUNDLE_FRAME_MIN_DIFFERENCE=0.025;
export async function bundleMidpointFrame(path,duration){
  if(!Number.isFinite(duration)||duration<=0)throw Error('Không đọc được thời lượng để so hình gói.');
  const dir=await mkdtemp(join(tmpdir(),'hermes-bundle-frame-'));
  try{
    const target=join(dir,'middle.rgb');
    await runMediaTool('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-ss',String(duration/2),'-i',path,'-map','0:v:0','-frames:v','1','-vf','scale=32:32:flags=area','-pix_fmt','rgb24','-f','rawvideo',target],15000);
    const pixels=await readFile(target);
    if(pixels.length!==BUNDLE_FRAME_BYTES)throw Error('Không đọc đủ khung giữa để so hình gói.');
    return pixels;
  }finally{await rm(dir,{recursive:true,force:true});}
}
export function assertDistinctBundleFrames(frames){
  if(frames.length!==3||frames.some(frame=>!(frame instanceof Uint8Array)||frame.length!==BUNDLE_FRAME_BYTES))throw Error('Thiếu khung giữa để so hình gói; chưa nhận clip.');
  const differences=[];
  for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
    let difference=0;
    for(let k=0;k<BUNDLE_FRAME_BYTES;k++)difference+=Math.abs(frames[i][k]-frames[j][k]);
    difference/=BUNDLE_FRAME_BYTES*255;
    if(difference<=BUNDLE_FRAME_MIN_DIFFERENCE)throw Object.assign(Error(`Clip ${i+1}/${j+1} gần giống nhau: lệch RGB khung giữa ${(difference*100).toFixed(2)}% ≤ 2,5%; từ chối cả gói, không tự đoán cảnh.`),{code:'MUSE_BUNDLE_SIMILAR'});
    differences.push({first:i+1,second:j+1,difference});
  }
  return {method:'midpoint-rgb32-mae-v1',minimumDifference:BUNDLE_FRAME_MIN_DIFFERENCE,differences};
}
