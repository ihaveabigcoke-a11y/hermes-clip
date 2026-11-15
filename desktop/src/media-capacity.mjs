import {availableParallelism} from 'node:os';
import {performance} from 'node:perf_hooks';
import {mediaTrace,traceMedia} from './media-trace.mjs';

// Encoders use two or three threads. Leave capacity for UI/provider pages.
export const mediaConcurrency = (cores = availableParallelism()) => Math.max(1, Math.min(3, Math.floor(cores / 2)));
export class MediaSlots {
  constructor(limit = mediaConcurrency()) { this.limit = limit; this.active = 0; this.queue = []; }
  async run(fn, stage = 'media') {
    const requestedAt = performance.now();
    if (this.active >= this.limit) await new Promise(resolve => this.queue.push(resolve));
    else this.active++;
    mediaTrace('slot_wait', requestedAt, {operation:stage});
    try { return await traceMedia(stage, fn); }
    finally { const next = this.queue.shift(); if (next) next(); else this.active--; }
  }
}
export const mediaSlots = new MediaSlots();
// A probe or full decode cannot hold an encoder's slot. Keep both auxiliary
// pools bounded too, so many imports cannot flood the CPU during three renders.
export const composeSlots = new MediaSlots();
export const probeSlots = new MediaSlots(2);
export const validationSlots = new MediaSlots();
