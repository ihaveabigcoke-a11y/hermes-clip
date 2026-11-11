import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import ts from 'typescript';
import {readFile,writeFile,mkdir,cp,rm,stat} from 'node:fs/promises';
import {resolve,dirname,relative,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=join(root,'desktop/local-dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await build({configFile:false,root:join(root,'desktop/ui'),base:'/',publicDir:false,plugins:[react()],resolve:{alias:{'@':root}},css:{postcss:{plugins:[tailwind()]}},build:{outDir:join(out,'ui'),emptyOutDir:true}});
await cp(join(root,'public/fonts'),join(out,'ui/fonts'),{recursive:true});await cp(join(root,'public/favicon.svg'),join(out,'ui/favicon.svg'));
const runtime=join(root,'desktop/local/runtime.mjs'),compiled=new Set();
function destination(source){return join(out,'server',relative(root,source).replace(/\.ts$/,'.mjs'));}
async function compile(source){
  source=resolve(source);if(compiled.has(source))return;compiled.add(source);
  const output=destination(source),text=await readFile(source,'utf8'),dependencies=[];
  let code=ts.transpileModule(text,{fileName:source,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  code=code.replace(/(from\s+|import\s*(?:\(\s*)?)(['"])([^'"]+)\2/g,(all,prefix,quote,specifier)=>{
    let target;
    if(['cloudflare:workers','next/headers','next/navigation'].includes(specifier))target=runtime;
    else if(specifier.startsWith('@/'))target=join(root,specifier.slice(2));
    else if(specifier.startsWith('.'))target=resolve(dirname(source),specifier);
    else return all;
    if(target!==runtime){if(!extname(target))target+='.ts';if(!target.endsWith('.ts'))throw Error('Unsupported local server import: '+specifier);dependencies.push(target);target=destination(target);}
    let path=relative(dirname(output),target).replaceAll('\\','/');if(!path.startsWith('.'))path='./'+path;
    return prefix+quote+path+quote;
  });
  await mkdir(dirname(output),{recursive:true});await writeFile(output,code);
  for(const dependency of dependencies)await compile(dependency);
}
const paths=['lab','production','assets','assets/[id]','briefs','jobs','assistant','codex'];
await compile(join(root,'lib/lab/muse-workflows.ts'));
const imports=[];
for(const [index,path] of paths.entries()){const source=join(root,'app/api',path,'route.ts');await compile(source);imports.push(`import * as r${index} from './app/api/${path}/route.mjs';`);}
await writeFile(join(out,'server/routes.mjs'),imports.join('\n')+'\nexport const routes={'+paths.map((path,index)=>JSON.stringify('/api/'+path.replace('[id]',':id'))+':r'+index).join(',')+'};\n');
const seed=join(root,'desktop/local/seed.json');try{await stat(seed);await cp(seed,join(out,'seed.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Built local UI and '+compiled.size+' canonical API modules. No hosted service or ChatGPT sign-in is needed.');
