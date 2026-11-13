// Actual Electron + production main module, with missing build files in a QA tree.
// Capture the native dialog call so the check needs no human dismissal.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,copyFile,writeFile,readFile,symlink} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {OLD_BUILD_MESSAGE} from '../desktop/src/startup-guard.mjs';
const out=resolve('outputs/T-024b-startup');await mkdir(out,{recursive:true});
const root=await mkdtemp(join(out,'isolated-')),src=join(root,'src'),userData=join(root,'user-data');
await mkdir(src);await mkdir(userData);
for(const name of ['main.mjs','startup-guard.mjs'])await copyFile(resolve('desktop/src',name),join(src,name));
await symlink(resolve('desktop/node_modules'),join(root,'node_modules'),'junction');
await writeFile(join(root,'package.json'),JSON.stringify({name:'hermes-startup-check',type:'module',main:'src/main.mjs'}));
const hook=join(root,'capture.cjs');
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,dialog}=require('electron'),fs=require('fs'),path=require('path');
 const write=(name,value)=>fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,name),JSON.stringify(value));
 app.commandLine.appendSwitch('disable-background-networking');
 app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND');
 dialog.showMessageBox=async options=>{write('dialog.json',options);return {response:0};};
 dialog.showErrorBox=(title,message)=>{write('raw-error.json',{title,message});app.quit();};
 setTimeout(()=>{write('timeout.json',{failed:true});app.exit(1);},20000).unref();
});`);
const fd=openSync(join(out,'electron.log'),'w');
let code;try{code=await new Promise((done,reject)=>{
 const child=spawn(resolve('desktop/node_modules/electron/dist/electron.exe'),[root],{windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:userData,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),HERMES_INSTAGRAM_API_ENABLED:'0'}});
 child.on('error',reject);child.on('exit',done);
});}finally{closeSync(fd);}
assert.equal(code,0,'Electron must quit normally after the old-build dialog');
const dialog=JSON.parse(await readFile(join(userData,'dialog.json'),'utf8'));
assert.equal(dialog.message,OLD_BUILD_MESSAGE);assert.equal(dialog.title,'Hermes Clip');
assert.equal(await readFile(join(userData,'raw-error.json'),'utf8').catch(()=>null),null);
assert.equal(await readFile(join(userData,'timeout.json'),'utf8').catch(()=>null),null);
const log=await readFile(join(out,'electron.log'),'utf8');assert.doesNotMatch(log,/ERR_MODULE_NOT_FOUND|Uncaught Exception|startup failed/);
const result={passed:true,actualElectron:true,productionMain:true,installedData:false,missingBuild:true,dialogCaptured:true,message:dialog.message,exit:code};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
