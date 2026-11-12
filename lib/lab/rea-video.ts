import {z} from 'zod';

const sec=z.number().finite().nonnegative().max(180);
const label=z.string().trim().min(1).max(6000);
const shotId=z.string().regex(/^shot_\d{3,5}$/);
const frame=z.string().regex(/^shots\/shot_\d{3,5}(?:_first|_last)?\.jpg$/).nullable();
export const reaOverlaySchema=z.object({id:z.string().max(100),text:z.string().max(3000),fromSec:sec,toSec:sec,
  confidence:z.number().min(0).max(1).nullable(),style:z.object({
    fill:z.string().max(30).nullable(),stroke:z.string().max(30).nullable(),strokeRatio:z.number().nullable(),
    bbox:z.array(z.number().finite()).length(4).nullable(),lineHeight:z.number().nullable(),
    animIn:z.string().max(80).nullable(),animOut:z.string().max(80).nullable(),
  })}).refine(o=>o.toSec>o.fromSec,'Mốc chữ đè không hợp lệ.');
export const reaVideoSchema=z.object({
  version:z.literal(2),engine:z.literal('rea-video'),durationSec:sec.positive(),
  shots:z.array(z.object({id:shotId,start:sec,end:sec,camera:z.string().max(3000).nullable(),
    frame,firstFrame:frame,lastFrame:frame})).min(1).max(225),
  overlays:z.array(reaOverlaySchema).max(2000),
  audio:z.object({bpm:z.number().finite().positive().nullable(),hasVoice:z.boolean().nullable(),
    stems:z.object({music:z.string().nullable(),voice:z.string().nullable()})}),
  narrative:z.array(z.object({shotRange:z.tuple([z.number().int().positive(),z.number().int().positive()]),role:label,point:z.string().max(6000)})).max(225),
  remakePrompts:z.array(z.object({shotId,prompt:label,imagePrompt:z.string().max(6000),generationUnit:z.string().max(100)})).max(225),
  readBy:z.enum(['codex','gemini-api','manual']).nullable(),readStatus:z.enum(['complete','waiting']),
  metadata:z.object({filteredOcr:z.array(reaOverlaySchema).max(2000),ocrThreshold:z.literal(.8),
    measuredAt:z.string().datetime(),source:z.literal('breakdown.json'),reviewError:z.string().max(1000).nullable()}),
}).superRefine((v,c)=>{
  if(new Set(v.shots.map(s=>s.id)).size!==v.shots.length||v.shots.some((s,i)=>s.end<=s.start||s.end>v.durationSec+.01||(i>0&&s.start<v.shots[i-1].end-.01)))c.addIssue({code:'custom',message:'Shot trùng hoặc mốc shot không hợp lệ.'});
  if([...v.overlays,...v.metadata.filteredOcr].some(o=>o.toSec>v.durationSec+.1))c.addIssue({code:'custom',message:'Chữ đè vượt thời lượng.'});
  if(v.readStatus==='complete'&&(!v.readBy||v.shots.some((s,i)=>!v.remakePrompts.some(p=>p.shotId===s.id)||!v.narrative.some(n=>n.shotRange[0]<=i+1&&n.shotRange[1]>=i+1))))c.addIssue({code:'custom',message:'Chưa đọc đủ narrative và prompt của từng shot.'});
});
export type ReaVideo=z.infer<typeof reaVideoSchema>;

// Whitelist only: no verdict, material, provenance or production classification enters Hermes.
export function parseReaVideo(raw:any,{timeline,readBy=null,measuredAt=new Date().toISOString(),reviewError=null}: {
  timeline?:any;readBy?:ReaVideo['readBy'];measuredAt?:string;reviewError?:string|null}={}):ReaVideo {
  const safeFrame=(v:unknown)=>typeof v==='string'&&/^shots\/shot_\d{3,5}(?:_first|_last)?\.jpg$/.test(v)?v:null;
  const shots=(raw.shots??[]).map((s:any)=>({id:s.id,start:s.start,end:s.end,
    camera:s.aspects?.camera?.result?.move??s.features?.camera??null,
    frame:safeFrame(s.assets?.sheet),firstFrame:safeFrame(s.assets?.first_frame),lastFrame:safeFrame(s.assets?.last_frame)}));
  const cues=new Map<string,any>();
  for(const c of raw.packaging?.text_cues??[])cues.set(c.id,c);
  for(const c of timeline?.text??[])cues.set(c.id,{...cues.get(c.id),...c});
  const overlays:any[]=[],filteredOcr:any[]=[];
  for(const [id,c] of cues){
    const o={id,text:c.text??'',fromSec:Math.round(c.t0*10)/10,toSec:Math.round(c.t1*10)/10,confidence:c.conf??null,
      style:{fill:c.style?.fill??null,stroke:c.style?.stroke??null,strokeRatio:c.style?.stroke_ratio??null,bbox:c.bbox??null,
        lineHeight:c.line_h??null,animIn:c.anim_in?.kind??null,animOut:c.anim_out?.kind??null}};
    if(o.toSec<=o.fromSec)continue;
    (o.text.trim().length<3||(o.confidence!==null&&o.confidence<.8)?filteredOcr:overlays).push(o);
  }
  const narrative:any[]=[],remakePrompts:any[]=[];
  for(const [i,s] of (raw.shots??[]).entries()){
    const n=s.narrative??s.review?.narrative??s.vlm?.narrative;
    if(n?.role?.trim())narrative.push({shotRange:[i+1,i+1],role:n.role,point:n.point??''});
    const r=s.review?.replication??s.vlm?.replication??s.replication?.capsule??s.replication;
    const prompt=r?.video_prompt_en||r?.video_prompt||r?.prompt_en||r?.prompt;
    const unit=raw.production_plan?.units?.find((u:any)=>u.shots?.includes(i+1));
    if(prompt?.trim())remakePrompts.push({shotId:s.id,prompt,imagePrompt:r?.image_prompt??'',generationUnit:unit?.id??`G${i+1}`});
  }
  const complete=!!readBy&&shots.length>0&&narrative.length===shots.length&&remakePrompts.length===shots.length;
  return reaVideoSchema.parse({version:2,engine:'rea-video',durationSec:raw.source?.duration,shots,overlays,
    audio:{bpm:raw.audio?.music?.tempo_bpm??raw.audio?.tempo_bpm??null,hasVoice:raw.audio?.voice?.present??null,
      stems:{music:raw.stems?.ok?'stems/music.wav':null,voice:raw.stems?.ok?'stems/vocals.wav':null}},
    narrative,remakePrompts,readBy:complete?readBy:null,readStatus:complete?'complete':'waiting',
    metadata:{filteredOcr,ocrThreshold:.8,measuredAt,source:'breakdown.json',reviewError}});
}

export const reviewAnswersSchema=z.object({shots:z.array(z.object({id:shotId,description:label,
  narrative:z.object({role:label,point:label}),replication:z.object({image_prompt:label,video_prompt:label,video_prompt_en:label})
})).min(1).max(225)});
export function validateReviewAnswers(input:unknown,ids:string[]){
  const result=reviewAnswersSchema.parse(input);
  if(result.shots.length!==ids.length||new Set(result.shots.map(s=>s.id)).size!==ids.length||result.shots.some(s=>!ids.includes(s.id)))throw Error('Kết quả đọc ảnh phải có đúng một câu trả lời cho mỗi shot.');
  return {shots:ids.map(id=>result.shots.find(s=>s.id===id)!)};
}
// Native Codex structured-output subset; semantic validation above remains authoritative.
const str={type:'string'};
export const reviewAnswersJsonSchema={type:'object',additionalProperties:false,required:['shots'],properties:{shots:{type:'array',items:{type:'object',additionalProperties:false,required:['id','description','narrative','replication'],properties:{id:str,description:str,
  narrative:{type:'object',additionalProperties:false,required:['role','point'],properties:{role:str,point:str}},
  replication:{type:'object',additionalProperties:false,required:['image_prompt','video_prompt','video_prompt_en'],properties:{image_prompt:str,video_prompt:str,video_prompt_en:str}}}}}}};
