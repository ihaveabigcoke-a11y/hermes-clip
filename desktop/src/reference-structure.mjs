import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile, writeFile, stat, realpath, readdir} from 'node:fs/promises';
import {join, relative, isAbsolute} from 'node:path';
import {toolchain, validateMedia} from './media.mjs';

const execute = promisify(execFile);
export const referenceLimits = Object.freeze({bytes: 25 * 1024 ** 2, duration: 180, interval: 0.8, frames: 225});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function run(command, args) {
  return execute(command, args, {windowsHide: true, shell: false, timeout: 120000, maxBuffer: 4 * 1024 ** 2});
}
export async function confinedFile(directory, path) {
  const root = await realpath(directory), resolved = await realpath(path), offset = relative(root, resolved);
  if (offset === '..' || offset.startsWith('../') || offset.startsWith('..\\') || isAbsolute(offset))
    throw Error('File nằm ngoài tác vụ.');
  return resolved;
}
export async function checkedBytes(directory, path, checksum, maxBytes) {
  const resolved = await confinedFile(directory, path), file = await stat(resolved);
  if (!file.isFile() || !file.size || file.size > maxBytes) throw Error('File rỗng hoặc vượt giới hạn.');
  const bytes = await readFile(resolved);
  if (sha256(bytes) !== checksum) throw Error('File đã đổi sau khi kiểm tra checksum.');
  return bytes;
}
export async function verifyJpeg(directory, path) {
  const resolved = await confinedFile(directory, path), file = await stat(resolved);
  if (!file.isFile() || !file.size || file.size > 5 * 1024 ** 2) throw Error('JPEG rỗng hoặc vượt giới hạn.');
  const bytes = await readFile(resolved);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw Error('File không phải JPEG hợp lệ.');
  const report = await validateMedia(resolved, {mediaType: 'image', ratio: '1:1'});
  return {path: resolved, sha256: report.sha256};
}
export function sceneCuts(stderr, duration) {
  return [...new Set([...stderr.matchAll(/\bpts_time:\s*([\d.e+-]+)/g)].map(match => Number(match[1])))]
    .filter(t => Number.isFinite(t) && t > 0 && t < duration).sort((a, b) => a - b);
}

// Only a local MP4 demuxer, with network protocols disabled. Never use a URL
// or caller-supplied ffmpeg options. Output lives in a fresh integration job.
export async function analyzeLocalStructure(directory, sourcePath, sourceSha256) {
  await checkedBytes(directory, sourcePath, sourceSha256, referenceLimits.bytes);
  await toolchain();
  const source = await confinedFile(directory, sourcePath);
  const input = ['-protocol_whitelist', 'file,pipe', '-f', 'mov', '-i', source];
  const probe = await run('ffprobe', ['-v', 'error', ...input, '-show_format', '-show_streams', '-of', 'json']);
  const metadata = JSON.parse(probe.stdout), video = metadata.streams?.find(s => s.codec_type === 'video');
  const durationSec = Number(metadata.format?.duration), width = video?.width, height = video?.height;
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > referenceLimits.duration)
    throw Error('Video phải có thời lượng trên 0 và tối đa 180 giây.');
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192) || width * height > 33554432)
    throw Error('Độ phân giải video không hợp lệ hoặc quá lớn.');
  const rotation = Number(video.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const [displayWidth, displayHeight] = Math.abs(rotation % 180) === 90 ? [height, width] : [width, height];
  const sar=String(video.sample_aspect_ratio??'1:1').split(':').map(Number);
  const [sn,sd]=sar.length===2&&sar.every(n=>Number.isInteger(n)&&n>0&&n<=65535)?sar:[1,1];
  const [rw,rh]=Math.abs(rotation%180)===90?[height*sd,width*sn]:[width*sn,height*sd];
  const gcd = (a, b) => b ? gcd(b, a % b) : a, divisor = gcd(rw,rh);
  const scan = await run('ffmpeg', ['-hide_banner', '-nostdin', '-xerror', ...input, '-map', '0:v:0', '-vf', "setpts=PTS-STARTPTS,select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-']);
  const cuts = sceneCuts(scan.stderr, durationSec);
  if (cuts.length > 10000) throw Error('Số lần cắt vượt giới hạn.');
  const pattern = join(directory, 'frame-%03d.jpg');
  await run('ffmpeg', ['-hide_banner', '-v', 'error', '-nostdin', '-xerror', '-n', ...input, '-map', '0:v:0', '-an',
    '-vf', 'setpts=PTS-STARTPTS,fps=fps=5/4:start_time=0:round=up,scale=160:160:force_original_aspect_ratio=decrease,pad=160:160:(ow-iw)/2:(oh-ih)/2,setsar=1',
    '-frames:v', String(referenceLimits.frames), '-q:v', '3', pattern]);
  const names = (await readdir(directory)).filter(name => /^frame-\d{3}\.jpg$/.test(name)).sort();
  if (!names.length || names.length > referenceLimits.frames) throw Error('Không có khung hình hợp lệ.');
  const frames = [];
  for (const [index, name] of names.entries()) {
    const t = Number((index * referenceLimits.interval).toFixed(3));
    if (t >= durationSec) throw Error('Khung hình vượt thời lượng nguồn.');
    frames.push({t, ...await verifyJpeg(directory, join(directory, name))});
  }
  // Square grid <= 2400 x 2400 even at the maximum 225 frames.
  const edge = Math.ceil(Math.sqrt(frames.length)), contactSheetPath = join(directory, 'contact-sheet.jpg');
  await run('ffmpeg', ['-hide_banner', '-v', 'error', '-nostdin', '-n', '-framerate', '1', '-i', pattern,
    '-vf', `tile=${edge}x${edge}`, '-frames:v', '1', '-q:v', '3', contactSheetPath]);
  const contact = await verifyJpeg(directory, contactSheetPath);
  const version = (await run('ffmpeg', ['-version'])).stdout.split(/\r?\n/)[0];
  const structure = {durationSec, width, height, displayWidth, displayHeight, aspectRatio: `${rw / divisor}:${rh / divisor}`,
    cuts, cutCount: cuts.length, contactSheetPath: contact.path, contactSheetSha256: contact.sha256, frames,
    sourceSha256, sceneThreshold: 0.3, sampleIntervalSec: referenceLimits.interval, gridColumns: edge, ffmpegVersion: version};
  const path = join(directory, 'structure.json'), bytes = Buffer.from(JSON.stringify(structure, null, 2));
  await checkedBytes(directory, source, sourceSha256, referenceLimits.bytes);
  await writeFile(path, bytes, {flag: 'wx'});
  return {path, structureSha256: sha256(bytes), result: structure};
}
