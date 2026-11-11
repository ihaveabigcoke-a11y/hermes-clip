import {statfsSync} from 'node:fs';
import {mkdir,stat,lstat,realpath,readFile,writeFile,readdir,unlink,rename,link,open} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const MiB=1024**2;
export const STORAGE_DEFAULTS=Object.freeze({minFreeBytes:2048*MiB,browserCacheBytes:128*MiB,electronCacheBytes:64*MiB,thumbnailCacheBytes:128*MiB,logBytes:4*MiB,logFiles:3});
export function storagePolicy(store){
  const value=store?.get('storage_policy',{})??{};
  return Object.fromEntries(Object.entries(STORAGE_DEFAULTS).map(([key,fallback])=>[key,Number.isSafeInteger(value[key])&&value[key]>0?value[key]:fallback]));
}
export function diskStatus(root,policy=STORAGE_DEFAULTS,inspect=statfsSync){
  try{const s=inspect(root),freeBytes=Number(s.bavail)*Number(s.bsize);return {freeBytes,minFreeBytes:policy.minFreeBytes,blocked:freeBytes<policy.minFreeBytes,message:freeBytes<policy.minFreeBytes?'Ổ đĩa còn dưới '+(policy.minFreeBytes/1024**3).toFixed(1)+' GB. Giải phóng dung lượng rồi chạy tiếp; tác vụ đã gửi vẫn được giữ.':''};}
  catch{return {freeBytes:null,minFreeBytes:policy.minFreeBytes,blocked:true,message:'Chưa đo được dung lượng ổ đĩa. Kiểm tra quyền truy cập thư mục dữ liệu trước khi chạy tiếp.'};}
}
export function assertDiskSpace(root,requiredBytes=0,policy=STORAGE_DEFAULTS,inspect=statfsSync){
  const status=diskStatus(root,policy,inspect);
  if(status.blocked||status.freeBytes-requiredBytes<policy.minFreeBytes){const error=Error(status.message||'Chưa đủ dung lượng dự phòng để ghi file. Giải phóng dung lượng rồi chạy tiếp.');error.code='STORAGE_LOW';throw error;}
  return status;
}
export function browserCacheArgs(store){const p=storagePolicy(store);return ['--disk-cache-size='+p.browserCacheBytes,'--media-cache-size='+p.browserCacheBytes];}
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifiedFile(path,sha256,size){
  try{const info=await lstat(path);return info.isFile()&&!info.isSymbolicLink()&&info.size===size&&digest(await readFile(path))===sha256;}catch{return false;}
}
export async function assertContained(root,path){
  const base=await realpath(root),parent=await realpath(dirname(path));
  if(parent.toLowerCase()!==base.toLowerCase()&&!parent.toLowerCase().startsWith(base.toLowerCase()+sep))throw Error('File nằm ngoài thư mục dữ liệu.');
  const info=await lstat(path).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(info?.isSymbolicLink())throw Error('Không xử lý file liên kết ngoài kho dữ liệu.');
}

// Media paths are immutable. Every new key gets its own hard link, so deleting
// an asset never removes bytes still used by another asset or a worker receipt.
export async function putImmutableMedia({root,path,bytes,candidates=[],policy=STORAGE_DEFAULTS}){
  await mkdir(dirname(path),{recursive:true});await assertContained(root,path);
  const hash=digest(bytes);
  if(await verifiedFile(path,hash,bytes.length))return {sha256:hash,reused:true};
  if(await stat(path).catch(()=>null))throw Error('File đích đã tồn tại với nội dung khác; giữ nguyên để kiểm tra.');
  const temporary=path+'.hermes-part-'+randomUUID();
  let reused=false;
  try{
    for(const source of [...new Set(candidates)]){
      if(resolve(source)===resolve(path)||!await verifiedFile(source,hash,bytes.length))continue;
      try{await link(source,temporary);reused=true;break;}catch(error){if(!['EXDEV','EPERM','EACCES','ENOTSUP'].includes(error.code))throw error;}
    }
    if(!reused){assertDiskSpace(root,bytes.length,policy);await writeFile(temporary,bytes,{flag:'wx'});}
    if(!await verifiedFile(temporary,hash,bytes.length))throw Error('File ghi chưa khớp checksum.');
    // link is an atomic no-clobber publish, unlike rename over an existing asset.
    try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST'||!await verifiedFile(path,hash,bytes.length))throw error;}
    return {sha256:hash,reused};
  }finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}

export async function saveDownload(download,path){
  const temporary=path+'.hermes-part-'+randomUUID();
  try{
    assertDiskSpace(dirname(path),64*MiB);
    await download.saveAs(temporary);
    if(await download.failure())throw Error('Tải file không thành công.');
    const info=await stat(temporary);if(!info.size)throw Error('File tải về rỗng.');
    const hash=digest(await readFile(temporary));
    if(await stat(path).catch(()=>null)){
      if(!await verifiedFile(path,hash,info.size))throw Error('Kết quả tải lại khác bản đã lưu. Giữ bản cũ để đối soát.');
    }else await rename(temporary,path);
    if(!await verifiedFile(path,hash,info.size))throw Error('File đích chưa khớp bản tải.');
    return path;
  }finally{
    await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});
    // The browser artifact is disposable even on failure; the remote receipt
    // remains in SQLite and completed targets are never removed here.
    await download.delete?.().catch(()=>{});
  }
}

export async function shareVerifiedMedia(root,path,source,sha256,size){
  await assertContained(root,path);
  if(!await verifiedFile(path,sha256,size)||!await verifiedFile(source,sha256,size))throw Error('Không hợp nhất file chưa khớp checksum.');
  const [a,b]=await Promise.all([stat(path),stat(source)]);if(a.dev===b.dev&&a.ino===b.ino)return false;
  const temporary=path+'.hermes-part-'+randomUUID();
  try{await link(source,temporary);await rename(temporary,path);return true;}
  catch(error){if(['EXDEV','EPERM','EACCES','EBUSY','ENOTSUP'].includes(error.code))return false;throw error;}
  finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}

export async function rotateLog(path,{maxBytes=STORAGE_DEFAULTS.logBytes,keep=STORAGE_DEFAULTS.logFiles}={}){
  if((await stat(path).catch(()=>({size:0}))).size<maxBytes)return;
  await unlink(path+'.'+keep).catch(e=>{if(e.code!=='ENOENT')throw e;});
  for(let i=keep-1;i>=1;i--)await rename(path+'.'+i,path+'.'+(i+1)).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await rename(path,path+'.1');
}
export async function appendStorageLog(root,entry,policy=STORAGE_DEFAULTS){
  const path=join(root,'storage-maintenance.ndjson');await rotateLog(path,{maxBytes:policy.logBytes,keep:policy.logFiles});
  const file=await open(path,'a');try{await file.write(JSON.stringify({at:Date.now(),...entry})+'\n');}finally{await file.close();}
}

async function regularFiles(root){
  const files=[];
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
    const path=join(dir,entry.name);const info=await lstat(path);if(info.isSymbolicLink())continue;
    if(info.isDirectory())await walk(path);else if(info.isFile())files.push({path,size:info.size,mtime:info.mtimeMs});
  }}
  await walk(root);return files;
}
export async function trimRegenerableCache(root,maxBytes){
  if((await lstat(root).catch(()=>null))?.isSymbolicLink())return [];
  const files=await regularFiles(root);let bytes=files.reduce((n,f)=>n+f.size,0);const removed=[];
  for(const file of files.sort((a,b)=>a.mtime-b.mtime)){
    if(bytes<=maxBytes)break;
    await assertContained(root,file.path);
    try{await unlink(file.path);bytes-=file.size;removed.push(file);}catch(error){if(!['EBUSY','EPERM','EACCES','ENOENT'].includes(error.code))throw error;}
  }
  return removed;
}
export async function maintainStorage(root,store,{now=Date.now(),maxAgeMs=24*60*60*1000}={}){
  const removed=[];const serialized=JSON.stringify(store?.jobs()??[]);
  // Only our atomic-write artifacts. Never sweep browser temp dirs, exports,
  // failure diagnostics, outputs, SQLite files or unrecognized *.tmp files.
  for(const dir of [join(root,'outputs'),join(root,'workspace','media')])for(const file of await regularFiles(dir)){
    if(!/\.hermes-part-[a-f0-9-]{36}$/.test(file.path)||now-file.mtime<maxAgeMs||serialized.includes(file.path)||serialized.includes(file.path.replaceAll('\\','\\\\')))continue;
    await assertContained(root,file.path);try{await unlink(file.path);removed.push(file);}catch(error){if(!['EBUSY','EPERM','EACCES','ENOENT'].includes(error.code))throw error;}
  }
  removed.push(...await trimRegenerableCache(join(root,'workspace','thumbnails'),storagePolicy(store).thumbnailCacheBytes));
  if(removed.length)await appendStorageLog(root,{action:'cleanup',removed},storagePolicy(store));
  return removed;
}

export async function trimProfileCaches(root,store){
 const limit=storagePolicy(store).browserCacheBytes;
 for(const [name,budget] of [['Cache',limit],['Code Cache',Math.floor(limit/2)],['GPUCache',16*1024**2],['DawnGraphiteCache',16*1024**2],['DawnWebGPUCache',16*1024**2]])await trimRegenerableCache(join(root,'Default',name),budget);
}
