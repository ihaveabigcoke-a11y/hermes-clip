import {AsyncLocalStorage} from 'node:async_hooks';
const admitted = new AsyncLocalStorage();

// Fail closed for existing installations as well as fresh settings.
export const museIsPaused = store => store.get('muse_paused', true) !== false;
export function assertMuseAvailable(store, {jobId, profileId} = {}) {
  const task = admitted.getStore();
  if (!(task?.active && task.store === store && (jobId || profileId)
    && (!jobId || task.jobId === jobId) && (!profileId || task.profileId === profileId))) assertMuseNewTask(store);
}
// A task admitted before pause owns its continuation, including download/import.
// New public task entries always check the persisted switch independently.
export async function runMuseTask(store, {jobId, profileId}, work) {
  assertMuseNewTask(store);
  if (!jobId || !profileId) throw Error('Muse task requires job and profile identity.');
  const task = {store, jobId, profileId, active: true};
  try { return await admitted.run(task, work); }
  finally { task.active = false; }
}
export function assertMuseNewTask(store) {
  if (museIsPaused(store)) throw Object.assign(Error('Muse đang tạm dừng, bật lại ở Tài khoản Muse'), {code:'MUSE_PAUSED'});
}
