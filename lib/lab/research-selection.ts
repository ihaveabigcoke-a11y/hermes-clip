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
      throw Error('Đã chọn; chưa xác nhận hồ sơ. Tải lại rồi bấm Hoàn tất chọn để đối soát cùng hồ sơ. ' + (error as Error).message);
    }
  }
  return updated;
}
