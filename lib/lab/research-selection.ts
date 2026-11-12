import {productFromCandidate, type Kind, type LabRecord} from './domain.ts';
import {researchProductId, type ResearchBatch} from './operations.ts';

/** Explicit desired state makes replaying a check idempotent (never a toggle). */
export function planResearchSelection(batchId: string, batch: ResearchBatch, candidateId: string, checked: boolean) {
  const candidate = batch.candidates.find(c => c.id === candidateId);
  if (!candidate) throw Error('Ứng viên không còn trong đợt. Tải lại dữ liệu.');
  const selected = batch.selectedIds.includes(candidateId);
  if (checked && !selected && batch.selectedIds.length >= 3) throw Error('Mỗi đợt chọn tối đa 3 sản phẩm.');
  const data = checked === selected ? batch : {...batch, selectedIds: checked ? [...batch.selectedIds, candidateId] : batch.selectedIds.filter(id => id !== candidateId)};
  return {data, candidate, productId: checked ? researchProductId(batchId, candidateId) : null};
}

type Persist = (kind: Kind, id: string, data: Record<string, any>, revision?: number, action?: string) => Promise<LabRecord>;
export function researchFailure(error: unknown) {
  const failure = error as {message?: string; fields?: Record<string, string>};
  const labels: Record<string, string> = {problem: 'Vấn đề / ý tưởng video', proofNotes: 'Ghi chú bằng chứng', name: 'Tên sản phẩm', researchOrigin: 'Nguồn ứng viên', supplierUrl: 'Link nguồn hàng', referenceUrl: 'Link bằng chứng', market: 'Thị trường', locale: 'Ngôn ngữ'};
  const fields = Object.entries(failure.fields ?? {}).map(([key, message]) => `${labels[key] ?? key} (${key}): ${message}`);
  return fields.length ? fields.join(' · ') : failure.message ?? 'Chưa hoàn tất thao tác. Tải lại để kiểm tra.';
}
export function researchSelection(record: LabRecord, records: LabRecord[]) {
  const batch = record.data as ResearchBatch;
  const selected = batch.candidates.filter(candidate => batch.selectedIds.includes(candidate.id));
  const ready = selected.flatMap(candidate => {
    const product = records.find(row => row.kind === 'product' && row.id === researchProductId(record.id, candidate.id));
    return product ? [product] : [];
  });
  return {selected, ready, missing: selected.filter(candidate => !ready.some(product => product.id === researchProductId(record.id, candidate.id)))};
}
/** Reconcile only saved selections. A failure on one row must not stop the rest. */
export async function completeResearchProfiles(record: LabRecord, records: LabRecord[], persist: Persist, candidateIds?: string[]) {
  const errors: Record<string, string> = {};
  for (const candidate of researchSelection(record, records).missing) {
    if (candidateIds && !candidateIds.includes(candidate.id)) continue;
    try { await saveResearchSelection(record, candidate.id, true, persist); }
    catch (error) { errors[candidate.id] = researchFailure(error); }
  }
  return errors;
}
export async function deployResearchProducts(products: LabRecord[], create: (envelope: {id: string; revision: number; commandId: string; action: string; input: Record<string, any>}) => Promise<{record: LabRecord; deduplicated?: boolean}>) {
  const projects: LabRecord[] = [], errors: string[] = [];
  let created = 0;
  for (const product of products) {
    const id = crypto.randomUUID().replaceAll('-', '');
    try {
      const result = await create({id, revision: 0, commandId: id, action: 'create', input: {
        name: `Video · ${product.data.name}`.slice(0, 150), productId: product.id,
        locale: product.data.locale || 'en-US', reuseProduct: true,
      }});
      projects.push(result.record);
      if (!result.deduplicated) created++;
    } catch (error) { errors.push(`${product.data.name}: ${researchFailure(error)}`); }
  }
  return {projects, created, errors};
}
export async function saveResearchSelection(record: LabRecord, candidateId: string, checked: boolean, persist: Persist) {
  const batch = record.data as ResearchBatch;
  const plan = planResearchSelection(record.id, batch, candidateId, checked);
  // API requires a saved selection before promote; CAS failure must stop here.
  const updated = plan.data === batch ? record : await persist('research_batch', record.id, plan.data, record.revision);
  if (plan.productId) {
    try {
      await persist('product', plan.productId, productFromCandidate(record.id, updated.data as ResearchBatch, plan.candidate), 0, 'promote');
    } catch (error) {
      // Never roll back/delete a possibly-created product after an uncertain reply.
      throw Error('Đã chọn; chưa xác nhận hồ sơ. ' + researchFailure(error));
    }
  }
  return updated;
}
