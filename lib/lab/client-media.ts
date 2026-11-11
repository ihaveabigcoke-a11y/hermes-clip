"use client";
export async function probeFile(file:File,kind:"image"|"video",signal?:AbortSignal):Promise<{width:number;height:number;duration:number|null}> {
  if(signal?.aborted)throw new Error("Đã hủy kiểm tra file.");
  if(kind==="image"){
    let image:ImageBitmap;
    try{image=await createImageBitmap(file);}catch{throw new Error("Không giải mã được ảnh. Kiểm tra lại file trước khi tải.");}
    const result={width:image.width,height:image.height,duration:null};image.close();return result;
  }
  return await new Promise((resolve,reject)=>{
    const video=document.createElement("video"),url=URL.createObjectURL(file);video.muted=true;video.preload="auto";
    const finish=(error?:Error)=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);video.onloadeddata=null;video.onerror=null;video.removeAttribute("src");video.load();URL.revokeObjectURL(url);if(error)reject(error);};
    const abort=()=>finish(new Error("Đã hủy kiểm tra video."));
    const timer=setTimeout(()=>finish(new Error("Không đọc được video trong 20 giây. Thử MP4 H.264 có thời lượng rõ.")),20000);
    signal?.addEventListener("abort",abort,{once:true});
    video.onloadeddata=()=>{if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth){finish(new Error("Video thiếu kích thước hoặc thời lượng đọc được."));return;}const data={width:video.videoWidth,height:video.videoHeight,duration:video.duration};finish();resolve(data);};
    video.onerror=()=>finish(new Error("Trình duyệt không giải mã được video. Dùng MP4 H.264 hoặc WebM hợp lệ."));
    video.src=url;video.load();
  });
}
