import {mkdir,cp,rm,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLocalServer} from './build-local-server.mjs';
import {buildLocalUi} from './build-local-ui.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Night/CI checks can build source without replacing the installed/local UI.
const out=process.env.HERMES_LOCAL_BUILD_DIR ? resolve(process.env.HERMES_LOCAL_BUILD_DIR) : join(root,'desktop/local-dist');
if(out!==join(root,'desktop/local-dist') && !out.startsWith(join(root,'outputs') + (process.platform==='win32'?'\\':'/')))throw Error('Build override must be inside repository outputs/.');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await buildLocalUi(out);
const {moduleCount}=await buildLocalServer(out);
const seed=join(root,'desktop/local/seed.json');try{await stat(seed);await cp(seed,join(out,'seed.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Built local UI and '+moduleCount+' canonical API modules. No hosted service or ChatGPT sign-in is needed.');
