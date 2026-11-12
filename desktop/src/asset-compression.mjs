import {mkdtemp,writeFile,readFile,rm,unlink,rmdir} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {compressMedia} from './compress.mjs';
import {verifiedFile} from './storage-policy.mjs';

export function assetCompression() {
  // Only main-process callers can mint a token. Renderer-supplied metadata or
  // paths are never trusted to bypass compression or remove a render directory.
  const prepared=new Map();
  return {
    register(result,onStored) {
      const token=randomUUID();
      if(prepared.size>=128)prepared.delete(prepared.keys().next().value);
      prepared.set(token,{...result,onStored});return token;
    },
    async resolve(token) {
      const result=prepared.get(token);
      if(result?.stored){if(!await verifiedFile(result.storedPath,result.sha256,result.size))throw Error('Media đã nhập không còn khớp checksum.');return {asset:result.stored};}
      if(!result||!await verifiedFile(result.path,result.sha256,result.size))throw Error('Bản media đã kiểm không còn khớp checksum.');
      return {file:new File([await readFile(result.path)],result.name||('media'+extname(result.path)),{type:result.type}),compression:result.compression,metadata:result.metadata};
    },
    async stored(token,assetPath,asset) {
      const result=prepared.get(token);if(!result)return;
      if(asset.sha256!==result.sha256||!await verifiedFile(assetPath,result.sha256,result.size))throw Error('Media chưa được lưu đúng checksum; giữ bản tạm.');
      await result.onStored?.();
      result.onStored=null;result.stored=asset;result.storedPath=assetPath;
    },
    async upload(file,type) {
      const dir=await mkdtemp(join(tmpdir(),'hermes-upload-'));
      let result;
      try {
        const suffix={'video/mp4':'.mp4','video/webm':'.webm','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[type];
        const path=join(dir,'source'+suffix);await writeFile(path,new Uint8Array(await file.arrayBuffer()));
        result=await compressMedia(path);
        const extension=result.type==='video/mp4'?'.mp4':result.type==='image/webp'?'.webp':suffix;
        return {file:new File([await readFile(result.path)],file.name.replace(/\.[^.]+$/,'')+extension,{type:result.type}),compression:result.compression,metadata:result.metadata};
      }finally{await result?.cleanup();await rm(dir,{recursive:true,force:true});}
    },
  };
}

// Called only for the result just returned by Worker.render in this session.
// Startup never discovers/deletes old renders. Failure leaves the new output.
export function registerNewRender(local,result) {
  return local.registerPreparedMedia(result,async()=>{
    if(!await verifiedFile(result.path,result.sha256,result.size))throw Error('Render đã thay đổi; giữ lại bản tạm để kiểm tra.');
    await unlink(result.path);
    await rmdir(dirname(result.path));
  });
}
