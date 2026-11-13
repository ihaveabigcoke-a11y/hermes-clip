// Isolated source-built workspace + Chrome. All external requests are blocked.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {startLocalServer,sessionCookie} from '../desktop/test/helpers/local-server.mjs';
export async function officeUI(task,records,run){
 const out=resolve('outputs/'+task+'-ui');await mkdir(out,{recursive:true});const temp=await mkdtemp(join(out,'isolated-'));
 const seedPath=join(temp,'seed.json');await writeFile(seedPath,JSON.stringify({records}));let local,browser;const errors=[],external=[],log=openSync(join(out,'chrome.log'),'w');
 try{local=await startLocalServer({root:join(temp,'workspace'),seedPath});
 spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu',`--user-data-dir=${join(temp,'chrome')}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore',log,log],windowsHide:true,env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp,TEMP:temp,TMP:temp}});
 let port;for(let i=0;i<120;i++){try{port=(await readFile(join(temp,'chrome/DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}assert.ok(port,'Chrome did not start');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});await context.addCookies([{name:sessionCookie,value:local.session,url:local.origin,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==local.origin){external.push('blocked external request');return route.abort();}return route.continue();});
 await context.addInitScript(()=>{localStorage.setItem('product-lab-mode','real');const preferences={};window.productLabDesktop={status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},manualMediaStatus:async()=>({inbox:'Fixture only',scenes:[],unmatched:[],errors:[]}),assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),museChatList:async()=>[],codexTextSettings:async()=>({enabled:false})};});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const shots=[];
 const screenshot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(out,name+'.png'),fullPage:true,animations:'disabled'});shots.push(name+'.png');};
 let result;try{result=await run({page,origin:local.origin,out,screenshot});}catch(error){console.error('PAGE ERRORS',JSON.stringify(errors));await page.screenshot({path:join(out,'failure.png'),fullPage:true});await writeFile(join(out,'failure.txt'),await page.locator('body').innerText());throw error;}assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(join(out,'result.json'),JSON.stringify({passed:true,fixture:true,realService:false,shots,errors,external,...result},null,2));console.log(JSON.stringify({passed:true,shots,...result}));
 }finally{if(browser){try{const c=browser.contexts()[0];await c.newCDPSession(await c.newPage()).then(s=>s.send('Browser.close'));}catch{}await browser.close().catch(()=>{});}closeSync(log);await local?.close();}
}
