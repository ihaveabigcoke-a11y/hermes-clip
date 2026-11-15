// Shared by the queue and the store. A failed label alone is not a delivery receipt.
export function retryBlockedReason(job) {
  if (job.failureCode === 'WORKER_LOST' && job.reconciled !== true) return 'Tác vụ mất dấu chưa đối soát. Kiểm tra kết quả cũ trước khi tạo lại.';
  if (job.reconciliation === 'skipped') return 'Đã bỏ qua đối soát; không gửi lại lượt này.';
  if (!['failed', 'cancelled'].includes(job.state)) return 'Chỉ tạo lại việc lỗi hoặc đã dừng. Lượt chưa rõ kết quả phải đối soát trước.';
  const sent = job.providerId || job.providerUrl || job.providerResponse || job.submitBatchId || job.submittedViaParent
    || job.failureCode === 'MUSE_DELIVERY_UNCONFIRMED'
    || job.history?.some(entry => ['submitting', 'submitted', 'waiting', 'downloading', 'validating', 'needs_attention'].includes(entry.state));
  if (sent && job.reconciled !== true) return 'Lượt cũ chưa đối soát. Kiểm tra kết quả Muse trước khi tạo lại.';
  return '';
}

export function retryProfileAllowed(job, profile) {
  return !(job.retryOf && job.request.mediaType === 'video' && profile.name?.trim().toLocaleLowerCase('vi') === 'chi');
}
