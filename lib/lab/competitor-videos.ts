import {z} from 'zod';
import type {LabRecord} from './domain.ts';
export const competitorVideoSchema=z.object({
  url:z.string().trim().max(2048).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}},'Dùng link HTTPS hợp lệ, không kèm thông tin đăng nhập.'),
  platform:z.enum(['instagram','tiktok','youtube','other']),
  competitor:z.string().trim().max(200).nullable().default(null),note:z.string().trim().max(2000).nullable().default(null),
  referenceId:z.string().max(120).nullable().default(null),
});
export const competitorVideosSchema=z.array(competitorVideoSchema).max(20,'Tối đa 20 video đối thủ.');
export type CompetitorVideo=z.infer<typeof competitorVideoSchema>;
export function competitorReference(video:CompetitorVideo,records:LabRecord[]){return records.find(r=>r.kind==='reference_video_draft'&&r.id===video.referenceId)??null;}
export function competitorContentLink(productId:string,video:CompetitorVideo,records:LabRecord[]){
 const project=records.filter(r=>r.kind==='production'&&r.data.productId===productId).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
 const p=new URLSearchParams({view:'production',stage:'scenes',...(project?{production:project.id}:{new_product:productId})});
 const reference=competitorReference(video,records);if(reference)p.set('reference',reference.id);
 return '?'+p;
}
