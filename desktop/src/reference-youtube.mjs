import {readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {confinedFile, referenceLimits, sha256} from './reference-structure.mjs';

export function shortsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname) ||
      url.port || url.username || url.password || !/^\/shorts\/[a-zA-Z0-9_-]{11}\/?$/.test(url.pathname))
    throw Error('Dùng link HTTPS YouTube Shorts có ID video hợp lệ.');
  return `https://www.youtube.com/shorts/${url.pathname.split('/')[2]}`;
}
const requiredFlags = ['--ignore-config', '--dump-single-json', '--skip-download', '--no-playlist', '--max-filesize',
  '--match-filters', '--write-subs', '--write-auto-subs', '--sub-langs', '--sub-format', '--format', '--output',
  '--no-progress', '--no-warnings', '--socket-timeout', '--retries', '--no-cache-dir', '--no-overwrites'];

// Capability checks use local help only. No URL is visited and nothing is installed.
export async function youtubeCapability(run, config, invokeReach) {
  let infoCommand = null;
  if (config && invokeReach) {
    try {
      const help = await invokeReach(['youtube', '--help'], {format: 'text', timeout: 15000, maxBytes: 65536});
      if (/^[\s│┃]*info(?:\s|$)/m.test(help)) {
        const detail = await invokeReach(['youtube', 'info', '--help'], {format: 'text', timeout: 15000, maxBytes: 65536});
        if (/\burl\b/i.test(detail)) infoCommand = ['youtube', 'info'];
      }
    } catch { /* yt-dlp's info command is an independent free fallback. */ }
  }
  const candidates = config ? [{command: config.python, prefix: ['-m', 'yt_dlp']}, {command: 'yt-dlp', prefix: []}] : [{command: 'yt-dlp', prefix: []}];
  for (const candidate of candidates) {
    try {
      const help = await run(candidate.command, [...candidate.prefix, '--ignore-config', '--help'], {format: 'text', timeout: 15000, maxBytes: 131072});
      if (typeof help === 'string' && requiredFlags.every(flag => help.includes(flag)))
        return {supported: true, ...candidate, infoCommand, error: null};
    } catch { /* Do not guess download argv for an unknown pinned CLI. */ }
  }
  return {supported: false, infoCommand, error: 'Chưa hỗ trợ: chưa xác nhận yt-dlp có đủ tùy chọn giới hạn qua --help local. Không cài thêm công cụ.'};
}

export function youtubeArgs(capability, operation, url, directory, formatId) {
  const common = [...capability.prefix, '--ignore-config', '--no-cache-dir', '--no-overwrites', '--no-playlist', '--no-warnings', '--socket-timeout', '15', '--retries', '0'];
  return operation === 'info'
    ? [...common, '--skip-download', '--dump-single-json', '--', shortsUrl(url)]
    : [...common, '--no-progress', '--max-filesize', String(referenceLimits.bytes), '--match-filters', 'duration <= 180',
      '--format', formatId, '--write-subs', '--write-auto-subs', '--sub-langs', 'en', '--sub-format', 'vtt',
      '--output', join(directory, 'source.%(ext)s'), '--', shortsUrl(url)];
}

export async function downloadYoutubeReference({run, reach, capability, url, directory}) {
  if (!capability.supported) throw Error(capability.error);
  const normalized = shortsUrl(url);
  // Reach info is retained when available; yt-dlp metadata is also needed to
  // select a bounded, single-file MP4. No transcription or paid backend.
  if (capability.infoCommand) {
    const info = await reach([...capability.infoCommand, normalized], {timeout: 60000, maxBytes: 1024 ** 2});
    await writeFile(join(directory, 'youtube-info.json'), JSON.stringify(info, null, 2), {flag: 'wx'});
  }
  const info = JSON.parse(await run(capability.command, youtubeArgs(capability, 'info', normalized), {format: 'text', timeout: 60000}));
  if (!info || info.id !== normalized.split('/').pop() || !Number.isFinite(info.duration) || info.duration <= 0 || info.duration > referenceLimits.duration)
    throw Error('Chưa xác minh đúng video hoặc thời lượng tối đa 180 giây.');
  const formats = (Array.isArray(info.formats) ? info.formats : []).filter(f => f && f.ext === 'mp4' && f.vcodec && f.vcodec !== 'none' &&
    ['https', 'http'].includes(f.protocol) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(f.format_id) &&
    Number.isFinite(f.filesize) && f.filesize > 0 && f.filesize <= referenceLimits.bytes);
  const format = formats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || a.filesize - b.filesize)[0];
  if (!format) throw Error('Chưa có MP4 một file với dung lượng xác minh ≤ 25 MB. Không tải định dạng chưa rõ dung lượng.');
  await writeFile(join(directory, 'youtube-source.json'), JSON.stringify({url: normalized, id: info.id,
    title: typeof info.title === 'string' ? info.title.slice(0, 500) : null, durationSec: info.duration,
    formatId: format.format_id, size: format.filesize, observedAt: new Date().toISOString()}, null, 2), {flag: 'wx'});
  await run(capability.command, youtubeArgs(capability, 'download', normalized, directory, format.format_id), {
    format: 'text', timeout: 180000, maxBytes: 65536, fileBudget: {directory, maxBytes: referenceLimits.bytes + 2 * 1024 ** 2},
  });
  const path = await confinedFile(directory, join(directory, 'source.mp4')), file = await stat(path);
  if (!file.isFile() || !file.size || file.size > referenceLimits.bytes) throw Error('MP4 tải về vượt giới hạn 25 MB hoặc rỗng.');
  const subtitles = [];
  for (const name of (await readdir(directory)).filter(name => /^source\.[a-zA-Z0-9_-]+\.vtt$/.test(name))) {
    const subtitlePath = await confinedFile(directory, join(directory, name)), subtitle = await stat(subtitlePath);
    if (!subtitle.isFile() || subtitle.size > 1024 ** 2) throw Error('Phụ đề vượt giới hạn 1 MB.');
    const bytes = await readFile(subtitlePath);
    if (!bytes.toString('utf8').replace(/^\uFEFF/, '').startsWith('WEBVTT')) throw Error('Phụ đề không phải WebVTT hợp lệ.');
    subtitles.push({path: subtitlePath, sha256: sha256(bytes)});
  }
  return {path, sha256: sha256(await readFile(path)), sourceUrl: normalized, subtitles};
}
