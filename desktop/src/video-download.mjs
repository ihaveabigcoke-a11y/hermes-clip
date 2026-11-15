const limit = 64 * 1024 ** 2;
const incomplete = () => Object.assign(Error('Video source is incomplete'),{downloadReason:'incomplete_video'});

// Transport completion is necessary before normalization. This is deliberately
// not a replacement for the full packet decode performed by saveDownload.
export function assertCompleteVideo(bytes, contentLength = null) {
  if(!bytes.length||bytes.length>limit||bytes.toString('ascii',4,8)!=='ftyp')throw Object.assign(Error('Video URL did not return MP4'),{downloadReason:'invalid_mp4_or_size'});
  if(contentLength!==null&&(!Number.isSafeInteger(Number(contentLength))||Number(contentLength)!==bytes.length))throw incomplete();
  let offset=0;const boxes=new Set();
  while(offset<bytes.length){
    if(offset+8>bytes.length)throw incomplete();
    let size=bytes.readUInt32BE(offset),header=8;const type=bytes.toString('ascii',offset+4,offset+8);
    if(size===1){if(offset+16>bytes.length)throw incomplete();size=Number(bytes.readBigUInt64BE(offset+8));header=16;}
    else if(size===0)size=bytes.length-offset;
    if(!Number.isSafeInteger(size)||size<header||offset+size>bytes.length)throw incomplete();
    boxes.add(type);offset+=size;
  }
  if(bytes.toString('ascii',4,8)!=='ftyp'||!boxes.has('moov')||!boxes.has('mdat'))throw incomplete();
  return bytes;
}

export async function readCompleteVideoSource(media,page,startUrl) {
  // An immutable blob may first contain only a prefix and later be replaced by
  // a new URL. Re-read this same receipt's source on each bounded attempt.
  for(let attempt=0;attempt<3;attempt++){
    let response;
    try{
      const source=await media.evaluate(video=>video.currentSrc||video.src||video.querySelector('source')?.src||'');
      const url=new URL(source);
      if(!((url.protocol==='https:'&&!url.username&&!url.password)||(url.protocol==='blob:'&&url.origin===new URL(startUrl).origin)))throw Object.assign(Error('Unsupported source'),{downloadReason:'invalid_mp4_or_size'});
      let bytes,length;
      if(url.protocol==='blob:'){
        const result=await media.evaluate(async(video,{source,limit})=>{
          const current=()=>video.currentSrc||video.src||video.querySelector('source')?.src||'';
          if(current()!==source)throw Error('Blob changed');
          const response=await fetch(source,{signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw Error('Blob unavailable');
          const length=response.headers.get('content-length');
          if(length!==null&&(!Number.isSafeInteger(Number(length))||Number(length)<=0||Number(length)>limit))throw Error('Blob size invalid');
          const reader=response.body.getReader(),chunks=[];let size=0;
          try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Blob exceeds budget');chunks.push(value);}}
          catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
          if(!size||(length!==null&&size!==Number(length))||current()!==source)throw Error('Blob incomplete');
          const blob=new Blob(chunks),base64=await new Promise((resolve,reject)=>{const file=new FileReader();file.onerror=()=>reject(Error('Blob read failed'));file.onload=()=>resolve(String(file.result).split(',')[1]);file.readAsDataURL(blob);});
          return {base64,length:size};
        },{source,limit});
        bytes=Buffer.from(result.base64,'base64');length=result.length;
      }else{
        response=await page.request.get(url.href,{timeout:15000});
        if(!response.ok())throw Object.assign(Error('Video unavailable'),{downloadReason:'http_not_ready'});
        length=response.headers()['content-length']??null;
        if(length!==null&&Number(length)>limit)throw Object.assign(Error('Video exceeds budget'),{downloadReason:'size_limit'});
        bytes=await response.body();
      }
      assertCompleteVideo(bytes,length);
      const current=await media.evaluate(video=>video.currentSrc||video.src||video.querySelector('source')?.src||'');
      if(current!==source)throw incomplete();
      return {bytes,scheme:url.protocol};
    }catch(error){
      if(attempt===2||['size_limit','invalid_mp4_or_size'].includes(error.downloadReason))throw error;
      await page.waitForTimeout(250);
    }finally{await response?.dispose();}
  }
}
