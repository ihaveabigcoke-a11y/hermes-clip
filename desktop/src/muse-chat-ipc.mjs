import {z} from 'zod';
import {chatInput} from './muse-chat.mjs';
import {referenceChatAttachments} from './muse-chat-attachments.mjs';

// Renderer supplies a job ID, never a path, byte buffer or reference object.
const ipcInput = chatInput.extend({referenceJobId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional()}).strict();
export async function sendMuseChat(chat, integrations, payload) {
  const {referenceJobId, ...value} = ipcInput.parse(payload);
  if (!referenceJobId) return chat.send(value);
  if (value.parentId) throw Error('Chỉ đính kèm ảnh khi bắt đầu hội thoại mới.');
  const attachments = await referenceChatAttachments(integrations, referenceJobId, value.projectId);
  return chat.send({...value, attachments});
}
