import {ResearchRunner} from './research-runner.mjs';
import {maintainStorage,STORAGE_DEFAULTS} from './storage-policy.mjs';
import {app,BrowserWindow,Menu,ipcMain,safeStorage,shell,screen} from 'electron';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {z} from 'zod';
import {Store} from './store.mjs';
import {Worker} from './worker.mjs';
import {initializeMuseConnection} from './defaults.mjs';
import {Integrations} from './integrations.mjs';
import {readFile} from 'node:fs/promises';
import {startLocalServer,sessionCookie} from '../local/server.mjs';
import {importWorkerOutput} from '../local/import-worker.mjs';
import {SITE,assertSender,safeMessage} from './contracts.mjs';
import {enablePortableMediaTools} from './runtime-tools.mjs';
import {AssistantSettings} from './assistant-settings.mjs';
import {MuseChat} from './muse-chat.mjs';
import {UiPreferences} from './ui-preferences.mjs';
import {InstagramPublisher} from './instagram.mjs';
import {InstagramWorkspace} from '../local/instagram-workspace.mjs';
const here=dirname(fileURLToPath(import.meta.url));
app.setPath('userData', process.env.PRODUCT_LAB_QA_USER_DATA || join(app.getPath('appData'),'product-lab-desktop'));
app.setName('Hermes Clip');
app.commandLine.appendSwitch('disk-cache-size',String(STORAGE_DEFAULTS.electronCacheBytes));
app.commandLine.appendSwitch('media-cache-size',String(STORAGE_DEFAULTS.electronCacheBytes));
enablePortableMediaTools(join(here,'..'));
if(!app.requestSingleInstanceLock())app.quit();
else void startApplication().catch(error=>{console.error('Hermes Clip startup failed:',error);app.exit(1);});

async function startApplication() {
 await app.whenReady();Menu.setApplicationMenu(null);const root=join(app.getPath('userData'),'worker');await mkdir(root,{recursive:true});
 const secret={async encrypt(text){if(!await safeStorage.isAsyncEncryptionAvailable())throw Error('Kho mã hóa hệ điều hành chưa sẵn sàng.');return Buffer.from(await safeStorage.encryptStringAsync(text)).toString('base64');},async decrypt(cipher){if(!await safeStorage.isAsyncEncryptionAvailable())throw Error('Kho mã hóa hệ điều hành chưa sẵn sàng.');return safeStorage.decryptStringAsync(Buffer.from(cipher,'base64'));}};
 const store=new Store(join(root,'worker.sqlite'));
 await maintainStorage(root,store);
 const assistantSettings = new AssistantSettings(store, secret);
 const local=process.argv.includes('--hosted')?null:await startLocalServer({root:join(root,'workspace'),runtimeEnv:()=>assistantSettings.environment(),workerStore:store}),appOrigin=local?.origin??SITE;
 const workArea = screen.getPrimaryDisplay().workAreaSize;
 const worker=new Worker(store,root,chromium,secret),win=new BrowserWindow({width:Math.min(1586,workArea.width),height:Math.min(980,workArea.height),minWidth:390,minHeight:Math.min(600,workArea.height),title:'Hermes Clip Local',backgroundColor:'#0c0d11',webPreferences:{preload:join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 if(local){
  initializeMuseConnection(worker);
  if (!store.get('hermes_vpn_migrated',false)) {
   store.set('profiles',store.get('profiles',[]).map(profile=>({...profile,vpnEnabled:profile.vpnEnabled ?? !profile.proxy.server})));
   store.set('hermes_vpn_migrated',true);
  }
  worker.receiveOutput=async id=>{
   await importWorkerOutput(local,worker,id);
   if(!win.isDestroyed())win.webContents.send('product-lab:workspace-changed');
  };
 }
 const integrations=new Integrations(store,root);
 const museChat = new MuseChat(worker);
 const research=local?new ResearchRunner({worker,chat:museChat,local,integrations,changed:()=>{if(!win.isDestroyed())win.webContents.send('product-lab:workspace-changed');}}):null;
 const preferences = new UiPreferences(store);
 const instagram = local ? new InstagramPublisher({store, root, browser: chromium, secret,
  workspace: new InstagramWorkspace(local, () => {if (!win.isDestroyed()) win.webContents.send('product-lab:workspace-changed');})}) : null;
 if(!integrations.config()){try{integrations.saveConfig(JSON.parse((await readFile(join(here,'../.integrations/config.json'),'utf8')).replace(/^\uFEFF/,'')));}catch{}}
 const calls={assistantSettings:()=>assistantSettings.status(),saveAssistantSettings:p=>assistantSettings.save(p),integrationStatus:()=>integrations.status(),saveIntegrations:p=>integrations.saveConfig(p),checkIntegrations:()=>integrations.doctor(),integrationResearch:p=>integrations.research(p),integrationAnalyze:p=>integrations.analyze(p),integrationFrames:p=>integrations.frames(p.id),integrationAnalyzeStructure:p=>integrations.analyzeStructure(p),integrationStructure:p=>integrations.structure(p),integrationYoutubeStatus:()=>integrations.youtubeStatus(),integrationAnalyzeYoutube:p=>integrations.analyzeYoutube(p),renderOpenMontage:async p=>{const job=await integrations.compose(p);return {...await integrations.output(job.id),jobId:job.id};},status:()=>({...worker.status(),storageMode:local?'local':'hosted'}),revealWorkspace:async()=>{if(!local)throw Error('Bản này đang dùng dữ liệu hosted.');await shell.openPath(local.root);return true;},saveProfile:p=>worker.saveProfile(p),openProfile:p=>worker.openProfile(p.id),openVpn:p=>worker.openVpn(p.id),closeProfile:p=>worker.closeProfile(p.id),checkProfile:p=>worker.checkProfile(p.id),checkAllProfiles:()=>worker.checkAllProfiles(),saveAdapter:p=>worker.saveAdapter(p),saveMuseConnection:p=>worker.saveMuseConnection(p),enqueue:p=>worker.enqueue(p),enqueueAndRun:p=>worker.enqueueAndRun(p),start:p=>worker.start(p),newBatch:()=>worker.newBatch(),pause:()=>worker.pause(),cancel:p=>worker.cancel(p.id),resume:p=>worker.resume(p.id),linkResult:p=>worker.linkResult(p),retry:p=>store.retry(p.id),output:p=>worker.output(p.id),acknowledge:p=>worker.acknowledge(p.id,p.assetId),render:p=>worker.render(p),reveal:p=>{const j=store.job(p.id),path=j.output?.path||j.failedFilePath||j.diagnosticPath;if(!path)throw Error('Chưa có file để mở.');shell.showItemInFolder(path);return true;}};
 Object.assign(calls, {recheckResult: p => worker.recheckResult(p), openResult: p => worker.openResult(p), loadUiState: p => preferences.load(p), saveUiState: p => preferences.save(p), museChatList: p => museChat.list(p), museChatSend: p => museChat.send(p), museChatRecover: p => museChat.recover(p), museChatOpen: p => museChat.open(p), museChatPin: p => museChat.pin(p)});
 if(research)Object.assign(calls,{researchStatus:()=>research.status(),researchStart:p=>research.start(p),researchResume:p=>research.resume(p),researchCheckSources:p=>research.recheckSources(p),researchQueueSources:p=>research.queueSources(p),saveSourceCheckPreference:p=>integrations.saveSourceCheckPreference(p)});
 if (instagram) Object.assign(calls, {
  instagramStatus: () => instagram.status(), instagramSaveProfile: p => instagram.saveProfile(p),
  instagramOpen: p => instagram.open(p), instagramCheck: p => instagram.check(p),
  instagramClose: p => instagram.browsers.close(p.id), instagramOpenVpn: p => instagram.browsers.openVpn(p.id),
  instagramPublish: p => instagram.enqueue(p), instagramRetry: p => instagram.retry(p),
  instagramCancel: p => instagram.cancel(p), instagramReconcile: p => instagram.reconcile(p),
  instagramRefreshMetrics: p => instagram.metrics.refresh(p),
 });
 for(const [method,call] of Object.entries(calls))ipcMain.handle('product-lab:'+method,async(event,payload)=>{try{assertSender(event.senderFrame?.url,event.senderFrame===event.sender.mainFrame&&event.sender===win.webContents,appOrigin);const value=await call(payload);return {ok:true,value};}catch(e){return {ok:false,error:e instanceof z.ZodError?e.issues.map(i=>i.message).join(' '):e.code||String(e.message).includes('browserType.')?safeMessage(e):e.message};}});
 win.webContents.session.setPermissionRequestHandler((_c,_p,cb)=>cb(false));win.webContents.setWindowOpenHandler(({url})=>{try{if(new URL(url).protocol==='https:')void shell.openExternal(url);}catch{}return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(!(u.origin===appOrigin||(!local&&u.protocol==='https:'&&(u.hostname==='chatgpt.com'||u.hostname==='auth.openai.com'||u.hostname.endsWith('.openai.com')))))event.preventDefault();}catch{event.preventDefault();}});
 app.on('second-instance',()=>{win.show();win.focus();});let quitting=false;app.on('before-quit',event=>{worker.pause();integrations.shutdown();if(local&&!quitting){event.preventDefault();quitting=true;void (async()=>{research?.shutdown();await instagram?.shutdown();await local.close();})().finally(()=>app.quit());}});app.on('window-all-closed',()=>app.quit());
 if(local)await win.webContents.session.cookies.set({url:local.origin,name:sessionCookie,value:local.session,httpOnly:true,sameSite:'strict'});
 await win.loadURL(appOrigin+'/?view=production');
 research?.boot();
 instagram?.start();
 const maintenance=setInterval(()=>void maintainStorage(root,store).catch(error=>console.warn('Storage maintenance:',error.message)),60*60*1000);maintenance.unref();
 app.once('before-quit',()=>clearInterval(maintenance));
 if(local)for(const job of store.jobs().filter(job=>job.state==='ready'&&!job.importedAt))void worker.importReady(job.id);
}
