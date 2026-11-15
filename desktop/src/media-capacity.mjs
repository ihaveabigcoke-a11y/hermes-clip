import {availableParallelism} from 'node:os';

// Each encoder uses two threads. Leave capacity for the UI and provider pages.
export const mediaConcurrency = (cores = availableParallelism()) => Math.max(1, Math.min(3, Math.floor(cores / 2)));
export class MediaSlots {
  constructor(limit = mediaConcurrency()) { this.limit = limit; this.active = 0; this.queue = []; }
  async run(fn) {
    if (this.active >= this.limit) await new Promise(resolve => this.queue.push(resolve));
    else this.active++;
    try { return await fn(); }
    finally { const next = this.queue.shift(); if (next) next(); else this.active--; }
  }
}
export const mediaSlots = new MediaSlots();
