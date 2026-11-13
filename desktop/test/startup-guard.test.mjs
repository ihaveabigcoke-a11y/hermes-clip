import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {guardDesktopStartup,missingBuildModules,OLD_BUILD_MESSAGE} from '../src/startup-guard.mjs';
test('T-024b missing direct/transitive module shows Vietnamese dialog before launch; valid build launches',async()=>{
 const parent=resolve('outputs');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'startup-guard-'));
 try{
  await mkdir(join(root,'src'));await mkdir(join(root,'local-dist/server'),{recursive:true});await mkdir(join(root,'local-dist/ui'),{recursive:true});
  await writeFile(join(root,'src/main.mjs'),"const domain=await import('../local-dist/server/domain.mjs');");await writeFile(join(root,'local-dist/server/routes.mjs'),'');await writeFile(join(root,'local-dist/ui/index.html'),'fixture');
  let launches=0,quits=0,messages=[];const invoke=()=>guardDesktopStartup({desktopRoot:root,launch:async()=>launches++,quit:()=>quits++,showMessage:async message=>messages.push(message)});
  assert.equal(await invoke(),false);assert.equal(launches,0);assert.equal(quits,1);assert.deepEqual(messages,[OLD_BUILD_MESSAGE]);assert.equal(OLD_BUILD_MESSAGE,'Bản build cũ hơn code. Chạy pnpm local:build');
  await writeFile(join(root,'local-dist/server/domain.mjs'),"export {x} from './nested.mjs';");assert.match((await missingBuildModules(root))[0],/nested\.mjs$/);await writeFile(join(root,'local-dist/server/nested.mjs'),'export const x=1;');
  assert.equal(await invoke(),true);assert.equal(launches,1);assert.equal(messages.length,1);
 }finally{assert.equal(resolve(root).startsWith(parent+ (process.platform==='win32'?'\\':'/')),true);await rm(root,{recursive:true,force:true});}
});
