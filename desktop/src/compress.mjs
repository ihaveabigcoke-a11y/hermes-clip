import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, stat, rm} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {gzip, gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {openSync,closeSync} from 'node:fs';

export const VIDEO_MAX_BYTES = 6 * 1024 * 1024;
export const VIDEO_FLOOR_BPS = 2_100_000;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const zip = promisify(gzip), unzip = promisify(gunzip);
const mime = {'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};

// No shell or inherited pipes. ffprobe writes a bounded private report, which
// also works on Windows installations that disallow child stdout pipes.
export async function runMediaTool(command, args, timeout = 300000) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {shell:false, windowsHide:true, stdio:'ignore', timeout});
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(Error(`${command}: ${signal ? 'quá thời gian xử lý' : 'không xử lý được file'}; giữ nguyên file gốc.`)));
  });
}
export async function captureMediaTool(command,args,{timeout=300000,maxBuffer=1024**2}={}) {
  const dir=await mkdtemp(join(tmpdir(),'hermes-media-log-'));
  const out=join(dir,'stdout'),err=join(dir,'stderr'),fds=[openSync(out,'w'),openSync(err,'w')];
  try{
    await new Promise((resolve,reject)=>{
      const child=spawn(command,args,{shell:false,windowsHide:true,stdio:['ignore',...fds],timeout});
      child.once('error',reject);child.once('close',(code,signal)=>code===0?resolve():reject(Error(`${command}: ${signal?'quá thời gian':'không xử lý được media'}.`)));
    });
    if((await stat(out)).size>maxBuffer||(await stat(err)).size>maxBuffer)throw Error('Log công cụ media vượt giới hạn.');
    return {stdout:await readFile(out,'utf8'),stderr:await readFile(err,'utf8')};
  }finally{fds.forEach(closeSync);await rm(dir,{recursive:true,force:true});}
}
export async function probeMedia(path) {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-probe-'));
  try {
    const report = join(dir, 'probe.json');
    await runMediaTool('ffprobe', ['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json','-o',report,path], 15000);
    if ((await stat(report)).size > 1024**2) throw Error('Thông tin media vượt giới hạn.');
    const data = JSON.parse(await readFile(report, 'utf8'));
    const video = data.streams?.find(s => s.codec_type === 'video');
    if (!video?.width || !video?.height) throw Error('Không đọc được kích thước media.');
    const rotation = Number(video.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
    const rotated = Math.abs(rotation) % 180 === 90;
    return {data, video, width:rotated?video.height:video.width, height:rotated?video.width:video.height,
      duration:Number(data.format?.duration), audio:data.streams.filter(s => s.codec_type === 'audio')};
  } finally { await rm(dir, {recursive:true, force:true}); }
}
export function videoBudget(duration, maxBytes = VIDEO_MAX_BYTES) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw Error('Thời lượng video không hợp lệ (tối đa 2 giờ).');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > VIDEO_MAX_BYTES) throw Error('Giới hạn video phải lớn hơn 0 và không vượt 6 MB.');
  const budget = Math.floor(.92 * maxBytes * 8 / duration - 96000);
  return duration > 15 ? Math.max(VIDEO_FLOOR_BPS, budget) : Math.max(32000, budget);
}
export async function validateCompressed(source, path, isVideo) {
  const output = await probeMedia(path);
  if (Math.abs((output.width/output.height)/(source.width/source.height)-1) > .01) throw Error('Bản nén sai tỷ lệ; giữ nguyên file gốc.');
  if (isVideo && (!Number.isFinite(output.duration)||output.duration<=0||Math.abs(output.duration-source.duration) > .2)) throw Error('Bản nén sai thời lượng quá 0,2 giây; giữ nguyên file gốc.');
  if(isVideo&&(output.video.codec_name!=='h264'||output.audio.some(s=>s.codec_name!=='aac')))throw Error('Bản nén chưa đúng H.264/AAC; giữ nguyên file gốc.');
  await runMediaTool('ffmpeg',['-v','error','-xerror','-protocol_whitelist','file,pipe','-i',path,'-map','0:v:0','-map','0:a?','-f','null','-'],300000);
  return {width:output.width,height:output.height,duration:isVideo?output.duration:null,verifiedBy:'container'};
}

// The caller owns cleanup(). This function never changes its input.
export async function compressMedia(sourcePath, {maxBytes=VIDEO_MAX_BYTES, forceEncode=false, sourceType}={}) {
  const type = sourceType ?? mime[extname(sourcePath).toLowerCase()];
  if (!type) throw Error('Chỉ nén MP4, MOV, WebM, PNG, JPEG hoặc WebP.');
  const dir = await mkdtemp(join(tmpdir(),'hermes-compress-'));
  const cleanup = () => rm(dir,{recursive:true,force:true});
  try {
    const sourceBytes = await readFile(sourcePath), source = await probeMedia(sourcePath);
    if (!sourceBytes.length) throw Error('File rỗng.');
    const isVideo = type.startsWith('video/');
    let path = join(dir,isVideo?'compressed.mp4':'compressed.webp'), outputType=isVideo?'video/mp4':'image/webp', mode='encoded';
    const input = ['-y','-v','error','-xerror','-protocol_whitelist','file,pipe','-i',sourcePath];
    if (isVideo) {
      const bitrate = videoBudget(source.duration,maxBytes);
      const scale = "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
      // Small H.264/AAC videos are losslessly remuxed, whatever their length:
      // they already fit the cap, so re-encoding could only add bytes or lose quality.
      // The ~2 Mbps floor is a lower bound for *shrinking* long heavy videos, never a
      // reason to inflate a light one. Never shrink a 9:16 source below 720x1280.
      const remux = !forceEncode && sourceBytes.length < maxBytes && source.video.codec_name==='h264' && source.audio.every(s=>s.codec_name==='aac') &&
        Math.max(source.width,source.height)<=1280;
      if (remux) {
        mode='remux';
        await runMediaTool('ffmpeg',[...input,'-map','0:v:0','-map','0:a:0?','-c','copy','-map_metadata','-1','-movflags','+faststart',path]);
      } else {
        const common=['-map','0:v:0','-map','0:a:0?','-vf',scale,'-c:v','libx264','-preset','slow','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','96k','-map_metadata','-1','-movflags','+faststart'];
        await runMediaTool('ffmpeg',[...input,...common,'-crf','26','-maxrate',String(bitrate),'-bufsize',String(bitrate*2),path]);
        // CRF already chose the quality; only re-encode when it is still over the cap.
        // Long videos then target max(floor, budget) = the floor, so they are not
        // crushed below ~2 Mbps to hit 6 MB (they may stay over 6 MB, flagged overLimit).
        if ((await stat(path)).size>=maxBytes) {
          const target=bitrate;
          const rate=['-b:v',String(target),'-maxrate',String(target),'-bufsize',String(target*2)];
          const passlog=join(dir,'pass');
          await runMediaTool('ffmpeg',[...input,...common,...rate,'-pass','1','-passlogfile',passlog,'-an','-f','null','-']);
          await runMediaTool('ffmpeg',[...input,...common,...rate,'-pass','2','-passlogfile',passlog,path]);
        }
      }
      // Remux overhead can push a near-limit file over: fall back once to encode.
      if(mode==='remux' && (await stat(path)).size>=maxBytes && source.duration<=15) {
        await cleanup(); return compressMedia(sourcePath,{maxBytes,forceEncode:true,sourceType});
      }
      // Never store a "compressed" video that is bigger than its source (e.g. a light
      // WebM): keep the source bytes unchanged instead.
      if(mode==='encoded' && (await stat(path)).size>=sourceBytes.length && sourceBytes.length<maxBytes) {path=sourcePath;outputType=type;mode='original';}
      if(source.duration<=15 && (await stat(path)).size>=maxBytes) throw Error('Không nén được clip ≤ 15 giây xuống dưới giới hạn video; chưa nhập, giữ nguyên file gốc.');
    } else {
      await runMediaTool('ffmpeg',[...input,'-frames:v','1','-vf',"scale=w='min(2048,iw)':h='min(2048,ih)':force_original_aspect_ratio=decrease",'-c:v','libwebp','-quality','82',path]);
      if((await stat(path)).size>=sourceBytes.length) {path=sourcePath;outputType=type;mode='original';}
    }
    const metadata=await validateCompressed(source,path,isVideo), bytes=await readFile(path);
    // The floor only guards the over-cap path: a long video that still exceeds the cap
    // must not have been squeezed below ~2 Mbps. Light videos under the cap are fine.
    if(isVideo && source.duration>15 && (await stat(path)).size>=maxBytes && Number((await probeMedia(path)).video.bit_rate)<1_950_000) throw Error('Bản nén chưa đạt sàn bitrate khoảng 2 Mbps; giữ nguyên file gốc.');
    const compression={version:1,sourceSha256:digest(sourceBytes),sha256:digest(bytes),sourceSize:sourceBytes.length,size:bytes.length,mode,
      overLimit:isVideo&&bytes.length>=VIDEO_MAX_BYTES,maxBytes};
    return {path,type:outputType,metadata,sha256:compression.sha256,size:bytes.length,compression,cleanup};
  } catch(error) {await cleanup();throw error;}
}

// Only newly written archival text uses gzip. Existing plain paths still read.
export async function writeArchive(path, text, options={}) {
  const target=path.endsWith('.gz')?path:path+'.gz';
  await writeFile(target,await zip(Buffer.from(text),{level:9}),options);return target;
}
export async function readArchive(path) {
  let actual=path,bytes;
  try{bytes=await readFile(actual);}catch(error){if(error.code!=='ENOENT'||path.endsWith('.gz'))throw error;actual=path+'.gz';bytes=await readFile(actual);}
  return (actual.endsWith('.gz')?await unzip(bytes,{maxOutputLength:32*1024**2}):bytes).toString('utf8');
}
