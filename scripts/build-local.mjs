import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {mkdir,cp,rm,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLocalServer} from './build-local-server.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=join(root,'desktop/local-dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await build({configFile:false,root:join(root,'desktop/ui'),base:'/',publicDir:false,plugins:[react()],resolve:{alias:{'@':root}},css:{postcss:{plugins:[tailwind()]}},build:{outDir:join(out,'ui'),emptyOutDir:true}});
await cp(join(root,'public/fonts'),join(out,'ui/fonts'),{recursive:true});await cp(join(root,'public/favicon.svg'),join(out,'ui/favicon.svg'));
const {moduleCount}=await buildLocalServer(out);
const seed=join(root,'desktop/local/seed.json');try{await stat(seed);await cp(seed,join(out,'seed.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Built local UI and '+moduleCount+' canonical API modules. No hosted service or ChatGPT sign-in is needed.');
