/** Display-only: never rewrite the receipt, and redact before truncating. */
export function safeQueueText(value, limit = 180) {
  const text = String(value ?? '')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[URL]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;"']+/gi, '[đã ẩn]')
    .replace(/\b(?:set-cookie|cookie|authorization)\s*[:=][^\r\n]*/gi, '[đã ẩn]')
    .replace(/(["']?(?:[\w-]*(?:token|secret|password|signature|credential)|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[đã ẩn]')
    .replace(/\b[A-Za-z0-9_+\/.=-]{32,}\b/g, '[đã ẩn]')
    .replace(/[\s\u0000-\u001f]+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
}

export function queueFailureSummary(job) {
  if (!job.importError && !['failed', 'needs_attention', 'unknown', 'cancelled'].includes(job.state)) return '';
  const reason = job.importError || job.failureDetail || [...(job.history ?? [])].reverse().find(h => h.state === job.state)?.note;
  return safeQueueText(reason) || 'Chưa có lý do được ghi lại.';
}
