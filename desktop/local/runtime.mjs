import {AsyncLocalStorage} from 'node:async_hooks';

// This module is used only by the separately compiled local distribution.
// Hosted builds continue importing Cloudflare and ChatGPT authentication.
export const localContext = new AsyncLocalStorage();
export const env = new Proxy({}, {get(_target, name) { return localContext.getStore()?.env[name]; }});
export async function headers() {
  if (!localContext.getStore()?.authenticated) return new Headers();
  return new Headers({'oai-authenticated-user-id':'local-owner','oai-authenticated-user-email':'local@device.invalid'});
}
export function redirect() { throw new Error('The local edition does not use ChatGPT sign-in.'); }
