import {safeQueueText} from './queue-error.mjs';

// Receipt data only. Admission, profile stops and retries remain with the worker.
export function museVideoLimitReceipt(error, now = Date.now()) {
  const original = [error?.providerResponse, error?.message].find(value =>
    typeof value === 'string' && /(?:24\s*(?:h(?:ours?)?\b|giờ)|past\s+day)/i.test(value)
      && /(?:limit|quota|too many|giới hạn|hạn mức)/i.test(value));
  if (!original) return {};
  const errorMessage = safeQueueText(original, 240);
  return {errorMessage, failedAt: now, failureDetail: errorMessage,
    ...(error.providerResponse ? {providerResponse: errorMessage} : {})};
}
