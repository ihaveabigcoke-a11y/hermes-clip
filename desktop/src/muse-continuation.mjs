import {z} from 'zod';
import {jobInput} from './contracts.mjs';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const continueInput = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/), requestId: id,
  profileId: z.string().optional(), threadUrl: z.string().optional(),
  description: z.string().trim().min(1, 'Nhập mô tả muốn Muse làm tiếp.').max(8000),
  mediaType: z.enum(['image', 'video']),
  references: jobInput.innerType().shape.references.max(4).default([]),
}).strict();

// A continuation gets its own scene so image/video switching never changes
// the old scene, its approved takes, body, hooks or export plan.
export async function prepareContinuationScene(manual, source, request, requestId) {
  const sceneId = 'continue_' + requestId;
  for (let attempt = 0; attempt < 6; attempt++) {
    const records = await manual.records();
    const project = records.find(row => row.id === source.request.projectId && row.kind === 'production');
    const product = records.find(row => row.id === source.request.productId && row.kind === 'product');
    if (!project || !product || product.data.archived || project.data.productId !== product.id
      || project.data.productRevision !== product.revision) throw Error('Sản phẩm hoặc dự án cần đồng bộ trước khi gửi tiếp.');
    const existing = project.data.scenes.find(scene => scene.id === sceneId);
    if (existing?.storyboardApproved && existing.mediaProvider === 'muse') {
      if (existing.prompt !== request.prompt || existing.mediaType !== request.mediaType) throw Error('Cảnh tiếp tục đã thay đổi. Chưa gửi Muse.');
      return {...request, sceneId, sceneRevision:existing.revision, productRevision:product.revision};
    }
    try {
      const action = !existing ? 'scene' : existing.mediaProvider !== 'muse' ? 'media_provider' : 'storyboard';
      await manual.request('/api/production', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
        id:project.id, revision:project.revision, commandId:sceneId + '_' + action, action,
        input:existing ? {sceneId,...(action==='media_provider'?{provider:'muse'}:{})} : {id:sceneId, name:request.name, role:'body', mediaType:request.mediaType,
          ratio:request.ratio, duration:request.duration, prompt:request.prompt, referenceIds:[]},
      })});
    } catch (error) { if (error.status !== 409 || attempt === 5) throw error; }
  }
  throw Error('Dự án đang thay đổi. Cảnh tiếp tục đã lưu; chưa gửi Muse.');
}
