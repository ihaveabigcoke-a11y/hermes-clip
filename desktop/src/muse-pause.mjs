// Fail closed for existing installations as well as fresh settings.
export const museIsPaused = store => store.get('muse_paused', true) !== false;
export function assertMuseAvailable(store) {
  if (museIsPaused(store)) throw Object.assign(Error('Muse đang tạm dừng'), {code:'MUSE_PAUSED'});
}
