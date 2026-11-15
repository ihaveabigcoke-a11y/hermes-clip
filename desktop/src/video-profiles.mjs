/** Read the worker's actual readiness and dispatch stop; never change switches. */
export function videoProfiles(profiles) {
  return profiles.filter(p => p.enabled && !p.busy && p.health === 'ready' && p.quota?.state === 'available'
    && !p.dispatch?.stopped)
    .sort((a,b) => Number(!!b.open) - Number(!!a.open));
}
