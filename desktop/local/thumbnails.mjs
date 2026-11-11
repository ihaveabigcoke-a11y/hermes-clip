import {mkdir,readFile,stat,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertDiskSpace,trimRegenerableCache,assertContained} from '../src/storage-policy.mjs';
const exec=promisify(execFile);
export class ThumbnailCache{
  constructor(root,db,filePath,policy){this.root=root;this.db=db;this.filePath=filePath;this.policy=policy;this.pending=new Map();this.tail=Promise.resolve();}
  async get(id){
    const row=this.db.prepare("SELECT data FROM lab_records WHERE owner_id='local-owner' AND id=? AND kind='asset'").get(id);
    if(!row)throw Error('Không có file.');const asset=JSON.parse(row.data);
    if(!/^[a-f0-9]{64}$/.test(asset.sha256)||!asset.type.startsWith('video/'))throw Error('Chưa có thông tin video.');
    const dir=join(this.root,'thumbnails'),path=join(dir,asset.sha256+'.jpg');
    try{return await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(this.pending.has(path))return this.pending.get(path);
    const generate=this.tail.catch(()=>{}).then(async()=>{
      await mkdir(dir,{recursive:true});await assertContained(this.root,path);assertDiskSpace(this.root,1024**2,this.policy);
      const source=this.filePath(asset.key);await assertContained(join(this.root,'media'),source);
      const temporary=path+'.part.jpg';
      try{
        await exec('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,'-frames:v','1','-vf','scale=320:-2','-q:v','6',temporary],{timeout:20000,windowsHide:true,maxBuffer:1024**2});
        const size=(await stat(temporary)).size;if(!size||size>1024**2)throw Error('Ảnh thu nhỏ không hợp lệ.');
        await rename(temporary,path);const bytes=await readFile(path);await trimRegenerableCache(dir,this.policy.thumbnailCacheBytes);return bytes;
      }finally{await unlink(temporary).catch(()=>{});}
    });
    this.pending.set(path,generate);this.tail=generate;try{return await generate;}finally{this.pending.delete(path);}
  }
}
