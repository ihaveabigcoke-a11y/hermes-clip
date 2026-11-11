import {readFile,readdir,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=process.argv[2]?resolve(process.argv[2]):join(root,'outputs/Product-Lab-Local.zip');
await stat(join(root,'desktop/local-dist/ui/index.html'));
const files=[];
async function add(path){files.push({name:'Product-Lab-Local/'+relative(root,path).replaceAll('\\','/'),path});}
async function tree(path){for(const entry of await readdir(path,{withFileTypes:true})){if(entry.name.startsWith('.')||['node_modules','release','worker-data','profiles','outputs','diagnostics'].includes(entry.name))continue;const file=join(path,entry.name);if(entry.isDirectory())await tree(file);else if(entry.isFile())await add(file);}}
for(const folder of ['app','components','lib','desktop/src','desktop/local','desktop/ui','desktop/test','desktop/local-dist','docs','tests','drizzle','vendor','public/fonts'])await tree(join(root,folder));
for(const name of ['package.json','pnpm-lock.yaml','tsconfig.json','postcss.config.mjs','START-LOCAL.cmd','README-LOCAL-VI.md','desktop/package.json','desktop/package-lock.json','desktop/setup-local.mjs','desktop/SETUP-LOCAL.ps1','desktop/SETUP-INTEGRATIONS.ps1','desktop/integrations-lock.json','desktop/integrations-requirements.txt','scripts/build-local.mjs','scripts/package-local.mjs','public/favicon.svg'])await add(join(root,name));
// Generated helpers and local tests do not need Site identity or repository credentials.
for(const entry of files)if(/\/(?:\.env[^/]*|\.git|\.openai|profiles|worker-data|node_modules)(?:\/|$)/.test(entry.name))throw Error('Private/runtime path selected for distribution.');
await mkdir(dirname(target),{recursive:true});
const python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||(process.platform==='win32'?'python':'python3');
const packed=spawnSync(python,['-c',"import json,sys,zipfile; d=json.load(sys.stdin); z=zipfile.ZipFile(d['target'],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6); [z.write(f['path'],f['name']) for f in d['files']]; z.close()"],{input:JSON.stringify({target,files}),encoding:'utf8'});
if(packed.error||packed.status!==0)throw Error(packed.error?.message||packed.stderr||'Source ZIP packaging failed.');
console.log(JSON.stringify({file:target,files:files.length,bytes:(await stat(target)).size}));
