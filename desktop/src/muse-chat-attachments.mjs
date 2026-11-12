import {lstat, realpath, readFile} from 'node:fs/promises';
import {resolve, relative, isAbsolute, join, extname, parse, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';

const run = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, path) => {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset);
};

// Check every component, including junctions/links that resolve back inside.
// Only app integration jobs and the app reference store are upload sources.
export async function confinedAttachmentFile(root, path) {
  const target = resolve(path), base = resolve(root);
  if (!isAbsolute(path) || !inside(base, target)) throw Error('Ảnh đính kèm nằm ngoài thư mục dữ liệu tác vụ/tham chiếu.');
  let current = parse(target).root;
  for (const part of target.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Error('Không nhận symlink hoặc junction cho ảnh đính kèm.');
  }
  const resolved = await realpath(target), actualRoot = await realpath(base);
  if (!inside(actualRoot, resolved)) throw Error('Ảnh đính kèm nằm ngoài thư mục dữ liệu tác vụ/tham chiếu.');
  return resolved;
}

export async function checkedChatAttachments(workerRoot, paths) {
  const references = [];
  for (const path of paths) {
    const root = ['integrations', 'references'].map(name => resolve(workerRoot, name)).find(dir => inside(dir, resolve(path)));
    if (!root) throw Error('Ảnh đính kèm nằm ngoài thư mục dữ liệu tác vụ/tham chiếu.');
    const resolved = await confinedAttachmentFile(root, path), info = await lstat(resolved);
    if (!info.isFile() || !info.size || info.size > 8 * 1024 ** 2) throw Error('Mỗi ảnh đính kèm phải là file không rỗng, tối đa 8 MB.');
    const bytes = await readFile(resolved), extension = extname(resolved).toLowerCase();
    const png = extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = ['.jpg', '.jpeg'].includes(extension) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw Error('Chỉ nhận ảnh JPEG hoặc PNG hợp lệ.');
    // Decode with a fixed image codec and file-only protocols. A renamed text
    // file or a truncated image with a valid signature is not an attachment.
    try {
      await run('ffmpeg', ['-v','error','-nostdin','-xerror','-protocol_whitelist','file,pipe','-f','image2','-c:v',png?'png':'mjpeg',
        '-i',resolved,'-frames:v','1','-f','null','-'], {windowsHide:true, timeout:30000, maxBuffer:1024*1024});
    } catch { throw Error('Không giải mã được ảnh JPEG/PNG đính kèm. Kiểm tra file và FFmpeg.'); }
    references.push({path:resolved, type:png?'image/png':'image/jpeg', sha256:hash(bytes)});
  }
  return references;
}

export async function referenceChatAttachments(integrations, referenceJobId, projectId) {
  const id = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).parse(referenceJobId);
  const job = integrations.job(id);
  if (job.kind !== 'reference-structure' || job.state !== 'done' || projectId !== 'reference_' + id)
    throw Error('Chưa có phân tích video hoàn tất cho hội thoại này.');
  const dir = join(integrations.root, 'integrations', id);
  const path = await confinedAttachmentFile(dir, join(dir, 'structure.json'));
  if (relative(resolve(job.path), path) !== '') throw Error('Đường dẫn cấu trúc không khớp tác vụ tham chiếu.');
  const info = await lstat(path);
  if (!info.isFile() || info.size > 1024 * 1024) throw Error('File cấu trúc không hợp lệ.');
  const bytes = await readFile(path);
  if (hash(bytes) !== job.structureSha256) throw Error('File cấu trúc đã đổi sau khi kiểm tra checksum.');
  const structure = JSON.parse(bytes.toString('utf8'));
  const sheets = [{path:structure.contactSheetPath, sha256:structure.contactSheetSha256}, structure.contactSheets?.dense?.[0]];
  if (!sheets[1]) throw Error('Chưa có sheet dày. Phân tích lại MP4 trước khi gửi Muse.');
  for (const sheet of sheets) {
    sheet.path = await confinedAttachmentFile(dir, sheet.path);
    const file = await lstat(sheet.path);
    if (!file.isFile() || !file.size || file.size > 8 * 1024 ** 2) throw Error('Sheet phải là ảnh không rỗng, tối đa 8 MB.');
    if (hash(await readFile(sheet.path)) !== sheet.sha256) throw Error('Sheet đã đổi sau khi kiểm tra checksum.');
  }
  return sheets.map(sheet => sheet.path);
}
