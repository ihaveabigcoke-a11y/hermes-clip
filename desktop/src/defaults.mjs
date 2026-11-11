// User-selected service. This prepares login only; no generation flow is enabled.
export const MUSE_START_URL = 'https://muse.ai/';

export function initializeMuseConnection(worker) {
  if (!worker.connection()) worker.saveMuseConnection({startUrl: MUSE_START_URL});
}
