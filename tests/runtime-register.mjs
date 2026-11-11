// Isolated server test environment. Not imported by application/build code.
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
const runtime=new URL('./runtime-fixture.mjs',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
  if(['cloudflare:workers','next/headers','next/navigation'].includes(specifier))return {url:runtime,shortCircuit:true};
  if(specifier.startsWith('@/')){const p=root+specifier.slice(2);return {url:pathToFileURL(existsSync(p)?p:p+'.ts').href,shortCircuit:true};}
  if(specifier.startsWith('.')&&context.parentURL?.endsWith('.ts')&&!/\.[a-z]+$/.test(specifier))return {url:new URL(specifier+'.ts',context.parentURL).href,shortCircuit:true};
  return next(specifier,context);
},load(url,context,next){if(url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);}});
