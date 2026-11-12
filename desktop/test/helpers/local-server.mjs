import {mkdir,mkdtemp,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildLocalServer} from '../../../scripts/build-local-server.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
export const outputs=join(root,'outputs');
const builds=new Map();
const desktopEntries=[
  'desktop/src/research-runner.mjs',
  'components/lab/research-sources.tsx','components/lab/research-candidates.tsx',
  'components/lab/research-launcher.tsx','components/lab/viral-formulas.tsx',
  'components/lab/production-intelligence.tsx','components/lab/reference-video.tsx',
];

function checkMode(mode){
  if(!['desktop','api'].includes(mode))throw Error('Unknown test build mode: '+mode);
}
function checkRoot(buildRoot){
  const path=resolve(buildRoot);
  if(dirname(path)!==resolve(outputs)||!path.startsWith(join(outputs,'local-api-test-')))throw Error('Test build must be a temporary directory inside outputs/.');
  return path;
}
export async function removeTestBuild(buildRoot){
  await rm(checkRoot(buildRoot),{recursive:true,force:true});
}
function describeBuild(buildRoot,mode){
  return {
    buildRoot,mode,routesPath:join(buildRoot,'server/routes.mjs'),
    moduleUrl(source){
      const path=relative(root,resolve(root,source));
      if(path.startsWith('..')||isAbsolute(path)||! /\.(?:tsx?|mjs|json)$/.test(path))throw Error('Expected a repository module path.');
      return pathToFileURL(join(buildRoot,'server',path.replace(/\.tsx?$/,'.mjs'))).href;
    },
  };
}

// The command runner owns this build until all node:test children have exited.
// Direct `node --test file` calls instead cache one build in that test process.
export async function prepareTestBuild(mode='desktop'){
  checkMode(mode);
  await mkdir(outputs,{recursive:true});
  const buildRoot=checkRoot(await mkdtemp(join(outputs,'local-api-test-')));
  try{
    const {moduleCount}=await buildLocalServer(buildRoot,{
      ...(mode==='api'?{runtime:join(root,'tests/runtime-fixture.mjs')}:{}),
      entries:mode==='desktop'?desktopEntries:['lib/lab/research-selection.ts'],
    });
    if(mode==='desktop'){
      const {buildLocalUi}=await import('../../../scripts/build-local-ui.mjs');
      await buildLocalUi(buildRoot);
      try{await cp(join(root,'desktop/local/seed.json'),join(buildRoot,'seed.json'));}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    await writeFile(join(buildRoot,'test-build.json'),JSON.stringify({mode,moduleCount}));
    return describeBuild(buildRoot,mode);
  }catch(error){await removeTestBuild(buildRoot);throw error;}
}

export function getTestBuild(mode='desktop'){
  checkMode(mode);
  if(!builds.has(mode))builds.set(mode,(async()=>{
    if(process.env.HERMES_TEST_BUILD_DIR){
      const buildRoot=checkRoot(process.env.HERMES_TEST_BUILD_DIR);
      const manifest=JSON.parse(await readFile(join(buildRoot,'test-build.json'),'utf8'));
      if(manifest.mode!==mode)throw Error('Test build runtime mismatch.');
      return describeBuild(buildRoot,mode);
    }
    const build=await prepareTestBuild(mode);
    // A lazy first use inside a test must not remove files after that test;
    // later tests in the same process still need this cached build.
    process.once('exit',()=>rmSync(checkRoot(build.buildRoot),{recursive:true,force:true}));
    return build;
  })());
  return builds.get(mode);
}

export async function importModule(source,mode='desktop'){
  return import((await getTestBuild(mode)).moduleUrl(source));
}
export const importApiModule=source=>importModule(source,'api');

export async function localUiFile(path){
  const {buildRoot}=await getTestBuild();
  return join(buildRoot,'ui',path);
}
export {sessionCookie} from '../../local/server.mjs';
export async function startLocalServer(options){
  const {buildRoot,routesPath}=await getTestBuild();
  const {startLocalServer:start}=await import('../../local/server.mjs');
  return start({uiDir:join(buildRoot,'ui'),seedPath:join(buildRoot,'seed.json'),...options,routesPath});
}
