// Shared store/renderer vocabulary. Running counts are jobs, including bundle
// members, never the number of browser runners still cleaning up.
export const runningJobStates = new Set(['preflight', 'prepared', 'submitting', 'submitted', 'waiting', 'downloading', 'validating', 'running']);
export const isRunningJob = job => runningJobStates.has(job.state);
export const isLostJob = job => job.state === 'needs_attention' && job.failureCode === 'WORKER_LOST';
export const runningJobCount = jobs => jobs.filter(isRunningJob).length;
export function jobHeartbeatTimeout(config) {
  const seconds = config?.timeoutSeconds;
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 900) * 1000;
}
