import { variantItems, pendingTakeSelection, storyboardMetadata, type Production } from "./production.ts";
import type { LabRecord } from "./domain";
import { sampleCheckState } from "./sample-check.ts";

/** Non-throwing preflight for export views; the actual export keeps its strict domain gate. */
export function variantExportStatus(p:Production,variantId:string) {
  if(pendingTakeSelection(p)?.variantIds.includes(variantId))return {state:'waiting_take' as const,label:'Chờ chọn take',reason:'Duyệt kịch bản/video rồi chọn đủ phiên bản cho biến thể trước khi ghép.'};
  try {variantItems(p,variantId);return {state:'ready' as const,label:'Sẵn sàng xuất gói',reason:''};}
  catch(error){return {state:'blocked' as const,label:'Cần duyệt lại',reason:(error as Error).message};}
}

export function crc32(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function zipFiles(files:{name:string;bytes:Uint8Array}[]):Uint8Array {
  const enc=new TextEncoder(),chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
  for(const f of files){const name=enc.encode(f.name),crc=crc32(f.bytes);if(!/^[a-zA-Z0-9_./-]+$/.test(f.name)||f.name.includes(".."))throw new Error("Tên file ZIP không hợp lệ.");
    const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,f.bytes.length,true);v.setUint32(22,f.bytes.length,true);v.setUint16(26,name.length,true);local.set(name,30);
    const ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,crc,true);cv.setUint32(20,f.bytes.length,true);cv.setUint32(24,f.bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);ch.set(name,46);
    chunks.push(local,f.bytes);central.push(ch);offset+=local.length+f.bytes.length;
  }
  const centralSize=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  const all=[...chunks,...central,end],out=new Uint8Array(all.reduce((n,c)=>n+c.length,0));let pos=0;for(const c of all){out.set(c,pos);pos+=c.length;}return out;
}
export function buildManifest(p:Production,variantId:string,product:LabRecord){
  if(product.id!==p.productId||product.revision!==p.productRevision)throw new Error("Hồ sơ sản phẩm đã đổi. Đồng bộ và duyệt lại trước khi xuất.");
  const variant=p.variants.find(v=>v.id===variantId)!;
  const items=variantItems(p,variantId);
  const media=items.map(({scene,take},index)=>({...(scene.storyboardVersion===2?{storyboard:storyboardMetadata(scene)}:{}),order:index+1,path:`media/${String(index+1).padStart(2,"0")}_${take.id}.${take.type==="video/webm"?"webm":"mp4"}`,sceneId:scene.id,sceneRevision:scene.revision,role:scene.role,attemptId:take.attemptId,takeId:take.id,assetId:take.assetId,sourceName:take.name,sha256:take.sha256,size:take.size,metadata:take.metadata,references:scene.references,prompt:scene.prompt,overlayText:scene.overlayText??null,voice:scene.voice}));
  const refs=p.references.filter(r=>items.some(i=>i.scene.references.some(pin=>pin.id===r.id&&pin.version===r.version)));
  return {schema_version:1,approval_scope:"internal",created_at:new Date().toISOString(),production_name:p.name,product:{id:product.id,revision:product.revision,name:product.data.name,sampleVerified:sampleCheckState(product.data)==="verified",sku:product.data.sku??"",claims:product.data.allowedClaims??"",invariants:product.data.invariants??""},variant,body:p.bodies.find(b=>b.id===variant.bodyId),aspect_ratio:items[0].scene.ratio,duration_seconds:items.reduce((n,i)=>n+(i.take.metadata.duration??0),0),media,references:refs,attempts:items.flatMap(i=>i.scene.attempts.filter(a=>a.id===i.take.attemptId)),render_status:"source_package_not_merged",usage_note:"Usage null means the cost of that attempt is unknown."};
}
export async function productionPackage(p:Production,variantId:string,product:LabRecord,signal:AbortSignal,onProgress:(s:string)=>void){
  const manifest=buildManifest(p,variantId,product),enc=new TextEncoder();
  if(signal.aborted)throw new Error("Đã hủy xuất gói.");
  if(manifest.media.reduce((n,m)=>n+m.size,0)>60*1024*1024)throw new Error("Gói vượt 60 MB. Xuất manifest và tải phiên bản riêng, hoặc tách nội dung chính nhỏ hơn.");
  const files:{name:string;bytes:Uint8Array}[]=[];
  for(const media of manifest.media){onProgress(`Đang lấy file ${media.order}/${manifest.media.length}`);const r=await fetch(`/api/assets/${media.assetId}`,{signal,cache:"no-store"});if(!r.ok)throw new Error(`Không tải được phiên bản ${media.order}. Kiểm tra phiên đăng nhập và file.`);const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length!==media.size)throw new Error("Kích thước file thay đổi. Dừng xuất để đối soát.");const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");if(hash!==media.sha256)throw new Error("SHA-256 không khớp phiên bản. Chưa tạo gói xuất.");files.push({name:media.path,bytes});}
  const [rw,rh]=manifest.aspect_ratio.split(":").map(Number),w=rw>=rh?1280:720,h=Math.round(w*rh/rw/2)*2;
  const normalize=(path:string,order:number,silent:boolean)=>`ffmpeg -y -i "${path}" ${silent?'-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -map 0:v:0 -map 1:a:0 -shortest':'-map 0:v:0 -map 0:a:0'} -vf "scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24" -c:v libx264 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "normalized/${String(order).padStart(2,"0")}.mp4"`;
  const commands=manifest.media.map(m=>`audio=$(ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "${m.path}")\nif [ -n "$audio" ]; then\n  ${normalize(m.path,m.order,false)}\nelse\n  ${normalize(m.path,m.order,true)}\nfi`);
  const concat="ffconcat version 1.0\n"+manifest.media.map(m=>`file 'normalized/${String(m.order).padStart(2,"0")}.mp4'`).join("\n")+"\n";
  const script=["#!/bin/sh","set -eu",'cd "$(dirname "$0")"','mkdir -p normalized',...commands,'ffmpeg -y -f concat -safe 1 -i render.ffconcat -c copy -movflags +faststart output.mp4'].join("\n")+"\n";
  const ps=["$ErrorActionPreference = 'Stop'","Set-Location $PSScriptRoot","New-Item -ItemType Directory -Force normalized | Out-Null",...manifest.media.flatMap(m=>[`$audio = & ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "${m.path}"`,"if ($LASTEXITCODE -ne 0) { throw 'ffprobe failed.' }","if ($audio) {",normalize(m.path,m.order,false),"} else {",normalize(m.path,m.order,true),"}","if ($LASTEXITCODE -ne 0) { throw 'FFmpeg failed; output is not verified.' }"]),'ffmpeg -y -f concat -safe 1 -i render.ffconcat -c copy -movflags +faststart output.mp4',"if ($LASTEXITCODE -ne 0) { throw 'FFmpeg merge failed.' }"].join("\r\n");
  const readme="HERMES CLIP — INTERNAL SOURCE PACKAGE\n\nApproval scope is internal review. Physical sample verification is recorded in manifest.json. Publishing and sales conditions are decided separately.\n\nThis ZIP contains real source take files and a traced manifest. No merged MP4 is claimed.\nInstall FFmpeg from its official source (https://ffmpeg.org/download.html), extract the ZIP, then run render.ps1 on Windows or sh render.sh on macOS/Linux. Both ffmpeg and ffprobe must be available.\nThe optional script normalizes and concatenates sources in manifest order, preserves the complete frame with padding, keeps source audio when present, and adds silence when a source has no audio track. Review audio and join points.\nAdd licensed music, voiceover and subtitles in your editor. Captions are in caption.txt; locale is a label, not proof of translation/dubbing.\noutput.mp4 exists only after FFmpeg succeeds locally; verify its duration, dimensions, audio and visual quality before publishing.\nBrowser download location is selected by your browser; the app cannot read your local Downloads path.\n";
  for(const [name,value] of [["manifest.json",JSON.stringify(manifest,null,2)],["render.ffconcat",concat],["render.sh",script],["render.ps1",ps],["caption.txt",manifest.variant.caption],["README.txt",readme]])files.push({name,bytes:enc.encode(value)});
  if(signal.aborted)throw new Error("Đã hủy xuất gói.");
  onProgress("Đang đóng gói file đã đối soát");return {blob:new Blob([zipFiles(files) as Uint8Array<ArrayBuffer>],{type:"application/zip"}),manifest};
}
