import {workerStateLabels} from '../../desktop/src/ui-copy.mjs';
import type {DesktopJob} from './desktop-client';
import {sceneKey} from './media-organization.ts';

export const queueFilters = [
  {id: 'pending', label: 'Cần xử lý'},
  {id: 'active', label: 'Đang chạy'},
  {id: 'queued', label: workerStateLabels.queued},
  {id: 'attention', label: 'Cần kiểm tra'},
  {id: 'failed', label: workerStateLabels.failed},
  {id: 'history', label: 'Lịch sử'},
] as const;
export type QueueFilter = typeof queueFilters[number]['id'];
const activeStates = new Set(['preflight', 'prepared', 'submitting', 'submitted', 'waiting', 'downloading', 'validating']);

export function matchesQueueFilter(job: DesktopJob, filter: QueueFilter, resolvedFailures: ReadonlySet<string> = new Set()) {
  const historical = job.state === 'cancelled' || (job.state === 'ready' && !job.importError) || resolvedFailures.has(job.id);
  if (filter === 'pending') return !historical;
  if (filter === 'history') return historical;
  if (filter === 'active') return activeStates.has(job.state);
  if (filter === 'attention') return job.state === 'needs_attention' || !!job.importError;
  return job.state === filter && !resolvedFailures.has(job.id);
}

export function resolvedQueueFailures(jobs: DesktopJob[]) {
  const resolved = new Set<string>();
  for (const group of groupQueueJobs(jobs)) {
    const completed = group.jobs.filter(job => job.state === 'ready' && job.importedAt && job.uploadedAssetId && !job.importError);
    for (const job of group.jobs) {
      if (job.state === 'failed' && completed.some(result => result.createdAt > job.createdAt
        && result.request.mediaType === job.request.mediaType
        && result.request.sceneRevision >= job.request.sceneRevision
        && result.request.productRevision >= job.request.productRevision)) resolved.add(job.id);
    }
  }
  return resolved;
}

export function queueTone(job: DesktopJob) {
  if (job.importError || job.state === 'failed') return 'danger';
  if (job.state === 'needs_attention') return 'warning';
  if (job.state === 'ready') return 'success';
  return 'neutral';
}

export function queueAction(job: DesktopJob) {
  if (job.state === 'queued') return 'start';
  if (job.state === 'failed' || job.state === 'cancelled') return 'retry';
  if (job.state === 'needs_attention') {
    if (job.providerId) return 'resume';
    return job.providerResponse && job.providerUrl ? 'recheckResult' : 'reconcile';
  }
  if (job.state === 'ready') return 'result';
  return 'details';
}

export function groupQueueJobs(jobs: DesktopJob[]) {
  const groups = new Map<string, {key: string; jobs: DesktopJob[]; latest: DesktopJob}>();
  for (const job of [...jobs].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))) {
    const key = sceneKey(job.request.projectId, job.request.sceneId);
    const group = groups.get(key);
    if (group) group.jobs.push(job);
    else groups.set(key, {key, jobs: [job], latest: job});
  }
  return [...groups.values()];
}
