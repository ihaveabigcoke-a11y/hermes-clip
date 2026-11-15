import {z} from 'zod';
import {museVideoBody} from '../../desktop/src/muse-video-prompt.mjs';

// Optional on old records: reading a project never enables a new workflow.
export const longVideoSettingsSchema=z.object({
  enabled:z.boolean().default(false),
  mode:z.enum(['manual','project']).default('manual'),
  prompts:z.array(z.string().max(7000)).max(5).default(['','']),
  sceneIds:z.array(z.string().regex(/^[\w-]{1,120}$/)).max(5).default([]),
});
export const longVideoDefaults=()=>longVideoSettingsSchema.parse({});
export function longVideoScenes(project:any){
  const settings=longVideoSettingsSchema.parse(project.longVideo??{});
  if(!settings.enabled)throw Error('Video dài đang tắt. Bật trong cài đặt dự án trước.');
  const scenes=settings.mode==='manual'
    ?settings.prompts.map((prompt,index)=>({name:`Cảnh ${index+1}`,prompt:museVideoBody(prompt).trim(),duration:8,ratio:'9:16',references:[]}))
    :settings.sceneIds.map(id=>{
      const scene=project.scenes.find((s:any)=>s.id===id);
      if(!scene?.storyboardApproved||scene.mediaType!=='video')throw Error('Chọn cảnh video đã duyệt trong dự án.');
      if(scene.mediaProvider==='manual')throw Error('Cảnh đã chọn nhập tay. Chọn Muse trước khi dùng cho Video dài.');
      return {...scene,prompt:museVideoBody(scene.prompt).trim()};
    });
  if(scenes.length<2||scenes.length>5)throw Error('Video dài cần từ 2 đến 5 cảnh.');
  if(settings.mode==='project'&&new Set(settings.sceneIds).size!==settings.sceneIds.length)throw Error('Mỗi cảnh chỉ được chọn một lần.');
  if(scenes.some((s:any)=>!s.prompt||s.duration<8||s.duration>10||s.ratio!=='9:16'))throw Error('Mỗi cảnh cần mô tả, video dọc và thời lượng 8–10 giây.');
  return scenes;
}
