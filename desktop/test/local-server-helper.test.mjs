import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,stat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getTestBuild,importModule,outputs,removeTestBuild} from './helpers/local-server.mjs';

const execute=promisify(execFile);
const root=fileURLToPath(new URL('../../',import.meta.url));
const helper=new URL('./helpers/local-server.mjs',import.meta.url).href;
const probe=join(root,'desktop/test/fixtures/local-build-probe.mjs');
const build=await getTestBuild();
function childEnvironment(){
  const env={...process.env};
  // A nested node --test command needs its own runner, not the parent's IPC.
  delete env.NODE_TEST_CONTEXT;
  return env;
}

test('test workers reuse one build and one domain/JSON module graph from source',async()=>{
  assert.strictEqual(getTestBuild(),getTestBuild());
  assert.strictEqual(await getTestBuild(),build);
  assert.equal(dirname(build.buildRoot),resolve(outputs));
  const env={...process.env,HERMES_TEST_BUILD_DIR:build.buildRoot};
  const code=`import {getTestBuild} from ${JSON.stringify(helper)}; console.log((await getTestBuild()).buildRoot);`;
  const children=await Promise.all([execute(process.execPath,['--input-type=module','-e',code],{cwd:root,env}),execute(process.execPath,['--input-type=module','-e',code],{cwd:root,env})]);
  for(const child of children)assert.equal(child.stdout.trim(),build.buildRoot);
  assert.strictEqual(await importModule('lib/lab/operations.ts'),await import(build.moduleUrl('lib/lab/operations.ts')));
  const seed='lib/lab/viral-formulas.seed.json';
  assert.equal(await readFile(new URL(build.moduleUrl(seed)),'utf8'),await readFile(join(root,seed),'utf8'));
  const runner=await readFile(new URL(build.moduleUrl('desktop/src/research-runner.mjs')),'utf8');
  assert.doesNotMatch(runner,/local-dist/);
  assert.match(runner,/\.\.\/\.\.\/lib\/lab\/muse-workflows\.mjs/);
});

test('test build paths and runtime modes cannot silently fall back to a distribution',async()=>{
  assert.throws(()=>build.moduleUrl('../outside.ts'),/repository module/);
  await assert.rejects(removeTestBuild(root),/inside outputs/);
  for(const [directory,message] of [[root,/inside outputs/],[build.buildRoot,/runtime mismatch/]]){
    const env={...process.env,HERMES_TEST_BUILD_DIR:directory};
    const code=`import {getTestBuild} from ${JSON.stringify(helper)}; await getTestBuild('api');`;
    await assert.rejects(execute(process.execPath,['--input-type=module','-e',code],{cwd:root,env}),error=>{
      assert.equal(error.code,1);assert.match(error.stderr,message);return true;
    });
  }
  assert.ok((await stat(build.routesPath)).isFile());
});

test('direct node tests keep a lazy build through subsequent tests and clean it at process exit',async()=>{
  const env=childEnvironment();delete env.HERMES_TEST_BUILD_DIR;
  const {stdout}=await execute(process.execPath,['--test',probe],{cwd:root,env});
  const buildRoot=stdout.match(/BUILD_PROBE=([^\r\n]+)/)?.[1];
  assert.ok(buildRoot,stdout);
  assert.equal(dirname(buildRoot),resolve(outputs));
  await assert.rejects(stat(buildRoot),{code:'ENOENT'});
  assert.ok((await stat(build.routesPath)).isFile());
});

test('command runner cleans its shared build on success and on a failing test command',async()=>{
  for(const file of [probe,join(root,'desktop/test/fixtures/does-not-exist.mjs')]){
    let result;
    try{
      result=await execute(process.execPath,[join(root,'scripts/run-source-tests.mjs'),'api',file],{cwd:root,env:childEnvironment()});
      assert.equal(file,probe);
    }catch(error){
      if(file===probe)throw error;
      assert.equal(error.code,1);result=error;
    }
    const builds=[...result.stdout.matchAll(/Built one shared api test bundle: ([^\r\n]+)/g)];
    assert.equal(builds.length,1,result.stdout);
    const buildRoot=builds[0][1];
    if(file===probe)assert.match(result.stdout,new RegExp('BUILD_PROBE='+buildRoot.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    await assert.rejects(stat(buildRoot),{code:'ENOENT'});
  }
  assert.ok((await stat(build.routesPath)).isFile());
});
