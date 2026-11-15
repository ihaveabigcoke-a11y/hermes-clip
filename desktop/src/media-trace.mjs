import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';

// Opt-in local diagnostics. Never include paths, commands, URLs or media bytes.
const context = new AsyncLocalStorage();
export const withMediaTrace = (sink, scope, fn) => context.run({sink, scope}, fn);
export function mediaTrace(stage, startedAt, extra = {}) {
  const trace = context.getStore();
  if (trace) try { trace.sink({scope:trace.scope,stage,startedAt,finishedAt:performance.now(),...extra}); } catch { /* Diagnostics cannot break media work. */ }
}
export async function traceMedia(stage, fn) {
  const startedAt = performance.now();
  try { const value = await fn(); mediaTrace(stage, startedAt, {ok:true}); return value; }
  catch (error) { mediaTrace(stage, startedAt, {ok:false}); throw error; }
}
