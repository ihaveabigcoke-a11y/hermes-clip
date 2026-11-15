// Pure helpers for the production form counter, inline checks and library chip counts.
export function promptCounter(text: string, multiline = false) {
  const chars = text.length;
  const prompts = multiline ? text.split(/\r?\n/).filter(line => line.trim()).length : (text.trim() ? 1 : 0);
  return {prompts, chars, label: multiline ? `${prompts} prompt · ${chars.toLocaleString('vi-VN')} ký tự` : `${chars.toLocaleString('vi-VN')} ký tự`};
}

export type FormIssue = {field: 'prompt' | 'referenceIds'; message: string};
type Ref = {id: string; role: string};

export function sceneFormIssues(input: {prompt: string; mode: string; mediaType: 'video' | 'image'; referenceIds: readonly string[]; refs: readonly Ref[]}): FormIssue[] {
  const issues: FormIssue[] = [];
  if (!input.prompt.trim()) issues.push({field: 'prompt', message: 'Nhập prompt để lưu cảnh nháp.'});
  const chosen = input.refs.filter(ref => input.referenceIds.includes(ref.id));
  const count = (role: string) => chosen.filter(ref => ref.role === role).length;
  if (input.mediaType === 'video' && input.mode === 'frames' && (count('first_frame') !== 1 || count('last_frame') !== 1))
    issues.push({field: 'referenceIds', message: 'Chọn đúng một tham chiếu vai trò Ảnh đầu và một Ảnh cuối.'});
  if (input.mode === 'model' && (count('person') < 1 || count('product') < 1))
    issues.push({field: 'referenceIds', message: 'Chọn tham chiếu Người mẫu và Sản phẩm.'});
  return issues;
}

export function mediaTypeCounts(entries: readonly {take: {type: string}}[]) {
  return {
    all: entries.length,
    image: entries.filter(entry => entry.take.type.startsWith('image/')).length,
    video: entries.filter(entry => entry.take.type.startsWith('video/')).length,
  };
}
