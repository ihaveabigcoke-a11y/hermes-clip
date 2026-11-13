// Execute existing offline UI checks sequentially against one source build.
import {readdir,mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {openSync,closeSync} from 'node:fs';
import {prepareTestBuild,removeTestBuild} from '../desktop/test/helpers/local-server.mjs';
const out=resolve('outputs/T-024b-all-ui');await mkdir(out,{recursive:true});
const build=await prepareTestBuild(),results=[];
const requested=process.argv.slice(2);
const scripts=(await readdir('scripts')).filter(f=>/^check-.*-ui\.mjs$/.test(f)&&(!requested.length||requested.includes(f))).sort();
try{for(const script of scripts){const path=join(out,script+'.log'),fd=openSync(path,'w'),start=Date.now();
 const result=await new Promise(resolveRun=>{const child=spawn(process.execPath,['scripts/'+script],{windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,HERMES_LOCAL_BUILD_DIR:build.buildRoot,HERMES_TEST_BUILD_DIR:build.buildRoot,PATH:resolve('desktop/tools/ffmpeg/bin')+';'+process.env.PATH}});child.on('error',error=>resolveRun({code:-1,error:error.message}));child.on('exit',code=>resolveRun({code}));});closeSync(fd);
 const row={script,...result,seconds:Math.round((Date.now()-start)/1000)};results.push(row);await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(row));
 if(result.code!==0)console.log((await readFile(path,'utf8')).split('\n').slice(-18).join('\n'));
}}finally{await removeTestBuild(build.buildRoot);}
process.exitCode=results.some(r=>r.code!==0)?1:0;
