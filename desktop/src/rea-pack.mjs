import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {confinedFile} from './reference-structure.mjs';
export const overlayCopySchema=z.array(z.object({id:z.string().min(1).max(100),text:z.string().trim().min(1).max(120).refine(t=>!/[{}\\\r]/.test(t),'Chữ đè không chứa mã ASS.')})).max(2000);
const seconds=value=>{const [h,m,s]=value.split(':').map(Number);return h*3600+m*60+s;};
const time=value=>{const cs=Math.round(value*100),s=Math.floor(cs/100);return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;};
const assText=text=>text.replace(/\n/g,'\\N');
const color=(hex,fallback)=>/^#[0-9a-f]{6}$/i.test(hex??'')?'&H00'+hex.slice(5,7)+hex.slice(3,5)+hex.slice(1,3):fallback;

// Preserve the upstream event style, position and animation verbatim; replace only text.
// OCR rejected by Hermes never becomes a dialogue event. Missing scene text receives
// the measured bbox/font/outline/timing rather than copying an unrelated label style.
export function productAss(template,data,copies){
  copies=overlayCopySchema.parse(copies);
  if(new Set(copies.map(c=>c.id)).size!==copies.length||copies.length!==data.overlays.length||data.overlays.some(o=>!copies.some(c=>c.id===o.id)))throw Error('Điền chữ của sản phẩm cho từng lớp chữ đè.');
  const lines=template.split(/\r?\n/),events=[],used=new Set();
  for(const line of lines.filter(l=>l.startsWith('Dialogue:'))){
    const match=line.match(/^Dialogue:\s*((?:[^,]*,){9})(.*)$/);if(!match)continue;
    const fields=match[1].split(','),from=seconds(fields[1]),to=seconds(fields[2]),plain=match[2].replace(/\{[^}]*\}/g,'').replace(/\\N/g,'\n');
    const cue=data.overlays.find(o=>!used.has(o.id)&&Math.abs(o.fromSec-from)<.11&&Math.abs(o.toSec-to)<.11&&o.text===plain);
    if(!cue)continue;used.add(cue.id);
    const tags=match[2].match(/^(?:\{[^}]*\})*/)?.[0]??'';
    events.push('Dialogue: '+match[1]+tags+assText(copies.find(c=>c.id===cue.id).text));
  }
  const header=lines.filter(l=>!l.startsWith('Dialogue:'));
  const width=Number(template.match(/PlayResX:\s*(\d+)/)?.[1]??720),height=Number(template.match(/PlayResY:\s*(\d+)/)?.[1]??1280);
  for(const [i,cue] of data.overlays.entries())if(!used.has(cue.id)){
    const style=cue.style,b=style.bbox??[.1,.1,.8,.06],size=Math.max(10,Math.round((style.lineHeight??b[3])*height)),name='Hermes'+i;
    const line=`Style: ${name},Sans,${size},${color(style.fill,'&H00FFFFFF')},&H0000FFFF,${color(style.stroke,'&H00000000')},&H00000000,0,0,0,0,100,100,0,0,1,${Math.round((style.strokeRatio??.04)*size)},0,5,0,0,0,1`;
    const at=header.findIndex(l=>l==='[Events]');header.splice(at<0?header.length:at,0,line);
    const fade=/fade/.test(style.animIn??'')||/fade/.test(style.animOut??'')?'\\fad(200,200)':'';
    events.push(`Dialogue: 1,${time(cue.fromSec)},${time(cue.toSec)},${name},,0,0,0,,{\\pos(${Math.round((b[0]+b[2]/2)*width)},${Math.round((b[1]+b[3]/2)*height)})${fade}}${assText(copies.find(c=>c.id===cue.id).text)}`);
  }
  return [...header,...events].join('\n')+'\n';
}

export async function exportReaPack(directory,data,{productName,copies}){
  if(typeof productName!=='string'||!productName.trim()||productName.length>150)throw Error('Điền tên sản phẩm của bạn.');
  if(data.readStatus!=='complete')throw Error('Đọc đủ ảnh shot trước khi xuất gói prompt.');
  copies=overlayCopySchema.parse(copies);
  const source=join(directory,'rea-video'),templatePath=await confinedFile(source,join(source,'packaging/overlays.ass'));
  const template=await readFile(templatePath,'utf8');if(Buffer.byteLength(template)>1024*1024)throw Error('ASS vượt giới hạn.');
  const ass=productAss(template,data,copies),out=join(directory,'manual-packs',randomUUID());await mkdir(out,{recursive:true});
  const units=new Map();
  for(const prompt of data.remakePrompts){const shot=data.shots.find(s=>s.id===prompt.shotId);units.set(prompt.generationUnit,[...(units.get(prompt.generationUnit)??[]),{...shot,prompt:prompt.prompt,imagePrompt:prompt.imagePrompt}]);}
  const manifest=[];
  for(const [index,shots] of [...units.values()].entries()){
    const unit='UNIT-'+String(index+1).padStart(2,'0'),frames=[];
    for(const shot of shots)for(const field of ['firstFrame','lastFrame'])if(shot[field]){
      const path=await confinedFile(source,join(source,shot[field]));if((await stat(path)).size>5*1024*1024)throw Error('Khung tham chiếu vượt 5 MB.');
      const name=basename(path);await copyFile(path,join(out,name));frames.push(name);
    }
    const content=[`PRODUCT: ${productName.trim()}`,'Rebuild the shot structure for this product. Use approved product references for its actual shape and markings. Replace source brands, people and packaging. Do not copy unsupported effects or claims. Add overlays only in editing.',
      `Generation unit ${index+1}: ${shots[0].start}–${shots.at(-1).end}s.`,...shots.map(s=>`${s.id}: ${s.start}–${s.end}s\nReference action and framing (adapt to the selected product): ${s.prompt}\nFirst frame composition: ${s.imagePrompt}`),
      'Frame references: '+frames.join(', ')].join('\n\n');
    await writeFile(join(out,unit+'.txt'),content,{flag:'wx'});manifest.push({id:unit,shots,frames});
  }
  await writeFile(join(out,'overlays.ass'),ass,{flag:'wx'});
  await writeFile(join(out,'timeline.json'),JSON.stringify({version:2,product:productName,units:manifest,overlays:data.overlays.map(o=>({...o,text:copies.find(c=>c.id===o.id).text})),
    renderArgs:['-i','edited.mp4','-vf','ass=overlays.ass','-c:v','libx264','-c:a','copy','output.mp4']},null,2),{flag:'wx'});
  await writeFile(join(out,'README-VI.txt'),'Gói prompt manual theo generation unit. Tự thêm ảnh sản phẩm đã duyệt vào Flow/Gemini và sửa prompt theo đúng SKU. Khung đầu/cuối của mẫu chỉ hướng dẫn bố cục; không dùng lại thương hiệu gốc.\nGhép các shot đúng timeline.json thành edited.mp4. FFmpeg đốt chữ sản phẩm bằng: ffmpeg -i edited.mp4 -vf ass=overlays.ass -c:v libx264 -c:a copy output.mp4\nApp không tự mở hoặc điều khiển website. Xem lại từng cảnh và chữ trước khi xuất.\n',{flag:'wx'});
  return {path:out,units:manifest.length};
}
