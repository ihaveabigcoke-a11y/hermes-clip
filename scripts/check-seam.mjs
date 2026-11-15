// Kiểm đường nối giữa hai cảnh MP4: so khung CUỐI của cảnh A với khung ĐẦU của cảnh B.
// Dùng: node scripts/check-seam.mjs <A.mp4> <B.mp4> [--threshold 12]
// Không dependency mới. ffmpeg lấy theo thứ tự: biến FFMPEG, desktop/tools/ffmpeg/bin/ffmpeg.exe, rồi "ffmpeg" trong PATH.
// Độ lệch = trung bình |chênh lệch| trên mọi kênh RGB của ảnh 32x32, chia 255, tính phần trăm (0 = giống hệt).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 32;
const FRAME_BYTES = SIZE * SIZE * 3;
const DEFAULT_THRESHOLD = 12;

function fail(message, code = 1) {
  console.log(JSON.stringify({ error: message }));
  process.exit(code);
}

function resolveFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const bundled = resolve(root, 'desktop/tools/ffmpeg/bin/ffmpeg.exe');
  return existsSync(bundled) ? bundled : 'ffmpeg';
}

function parseArgs(argv) {
  const files = [];
  let threshold = DEFAULT_THRESHOLD;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--threshold') {
      const value = Number(argv[i + 1]);
      if (argv[i + 1] === undefined || !Number.isFinite(value) || value < 0) {
        fail('--threshold cần một số không âm, ví dụ --threshold 12', 2);
      }
      threshold = value;
      i += 1;
    } else if (arg.startsWith('--')) {
      fail(`tham số không hỗ trợ: ${arg}`, 2);
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 2) {
    fail('cách dùng: node scripts/check-seam.mjs <A.mp4> <B.mp4> [--threshold 12]', 2);
  }
  return { a: files[0], b: files[1], threshold };
}

// Chạy ffmpeg và trả về buffer rawvideo 32x32 RGB24. Lỗi thì dừng với {"error"}.
function runFfmpeg(ffmpeg, args, label) {
  const result = spawnSync(ffmpeg, args, {
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) {
    fail(`${label}: không chạy được ffmpeg (${result.error.message})`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim().split(/\r?\n/).slice(-2).join(' | ');
    fail(`${label}: ffmpeg lỗi (mã ${result.status})${stderr ? `: ${stderr}` : ''}`);
  }
  if (result.stdout.length < FRAME_BYTES) {
    fail(`${label}: không đọc được khung hình nào từ file`);
  }
  return result.stdout;
}

const VF = `scale=${SIZE}:${SIZE},format=rgb24`;

function lastFrame(ffmpeg, file, label) {
  // Lấy đoạn cuối 1 giây rồi giữ khung cuối cùng trong luồng.
  const out = runFfmpeg(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-sseof', '-1', '-i', file, '-an', '-vf', VF, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
    label,
  );
  return out.subarray(out.length - FRAME_BYTES);
}

function firstFrame(ffmpeg, file, label) {
  const out = runFfmpeg(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-i', file, '-an', '-frames:v', '1', '-vf', VF, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
    label,
  );
  return out.subarray(0, FRAME_BYTES);
}

function seamDiffPercent(frameA, frameB) {
  let total = 0;
  for (let i = 0; i < FRAME_BYTES; i += 1) {
    total += Math.abs(frameA[i] - frameB[i]);
  }
  return Math.round((total / (FRAME_BYTES * 255)) * 100 * 100) / 100;
}

const { a, b, threshold } = parseArgs(process.argv.slice(2));
for (const file of [a, b]) {
  if (!existsSync(file)) fail(`không tìm thấy file: ${basename(file)}`);
}

const ffmpeg = resolveFfmpeg();
const frameA = lastFrame(ffmpeg, resolve(a), 'cảnh A (khung cuối)');
const frameB = firstFrame(ffmpeg, resolve(b), 'cảnh B (khung đầu)');
const seamDiff = seamDiffPercent(frameA, frameB);

console.log(JSON.stringify({
  seamDiffPercent: seamDiff,
  frameA: `${basename(a)}: khung cuối`,
  frameB: `${basename(b)}: khung đầu`,
  verdict: seamDiff <= threshold ? 'khớp' : 'lệch',
}));
