import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {cp} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

// Shared by the desktop distribution and its isolated font/HTTP tests.
export async function buildLocalUi(out){
  await build({configFile:false,root:join(root,'desktop/ui'),base:'/',publicDir:false,plugins:[react()],resolve:{alias:{'@':root}},css:{postcss:{plugins:[tailwind()]}},build:{outDir:join(out,'ui'),emptyOutDir:true}});
  await cp(join(root,'public/fonts'),join(out,'ui/fonts'),{recursive:true});
  await cp(join(root,'public/favicon.svg'),join(out,'ui/favicon.svg'));
}
