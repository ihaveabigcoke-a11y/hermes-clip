import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_icy_zodiak.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
export const context=new AsyncLocalStorage();
export const headers=async()=>context.getStore()?.headers??new Headers();
export const redirect=()=>{throw new Error('redirect not expected in server tests');};
const files=new Map();
export const env = {
  DB: {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        bind(...params) {
          return {
            async first() { return stmt.get(...params) ?? null; },
            async all() { return { results: stmt.all(...params) }; },
            async run() { const r = stmt.run(...params); return { meta: { changes: Number(r.changes) } }; }
          };
        }
      };
    }
  },
  BUCKET: {
    async put(key, bytes, options) { files.set(key, { bytes: new Uint8Array(bytes), options }); },
    async delete(key) { files.delete(key); },
    async get(key, options) {
      const f = files.get(key);
      if (!f) return null;
      const { offset = 0, length = f.bytes.length } = options?.range ?? {};
      return { body: f.bytes.slice(offset, offset + length) };
    }
  }
};
export function call(handler,request,params){return context.run(request,()=>handler(request,params));}
