import {app,dialog,BrowserWindow,Menu,ipcMain,safeStorage,shell,screen} from 'electron';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import {guardDesktopStartup} from './startup-guard.mjs';
app.setPath('userData', process.env.PRODUCT_LAB_QA_USER_DATA || join(app.getPath('appData'),'product-lab-desktop'));
// Electron waits for its main ESM module before emitting ready. Do not await
// whenReady at module scope: that would leave startup waiting on itself.
void app.whenReady().then(()=>guardDesktopStartup({desktopRoot:dirname(dirname(fileURLToPath(import.meta.url))),showMessage:message=>dialog.showMessageBox({type:'error',title:'Hermes Clip',message,buttons:['Đóng']}),quit:()=>app.quit(),launch:async()=>{
const {registerNewRender}=await import('./asset-compression.mjs');
const {ProductDeployment}=await import('./product-deployment.mjs');
const {ManualMedia}=await import('./manual-media.mjs');
const {MusePackage}=await import('./muse-package.mjs');
const {ResearchRunner}=await import('./research-runner.mjs');
const {maintainStorage,STORAGE_DEFAULTS}=await import('./storage-policy.mjs');
const {Store}=await import('./store.mjs');
const {Worker}=await import('./worker.mjs');
const {initializeMuseConnection}=await import('./defaults.mjs');
const {Integrations}=await import('./integrations.mjs');
const {EarlyVideoRender}=await import('./early-video-render.mjs');
const {startLocalServer,sessionCookie}=await import('../local/server.mjs');
const {importWorkerOutput}=await import('../local/import-worker.mjs');
const {SITE,assertSender,safeMessage}=await import('./contracts.mjs');
const {enablePortableMediaTools}=await import('./runtime-tools.mjs');
const {AssistantSettings}=await import('./assistant-settings.mjs');
const {CodexTextService}=await import('./codex-cli.mjs');
const {ReaVideoService}=await import('./rea-video.mjs');
const reaDomain=await import('../local-dist/server/lib/lab/rea-video.mjs');
const textExchange=await import('../local-dist/server/lib/lab/codex-exchange.mjs');
const {MuseChat}=await import('./muse-chat.mjs');
const {sendMuseChat}=await import('./muse-chat-ipc.mjs');
const {UiPreferences}=await import('./ui-preferences.mjs');
const {InstagramPublisher}=await import('./instagram.mjs');
const {bootInstagram}=await import('./instagram-policy.mjs');
const {InstagramWorkspace}=await import('../local/instagram-workspace.mjs');
const here=dirname(fileURLToPath(import.meta.url));
// A scoped live-Muse acceptance run must not boot unrelated installed queues.
const museOnly=process.env.HERMES_MUSE_ONLY==='1';
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
 if(!museOnly)await maintainStorage(root,store);
 const assistantSettings = new AssistantSettings(store, secret);
 const codexText = new CodexTextService({store, root, exchange:textExchange});
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
 const manual=local?new ManualMedia({store,local,trashItem:path=>shell.trashItem(path),changed:()=>{if(!win.isDestroyed())win.webContents.send('product-lab:workspace-changed');}}):null;
 if(manual){
  worker.validateMediaProvider=(request,options)=>manual.assertMuseScene(request,options);
  worker.readProductionRecord=async id=>(await manual.records()).find(row=>row.kind==='production'&&row.id===id);
  worker.readProductionForProfileRemoval=id=>local.readProductionForProfileRemoval(id);
 }
 const integrations=new Integrations(store,root);
 const earlyRenders=manual?new EarlyVideoRender({records:()=>manual.records(),readOutput:id=>worker.output(id),readAsset:async id=>{const response=await manual.request('/api/assets/'+id);if(!response.ok)throw Error('Không đọc được nguồn dựng.');return new Uint8Array(await response.arrayBuffer());},compose:input=>integrations.compose(input),onTiming:(id,stage)=>{const job=store.job(id);store.put({...job,timings:{...job.timings,[stage]:Date.now()}});}}):null;
 worker.onReadyOutput=job=>earlyRenders?.start(job);
 const reaVideo=new ReaVideoService({store,root,run:integrations.run,domain:reaDomain,secret,config:()=>integrations.config()});
 integrations.rea=reaVideo;
 const museChat = new MuseChat(worker);
 const research=local?new ResearchRunner({worker,chat:museChat,local,integrations,changed:()=>{if(!win.isDestroyed())win.webContents.send('product-lab:workspace-changed');}}):null;
 const deployments=local?new ProductDeployment({worker,local,changed:()=>{if(!win.isDestroyed())win.webContents.send('product-lab:workspace-changed');}}):null;
 const preferences = new UiPreferences(store);
 const instagram = local ? new InstagramPublisher({store, root, browser: chromium, secret,
  apiOptions:{enabled:process.env.HERMES_INSTAGRAM_API_ENABLED!=='0',version:process.env.HERMES_INSTAGRAM_API_VERSION || 'v25.0'},
  workspace: new InstagramWorkspace(local, () => {if (!win.isDestroyed()) win.webContents.send('product-lab:workspace-changed');})}) : null;
 try{integrations.loadInstalledConfig(JSON.parse((await readFile(join(here,'../.integrations/config.json'),'utf8')).replace(/^\uFEFF/,'')));}catch{}
 const calls={assistantSettings:()=>assistantSettings.status(),saveAssistantSettings:p=>assistantSettings.save(p),integrationStatus:()=>integrations.status(),saveIntegrations:p=>integrations.saveConfig(p),checkIntegrations:()=>integrations.doctor(),integrationResearch:p=>integrations.research(p),integrationAnalyze:p=>integrations.analyze(p),integrationFrames:p=>integrations.frames(p.id),integrationAnalyzeStructure:p=>integrations.analyzeStructure(p),integrationStructure:p=>integrations.structure(p),integrationYoutubeStatus:()=>integrations.youtubeStatus(),integrationAnalyzeYoutube:p=>integrations.analyzeYoutube(p),renderOpenMontage:async p=>{const job=await integrations.compose(p),result={...await integrations.output(job.id),jobId:job.id};if(local)result.preparedToken=local.registerPreparedMedia(result);return result;},status:()=>({...worker.status(),compression:local?.compressionStatus(),storageMode:local?'local':'hosted'}),revealWorkspace:async()=>{if(!local)throw Error('Bản này đang dùng dữ liệu hosted.');await shell.openPath(local.root);return true;},saveProfile:p=>worker.saveProfile(p),openProfile:p=>worker.openProfile(p.id),openVpn:p=>worker.openVpn(p.id),closeProfile:p=>worker.closeProfile(p.id),checkProfile:p=>worker.checkProfile(p.id),checkAllProfiles:()=>worker.checkAllProfiles(),saveAdapter:p=>worker.saveAdapter(p),saveMuseConnection:p=>worker.saveMuseConnection(p),enqueue:p=>worker.enqueue(p),enqueueAndRun:p=>worker.enqueueAndRun(p),start:p=>worker.start(p),newBatch:()=>worker.newBatch(),pause:()=>worker.pause(),cancel:p=>worker.cancel(p.id),resume:p=>worker.resume(p.id,{recoverExisting:p.recoverExisting===true}),linkResult:p=>worker.linkResult(p),retry:p=>worker.retry(p.id),output:async p=>{const result=await worker.output(p.id);if(local)result.preparedToken=local.registerPreparedMedia({...store.job(p.id).output,type:result.type});return result;},acknowledge:p=>worker.acknowledge(p.id,p.assetId),render:async p=>{const ass=p.referenceOverlay?await integrations.reaAss(p.referenceOverlay,p.clips.reduce((n,c)=>n+c.duration,0)):null;const result=await worker.render(p,ass);if(local)result.preparedToken=registerNewRender(local,result);return result;},reveal:p=>{const j=store.job(p.id),path=j.output?.path||j.failedFilePath||j.diagnosticPath;if(!path)throw Error('Chưa có file để mở.');shell.showItemInFolder(path);return true;}};
 Object.assign(calls,{renderPlannedVideo:async input=>{
  const {getRenderPlan,assertRenderRevision}=await import('../local-dist/server/lib/lab/render-plan.mjs');
  const d=z.object({projectId:z.string(),variantId:z.string(),revision:z.number().int().positive(),planSignature:z.string().max(50000).optional(),filename:z.string().regex(/^[a-zA-Z0-9_-]{1,170}\.mp4$/).optional()}).parse(input);
  if(!manual||!local)throw Error('Dựng plan cần workspace local.');
  const records=await manual.records(),record=records.find(r=>r.id===d.projectId&&r.kind==='production');
  if(!record)throw Error('Dự án đã thay đổi. Tải lại trước khi dựng.');
  const product=records.find(r=>r.id===record.data.productId&&r.kind==='product');
  if(!product||product.data.archived||product.revision!==record.data.productRevision)throw Error('Hồ sơ sản phẩm cần đồng bộ/duyệt lại.');
  const plan=getRenderPlan(record.data,record.id,d.variantId),clips=[];
  assertRenderRevision(record.revision,d.revision,plan,d.planSignature);
  for(const segment of plan.segments){const asset=records.find(r=>r.id===segment.assetId&&r.kind==='asset');if(!asset||asset.data.sha256!==segment.sha256)throw Error('Nguồn dựng đã thay đổi.');const response=await manual.request('/api/assets/'+segment.assetId);if(!response.ok)throw Error('Không đọc được nguồn dựng.');clips.push({bytes:new Uint8Array(await response.arrayBuffer()),sha256:segment.sha256,duration:asset.data.metadata.duration,inSec:segment.inSec,outSec:segment.outSec});}
  const composition={planVersion:1,projectId:record.id,variantId:d.variantId,ratio:plan.ratio,clips,overlays:plan.overlays};
  await earlyRenders?.prepared(composition);
  const job=await (earlyRenders?.get(composition)??integrations.compose(composition)),result=await integrations.output(job.id);
  if(d.filename){const {copyFile}=await import('node:fs/promises');const named=join(dirname(result.path),d.filename);if(named!==result.path)await copyFile(result.path,named);result.path=named;result.name=d.filename;}
  return {...result,renderPlan:plan,preparedToken:local.registerPreparedMedia(result)};
 }});
 Object.assign(calls,{prepareVideoRenders:p=>{if(!earlyRenders)throw Error('Cần workspace local.');return earlyRenders.arm(z.object({projectId:z.string().regex(/^[\w-]{1,120}$/)}).parse(p).projectId);}});
 Object.assign(calls,{setMusePaused:p=>worker.setMusePaused(p)});
 Object.assign(calls,{warmMuseProfiles:()=>worker.warmProfiles()});
 const musePackage=manual?new MusePackage({worker,manual,domain:await import('../local-dist/server/lib/lab/production.mjs')}):null;
 Object.assign(calls,{museNightStatus:()=>worker.night.status(),beginMuseNight:()=>worker.night.begin(),saveMusePacing:p=>worker.night.configure(p),musePackagePreview:async p=>{if(!musePackage)throw Error('Cần workspace local.');return (await musePackage.preview(p)).public;},musePackageStart:async p=>{if(!musePackage)throw Error('Cần workspace local.');return musePackage.start(p);}});
 Object.assign(calls,{deleteProfile:p=>worker.deleteProfile(p)});
 if(deployments)Object.assign(calls,{deploymentStart:p=>deployments.start(p),deploymentStatus:()=>deployments.status(),deploymentResume:p=>deployments.resume(p),deploymentPause:p=>deployments.pause(p)});
 Object.assign(calls,{museChatSkipReconciliation:p=>museChat.skipReconciliation(p)});
 if(research)Object.assign(calls,{researchSkipReconciliation:p=>research.skipReconciliation(p)});
 Object.assign(calls,{codexTextSettings:()=>codexText.status(),saveCodexTextSettings:p=>codexText.configure(p),codexTextRun:p=>codexText.execute(p)});
 Object.assign(calls,{reaVideoSettings:()=>reaVideo.settings(),saveReaVideoSettings:p=>{if(integrations.busy)throw Error('Chờ tác vụ tích hợp hoàn tất.');return reaVideo.configure(p);},checkReaVideo:()=>{if(integrations.busy)throw Error('Chờ tác vụ tích hợp hoàn tất.');return reaVideo.doctor();},
  reaVideoExportReview:async p=>{const result=await integrations.reaReview(p);const error=await shell.openPath(result.path);if(error)throw Error('Đã xuất gói nhưng chưa mở được thư mục: '+result.path);return result;},
  reaVideoImportReview:p=>integrations.reaReview(p),reaVideoExportPack:async p=>{const r=await integrations.reaPack(p);await shell.openPath(r.path);return r;}});
 if(manual)Object.assign(calls,{
  manualMediaStatus:()=>manual.status(),manualMediaConfigure:p=>manual.configure(p),
  manualMediaExport:p=>manual.exportPack(p),manualMediaAssign:p=>manual.assign(p),
  manualMediaOpen:async p=>{const path=await manual.waitForFiles(p);const error=await shell.openPath(path);if(error)throw Error(error);return path;},
 });
 Object.assign(calls, {recheckResult: p => worker.recheckResult(p), openResult: p => worker.openResult(p), loadUiState: p => preferences.load(p), saveUiState: p => preferences.save(p), museChatList: p => museChat.list(p), museChatSend: p => sendMuseChat(museChat, integrations, p), museChatRecover: p => museChat.recover(p), museChatOpen: p => museChat.open(p), museChatPin: p => museChat.pin(p)});
 if(research)Object.assign(calls,{researchStatus:()=>research.status(),researchStart:p=>research.start(p),researchResume:p=>research.resume(p),researchCheckSources:p=>research.recheckSources(p),researchQueueSources:p=>research.queueSources(p),saveSourceCheckPreference:p=>integrations.saveSourceCheckPreference(p)});
 if (instagram) Object.assign(calls, {
  instagramStatus: () => instagram.status(), instagramSaveProfile: p => instagram.saveProfile(p),
  instagramOpen: p => instagram.open(p), instagramCheck: p => instagram.check(p),
  instagramClose: p => instagram.browsers.close(p.id), instagramOpenVpn: p => instagram.browsers.openVpn(p.id),
  instagramPublish: p => instagram.enqueue(p), instagramRetry: p => instagram.retry(p),
  instagramCancel: p => instagram.cancel(p), instagramReconcile: p => instagram.reconcile(p),
  instagramRefreshMetrics: p => instagram.metrics.refresh(p),
  instagramConfigureBrowser: p => instagram.configureBrowser(p),
  instagramSaveDmRule: p => instagram.comments.saveRule(p),
  instagramDmEmergencyStop: () => instagram.comments.emergencyStop(),
 });
 for(const [method,call] of Object.entries(calls))ipcMain.handle('product-lab:'+method,async(event,payload)=>{try{assertSender(event.senderFrame?.url,event.senderFrame===event.sender.mainFrame&&event.sender===win.webContents,appOrigin);const value=await call(payload);return {ok:true,value};}catch(e){return {ok:false,error:e instanceof z.ZodError?e.issues.map(i=>i.message).join(' '):method.startsWith('instagram')&&e.instagramApiSafe===true?e.message:e.code||String(e.message).includes('browserType.')?safeMessage(e):e.message};}});
 win.webContents.session.setPermissionRequestHandler((_c,_p,cb)=>cb(false));win.webContents.setWindowOpenHandler(({url})=>{try{if(new URL(url).protocol==='https:')void shell.openExternal(url);}catch{}return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(!(u.origin===appOrigin||(!local&&u.protocol==='https:'&&(u.hostname==='chatgpt.com'||u.hostname==='auth.openai.com'||u.hostname.endsWith('.openai.com')))))event.preventDefault();}catch{event.preventDefault();}});
 app.on('second-instance',()=>{win.show();win.focus();});let quitting=false;app.on('before-quit',event=>{worker.pause();integrations.shutdown();if(local&&!quitting){event.preventDefault();quitting=true;void (async()=>{deployments?.shutdown();research?.shutdown();await manual?.close();await instagram?.shutdown();await integrations.idle();await local.close();})().finally(()=>app.quit());}});app.on('window-all-closed',()=>app.quit());
 if(local)await win.webContents.session.cookies.set({url:local.origin,name:sessionCookie,value:local.session,httpOnly:true,sameSite:'strict'});
 await win.loadURL(appOrigin+'/?view=signals');
 if(!museOnly){manual?.start();research?.boot();deployments?.boot();bootInstagram(instagram);}
 const maintenance=setInterval(()=>{if(!museOnly)void maintainStorage(root,store).catch(error=>console.warn('Storage maintenance:',error.message));},60*60*1000);maintenance.unref();
 app.once('before-quit',()=>clearInterval(maintenance));
 if(local&&!museOnly)for(const job of store.jobs().filter(job=>job.state==='ready'&&!job.importedAt))void worker.importReady(job.id);
}
}})).catch(error=>{console.error('Hermes Clip startup failed:',error);dialog.showErrorBox('Hermes Clip','Không thể khởi động Hermes Clip. Kiểm tra bản build và thử mở lại.');app.quit();});
