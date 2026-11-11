import {existsSync} from 'node:fs';
import {delimiter,join} from 'node:path';

export function enablePortableMediaTools(desktopRoot) {
  const bin=join(desktopRoot,'tools','ffmpeg','bin');
  const suffix=process.platform==='win32'?'.exe':'';
  if(!['ffmpeg','ffprobe'].every(name=>existsSync(join(bin,name+suffix))))return;
  const paths=(process.env.PATH||'').split(delimiter);
  if(!paths.includes(bin))process.env.PATH=[bin,...paths].join(delimiter);
}
