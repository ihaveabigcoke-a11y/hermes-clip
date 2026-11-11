import type {LabRecord} from './domain';
import {productionSchema, takeGate, type Scene, type Take, type Production} from './production.ts';
import {sceneKey, type MediaOrganization} from './media-organization.ts';

export type MediaEntry = {key: string; project: LabRecord; product?: LabRecord; production: Production; scene: Scene; take: Take};

export function mediaCatalog(records: LabRecord[]): MediaEntry[] {
  return records.filter(record => record.kind === 'production').flatMap(project => {
    const parsed = productionSchema.safeParse(project.data);
    if (!parsed.success) return [];
    const production = parsed.data;
    const product = records.find(record => record.kind === 'product' && record.id === production.productId);
    return production.scenes.flatMap(scene => scene.takes.map(take => ({
      key: `${project.id}:${scene.id}:${take.id}`, project, product, production, scene, take,
    })));
  }).sort((a, b) => b.take.createdAt - a.take.createdAt);
}

export function mediaReview(entry: MediaEntry) {
  if (entry.take.review === 'approved' && (takeGate(entry.production, entry.scene, entry.take)
    || entry.product && entry.product.revision !== entry.production.productRevision)) return 'stale';
  return entry.take.review;
}

export function mediaInstructions(entry: Pick<MediaEntry, 'production' | 'scene' | 'take'>) {
  const attempt = entry.scene.attempts?.find(attempt => attempt.id === entry.take.attemptId);
  const snapshot = [entry.take.snapshot, attempt?.snapshot].map(value => value ? structuredMuseResponse(value) : null)
    .find(value => typeof value?.prompt === 'string');
  const source = snapshot ?? entry.scene;
  const prompt = [source.prompt, source.action, source.camera, source.voice].filter(value => typeof value === 'string' && value).join('\n');
  const pins = Array.isArray(source.references) ? source.references : [];
  const references = pins.flatMap(pin => {
    if (!pin || typeof pin !== 'object') return [];
    const original = entry.production.references.find(ref => ref.id === pin.id && ref.version === pin.version);
    const assetId = pin.assetId ?? original?.assetId;
    return typeof assetId === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(assetId)
      ? [{assetId, name: original?.name ?? 'Ảnh tham chiếu đã gửi'}] : [];
  });
  return {prompt, references, fromSnapshot: !!snapshot};
}

export function preferredMedia(entries: MediaEntry[], organization: MediaOrganization) {
  const groups = new Map<string, MediaEntry[]>();
  for (const entry of entries) {
    const key = sceneKey(entry.project.id, entry.scene.id);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].map(([key, versions]) => {
    const newest = [...versions].sort((a, b) => b.take.createdAt - a.take.createdAt);
    const selectedId = organization[key]?.preferredTakeId;
    return newest.find(entry => entry.take.id === selectedId)
      ?? newest.find(entry => mediaReview(entry) === 'approved')
      ?? newest.find(entry => entry.take.sceneRevision === entry.scene.revision && entry.take.review === 'pending')
      ?? newest[0];
  }).sort((a, b) => b.take.createdAt - a.take.createdAt);
}

export function structuredMuseResponse(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

export function museConversationTitle(chat: {prompt: string; response: string}) {
  const data = structuredMuseResponse(chat.response);
  if (Array.isArray(data?.items)) return `Kịch bản · ${data.items.length} sản phẩm`;
  if (Array.isArray(data?.candidates)) return `Nghiên cứu · ${data.candidates.length} sản phẩm`;
  if (typeof data?.name === 'string') return data.name;
  if (typeof data?.headline === 'string') return data.headline;
  return chat.prompt.split('\n')[0].slice(0, 90);
}

export function mediaCaption(entry: MediaEntry, records: LabRecord[], chats: {response: string; state: string}[]) {
  const plan = records.find(record => record.kind === 'content_plan' &&
    (record.id === entry.production.contentPlanId || record.data.productionId === entry.project.id));
  if (plan?.data.caption) return {text: String(plan.data.caption), source: 'Bản nháp nội dung'};
  for (const chat of [...chats].reverse()) {
    if (chat.state !== 'done') continue;
    const data = structuredMuseResponse(chat.response);
    if (!Array.isArray(data?.items)) continue;
    const item = data.items.find(value => value?.productId === entry.production.productId && typeof value.caption === 'string');
    if (item) return {text: item.caption as string, source: 'Muse · bản nháp theo sản phẩm'};
  }
  return null;
}
