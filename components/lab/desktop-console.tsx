"use client";
import {uiCopy} from '@/desktop/src/ui-copy.mjs';
import {useEffect,useRef,useState} from 'react';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {z} from 'zod';
import {Plus,RefreshCw} from 'lucide-react';
import {Button,Badge,Empty,Modal,RecordForm,Pagination,type FieldDef} from './primitives';
import {MuseSwitch, musePauseHelp} from './muse-switch';
import {resolveProvider} from '@/desktop/src/provider-routing.mjs';
import WorkerActivity from './worker-activity';
import QueueBoard from './queue-board';
import {PageSelection,useWorkbenchSelection} from './workbench-controls';
import {profileInput,adapterInput,museConnectionInput} from '@/desktop/src/shared.mjs';
import {desktopBridge,fetchAssetBytes,uploadDesktopOutput,type DesktopJob,type DesktopProfile} from '@/lib/lab/desktop-client';
import {sceneGate,type Production} from '@/lib/lab/production';
import {formatTime,type LabRecord} from '@/lib/lab/domain';
import {promptWarnings} from '@/lib/lab/intelligence';
type Spec={title:string;description?:string;submitLabel?:string;initial:any;fields:FieldDef[];validation:any;save:(v:any)=>Promise<any>};
type Props={mode?:'accounts'|'queue';records?:LabRecord[];projectId?:string;production?:Production|null;product?:LabRecord;assets?:LabRecord[];demo?:boolean;paused?:boolean;active?:boolean;onImport?:(job:DesktopJob,assetId:string)=>Promise<any>};
const health:Record<string,string>={unknown:'Chưa kiểm tra',ready:'Sẵn sàng',login_required:'Cần đăng nhập',flow_required:'Chờ xác minh luồng Muse',connection_error:'Lỗi kết nối'};
export default function DesktopConsole({projectId,production:p,product,assets=[],records=[],demo=false,paused=false,active=true,onImport,mode='accounts'}:Props){
 const {status,refresh,error:statusError}=useDesktopStatus(active);
 const musePaused=status?.musePaused!==false;
 const bridge=!!desktopBridge();
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState<Spec|null>(null),[dirty,setDirty]=useState(false),[scenePage,setScenePage]=useState(1);
 const lock=useRef(false),abort=useRef<AbortController|null>(null),selected=useWorkbenchSelection(projectId??'accounts');
 const batchLimit = status?.batch?.perProfileLimit ?? 3;
 const remainingBatchCapacity = status?.profiles.filter(profile => profile.enabled).reduce((remaining, profile) =>
   remaining + Math.max(0, batchLimit - (status.batch?.submittedByProfile[profile.id] ?? 0)), 0) ?? 0;
 useEffect(()=>{if(statusError)setError(statusError);},[statusError]);
 useEffect(()=>()=>abort.current?.abort(),[]);
 async function execute(method:string,value?:any){if(lock.current)throw Error('Đang xử lý thao tác trước.');const api=desktopBridge();if(!api)throw Error("Mở bằng Hermes Clip trên máy để thao tác với máy Windows.");lock.current=true;setBusy(true);setError('');try{const r=await api[method](value);await refresh();return r;}catch(e){setError((e as Error).message);throw e;}finally{lock.current=false;setBusy(false);}}
 const action=(method:string,value?:any)=>execute(method,value).catch(()=>undefined);
 function profileForm(profile?:DesktopProfile){const flat=z.object({id:z.string().optional(),name:z.string().trim().min(2,"Đặt tên hồ sơ."),accountLabel:z.string().max(100),enabled:z.boolean(),vpnEnabled:z.boolean(),server:z.string(),username:z.string(),password:z.string(),clearPassword:z.boolean()}).superRefine((v,c)=>{const r=profileInput.safeParse({id:v.id,name:v.name,accountLabel:v.accountLabel,enabled:v.enabled,vpnEnabled:v.vpnEnabled,proxy:{server:v.server,username:v.username,password:v.password||undefined,clearPassword:v.clearPassword}});if(!r.success)for(const i of r.error.issues)c.addIssue({code:'custom',path:['server'],message:i.message});});setDirty(false);setForm({title:profile?"Sửa hồ sơ và proxy":"Thêm hồ sơ trên máy này",initial:{id:profile?.id,name:profile?.name??'',accountLabel:profile?.accountLabel??'',enabled:profile?.enabled??true,vpnEnabled:profile?.vpnEnabled??true,server:profile?.proxy.server??'',username:profile?.proxy.username??'',password:'',clearPassword:false},validation:flat,fields:[{name:'name',label:"Tên hồ sơ"},{name:'accountLabel',label:'Nhãn tài khoản Muse',help:'Tên để nhận biết; không nhập mật khẩu Muse.'},{name:'vpnEnabled',label:"Tự cài và bật Touch VPN khi mở trình duyệt",type:'checkbox',full:true,help:"Tiện ích chính thức từ Chrome Web Store, lưu riêng trạng thái trong mỗi hồ sơ."},{name:'server',label:"Địa chỉ proxy",placeholder:'http://host:port hoặc socks5://host:port',full:true,help:'Tắt Touch VPN khi dùng proxy riêng. Để trống và tắt VPN để kết nối trực tiếp.'},{name:'username',label:'Tài khoản proxy'},{name:'password',label:'Mật khẩu proxy',type:'password',help:profile?.proxy.hasPassword?'Để trống để giữ mật khẩu đã mã hóa trên máy.':'Chỉ lưu mã hóa trên máy Windows.'},{name:'clearPassword',label:'Xóa mật khẩu proxy đã lưu',type:'checkbox'},{name:'enabled',label:"Cho phép giao việc cho hồ sơ",type:'checkbox'}],save:v=>execute('saveProfile',{id:v.id,name:v.name,accountLabel:v.accountLabel,enabled:v.enabled,vpnEnabled:v.vpnEnabled,proxy:{server:v.server,username:v.username,password:v.password||undefined,clearPassword:v.clearPassword}})});}
 function connectionForm(){setDirty(false);setForm({title:'Trang Muse của tài khoản',description:"Nhập URL thật. Tài khoản được đăng nhập trực tiếp trong hồ sơ; app không yêu cầu mật khẩu Muse.",initial:{startUrl:status?.connection?.startUrl??''},fields:[{name:'startUrl',label:'URL Muse',type:'url',full:true,help:"Đổi URL sẽ tắt cấu hình tự động cũ. Đóng hồ sơ trước khi đổi."}],validation:museConnectionInput,save:v=>execute('saveMuseConnection',v)});}
 function flowForm(){setDirty(false);setForm({title:'Cấu hình luồng Muse',description:'Cấu hình nâng cao để nhận diện ô nhập, nút tạo và kết quả trên trang Muse.',initial:{config:JSON.stringify(status?.adapter??{startUrl:status?.connection?.startUrl??'',loggedIn:'',prompt:'',submitName:'',resultCards:'',resultIdAttribute:'data-task-id',readyWithinCard:'',downloadButtonName:'',upload:'',timeoutSeconds:900},null,2),enabled:status?.generationReady??false,reviewed:false},fields:[{name:'config',label:'Cấu hình thao tác Muse',type:'textarea',full:true,help:"Điền cấu hình ô prompt, nút gửi, vùng kết quả và nút tải theo luồng Muse đã kiểm tra."},{name:'reviewed',label:'Đã đối chiếu thực tế luồng tạo, mã kết quả và tải file',type:'checkbox',full:true},{name:'enabled',label:'Bật giao việc qua luồng đã kiểm tra',type:'checkbox',full:true}],validation:{safeParse(v:any){try{const r=adapterInput.safeParse({...JSON.parse(v.config),enabled:v.enabled,reviewed:v.reviewed});return r.success?{success:true,data:r.data}:{success:false,error:{issues:r.error.issues.map(i=>({...i,path:['config']}))}};}catch{return {success:false,error:{issues:[{code:'custom',path:['config'],message:'Cấu hình cần JSON hợp lệ.'}]}};}}},save:v=>execute('saveAdapter',v)});}
 function startForm(jobs: DesktopJob[]) {
   const maximum = Math.min(30, remainingBatchCapacity, jobs.length);
   const jobIds = [...jobs].sort((a, b) => a.createdAt - b.createdAt).map(job => job.id);
   setDirty(false);
   setForm({
     title:'Duyệt lượt gửi Muse',
     submitLabel:'Duyệt và chạy',
     description:`Đã chọn ${jobs.length} tác vụ chờ tạo trong danh sách hiện tại. Đợt hiện tại còn tối đa ${remainingBatchCapacity} lượt trên các hồ sơ bật. Mỗi hồ sơ được gửi tối đa ${batchLimit} lượt chat hoặc tạo ảnh/video trong một đợt. Dùng một hồ sơ cho mỗi tài khoản Muse.`,
     initial:{count:maximum,maxConcurrent:1,approved:false},
     fields:[
       {name:'count',label:"Số tác vụ giao trong đợt hiện tại",type:'number'},
       {name:'maxConcurrent',label:"Tối đa hồ sơ đồng thời",type:'number',help:"1–4 hồ sơ. Mỗi hồ sơ xử lý một tác vụ tại một thời điểm."},
       {name:'approved',label:"Đã duyệt prompt/tham chiếu và đồng ý dùng số lượt trên",type:'checkbox',full:true},
     ],
     validation:z.object({count:z.number().int().min(1).max(maximum),maxConcurrent:z.number().int().min(1).max(4),approved:z.literal(true,{errorMap:()=>({message:'Duyệt số lượt trước khi bắt đầu.'})})}),
     save:value=>execute('start',{...value,jobIds:jobIds.slice(0,value.count)}),
   });
 }
 function reconcileForm(j:DesktopJob){setDirty(false);setForm({title:'Chỉ định kết quả Muse cũ',description:"Mở hồ sơ để kiểm tra đúng prompt rồi chép mã kết quả và URL. Thao tác này không gửi tạo mới.",initial:{providerId:j.providerId??'',url:''},fields:[{name:'providerId',label:'Mã kết quả Muse'},{name:'url',label:'URL hội thoại/kết quả cũ',type:'url',full:true}],validation:z.object({providerId:z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/,'Mã kết quả chưa hợp lệ.'),url:z.string().url().refine(v=>{try{return !!status?.adapter&&new URL(v).origin===new URL(status.adapter.startUrl).origin;}catch{return false;}},'Dùng URL đúng miền Muse đã cấu hình.')}),save:v=>execute('linkResult',{id:j.id,...v})});}
 async function enqueue(){if(!p||!product||!projectId||demo)throw Error("Chọn dự án thật trước khi giao tác vụ nền.");if(paused||p.paused)throw Error("Mở giao việc trước khi thêm lô vào tác vụ nền.");if(p.productRevision!==product.revision)throw Error('Đồng bộ hồ sơ sản phẩm trước.');const api=desktopBridge();if(!api||lock.current)return;lock.current=true;setBusy(true);setError('');const c=new AbortController();abort.current=c;const timer=setTimeout(()=>c.abort(),120000);try{for(const s of p.scenes.filter(s=>selected.keys.includes(s.id))){if(resolveProvider({kind:'media',status,selection:s.mediaProvider??p.mediaProvider}).provider!=='muse')throw Error('Chọn Muse cho cảnh trước khi giao tác vụ nền.');const gate=sceneGate(p,s);if(gate||!s.storyboardApproved)throw Error(gate||`Duyệt kịch bản ${s.name} trước.`);const references=[];for(const pin of s.references){const r=p.references.find(r=>r.id===pin.id&&r.version===pin.version)!,asset=assets.find(a=>a.id===r.assetId);if(!asset?.data.type?.startsWith('image/')||!asset.data.sha256)throw Error("Tác vụ nền hiện chỉ nhận tham chiếu ảnh có mã kiểm tra file.");references.push({id:r.id,version:r.version,type:asset.data.type,sha256:asset.data.sha256,bytes:await fetchAssetBytes(r.assetId,c.signal)});}await api.enqueue({projectId,productId:p.productId,productRevision:p.productRevision,sceneId:s.id,sceneRevision:s.revision,name:s.name,mediaType:s.mediaType,ratio:s.ratio,duration:s.duration,prompt:[s.prompt,s.action&&`Action: ${s.action}`,s.camera&&`Camera: ${s.camera}`,s.voice&&`Audio: ${s.voice}`].filter(Boolean).join('\n'),references});}selected.setKeys([]);await refresh();}catch(e){setError(`${(e as Error).message} Cảnh đã lưu vào tác vụ nền được giữ; thêm lại sẽ đối soát cùng fingerprint.`);}finally{clearTimeout(timer);lock.current=false;setBusy(false);}}
 async function receive(j:DesktopJob){if(demo||!p||!product||!onImport||j.request.projectId!==projectId)return;if(p.productRevision!==j.request.productRevision||product.revision!==j.request.productRevision||p.scenes.find(s=>s.id===j.request.sceneId)?.revision!==j.request.sceneRevision){setError("Cảnh hoặc sản phẩm đã đổi. Giữ file tác vụ nền; xem lại trước khi gắn vào phiên bản mới.");return;}const api=desktopBridge();if(!api||lock.current)return;lock.current=true;setBusy(true);setError('');const c=new AbortController();abort.current=c;const timer=setTimeout(()=>c.abort(),120000);try{let assetId=j.uploadedAssetId;if(!assetId){const result=await api.output({id:j.id}),uploaded=await uploadDesktopOutput(result,c.signal,j.id);if(uploaded.sha256!==result.sha256)throw Error('File upload sai checksum.');assetId=uploaded.id;await api.acknowledge({id:j.id,assetId});}await onImport(j,assetId);await refresh();}catch(e){setError(`${(e as Error).message} File trên máy được giữ; thử nhập lại dùng cùng mã tác vụ.`);}finally{clearTimeout(timer);lock.current=false;setBusy(false);}}
 const scenes=p?.scenes??[],sp=Math.min(scenePage,Math.max(1,Math.ceil(scenes.length/8))),visible=scenes.slice((sp-1)*8,sp*8);
 const quotaProfiles = status?.profiles.filter(profile => typeof profile.quota?.weeklyUsedPercent === 'number') ?? [];
 const averageUsed = quotaProfiles.length ? Math.round(quotaProfiles.reduce((sum, profile) => sum + profile.quota!.weeklyUsedPercent!, 0) / quotaProfiles.length) : null;
 return <section className="desktop-console">
 {mode==='accounts'&&<MuseSwitch demo={demo}/>}
 <header className="production-heading"><div><h1>{mode === 'queue' ? 'Hàng đợi Muse' : uiCopy.accounts}</h1>{mode === 'accounts' && <p>Mỗi hồ sơ giữ một phiên Muse và cấu hình mạng riêng.</p>}</div><div className="button-row">
   <Button tone="neutral" disabled={!bridge||busy} onClick={()=>void refresh().catch(e=>setError(e.message))}><RefreshCw size={15}/>Tải lại</Button>
   {mode === 'accounts' && <Button disabled={!bridge||busy} onClick={()=>profileForm()}><Plus size={16}/>Thêm tài khoản</Button>}
 </div></header>
 {!bridge&&<Empty title="Mở Hermes Clip trên máy" text="Quản lý hồ sơ và chạy Muse từ bản app Windows."/>}
 {error&&<p role="alert" className="inline-error">{error}</p>}
 {bridge&&<>{mode!=='accounts'&&musePaused&&<p role="status" className="info-panel">Muse đang tạm dừng, bật lại ở Tài khoản Muse</p>}
 {mode === 'accounts' && <>
 <div className="account-stats" aria-label="Tổng quan tài khoản">
   <div><span>Tài khoản đang dùng</span><strong>{status?.profiles.filter(profile=>profile.enabled).length??0}<small> / {status?.profiles.length??0}</small></strong></div>
   <div><span>Phiên đã kiểm tra</span><strong>{status?.profiles.filter(profile=>profile.session==='signed_in').length??0}<small> / {status?.profiles.length??0}</small></strong></div>
   <div><span>Tác vụ đang chạy</span><strong>{status?.active??0}</strong></div>
   <div><span>Hạn mức tuần đã dùng</span><strong>{averageUsed === null ? 'Chưa đo' : averageUsed + '%'}</strong><small>Trung bình lần đo đã lưu · {quotaProfiles.length} hồ sơ</small></div>
 </div>
 <div className="account-controls">
   <span>Tối đa <strong>{batchLimit} lượt/hồ sơ/đợt</strong><small>{status?.batch ? 'Bắt đầu ' + formatTime(status.batch.startedAt) : 'Đợt bắt đầu khi gửi tác vụ'}</small></span>
   <Button tone="neutral" disabled={busy||!status||status.active>0||status.profiles.some(profile=>profile.busy)} onClick={()=>action('newBatch')}>Bắt đầu đợt mới</Button>
   <Button tone="neutral" busy={busy} title={musePaused?musePauseHelp:undefined} disabled={musePaused||!status?.profiles.some(profile=>profile.enabled&&!profile.busy)} onClick={()=>action('checkAllProfiles')}>Kiểm tra phiên và hạn mức</Button>
   <a className="lab-button ghost" href="?view=queue">Mở hàng đợi</a>
 </div>
 <div className="account-list" aria-label="Danh sách hồ sơ Muse">{status?.profiles.map(profile=><article className="account-row" key={profile.id}>
   <div className="account-identity"><label className="account-toggle"><input type="checkbox" role="switch" aria-label={'Cho phép giao việc cho ' + profile.name} checked={profile.enabled} disabled={busy||profile.busy||profile.open} onChange={event=>action('saveProfile',{id:profile.id,name:profile.name,accountLabel:profile.accountLabel,enabled:event.target.checked,vpnEnabled:profile.vpnEnabled,proxy:{server:profile.proxy.server,username:profile.proxy.username}})}/></label><div><h3>{profile.name}</h3><small>{profile.accountLabel||'Chưa đặt nhãn'}</small><small>{status.batch?.submittedByProfile[profile.id]??0}/{batchLimit} lượt trong đợt</small></div></div>
   <div className="account-network"><span>{profile.vpnEnabled?'Touch VPN':profile.proxy.server?'Proxy riêng':'Kết nối trực tiếp'}</span><small>{profile.vpnEnabled?(vpnLabels[profile.vpn?.state??'closed']??'Chưa kiểm tra'):profile.open?"Trình duyệt đang mở":"Trình duyệt đã đóng"}</small><details><summary>Chi tiết mạng</summary><small>{profile.proxy.server}</small><small>IP lần đo {profile.ip??'Chưa đo'}</small>{profile.checkedAt&&<small>{formatTime(profile.checkedAt)}</small>}{profile.vpn?.message&&<small>{profile.vpn.message}</small>}</details></div>
   <MuseQuota quota={profile.quota}/>
   <div className="account-session"><Badge tone={profile.session==='signed_in'?'success':'warning'}>{profile.session==='signed_in'?'Đã đăng nhập':health[profile.health]??profile.health}</Badge><small>{profile.busy?'Đang xử lý':profile.open?(profile.background?"Trình duyệt chạy nền":"Trình duyệt đang mở"):"Trình duyệt đã đóng"}</small><small>{profile.checkedAt?formatTime(profile.checkedAt):'Chưa kiểm tra phiên'}</small></div>
   <div className="account-actions"><Button tone="neutral" title={musePaused?musePauseHelp:undefined} disabled={musePaused||busy||profile.busy||!profile.enabled} onClick={()=>action('checkProfile',{id:profile.id})}>Đo hạn mức</Button><Button title={musePaused?musePauseHelp:undefined} disabled={musePaused||busy||profile.busy||!profile.enabled||!status.connection} onClick={()=>action('openProfile',{id:profile.id})}>{profile.session==='signed_in'?'Mở Chrome':'Đăng nhập'}</Button><Button tone="ghost" disabled={busy||profile.busy||profile.open} onClick={()=>profileForm(profile)}>Sửa / proxy</Button>{profile.open&&<Button tone="ghost" disabled={busy||profile.busy} onClick={()=>action('closeProfile',{id:profile.id})}>Đóng trình duyệt</Button>}{profile.vpnEnabled&&<Button tone="ghost" title={musePaused?musePauseHelp:undefined} disabled={musePaused||busy||profile.busy||!profile.enabled} onClick={()=>action('openVpn',{id:profile.id})}>Mở VPN</Button>}</div>
 </article>)}</div>
 {!status?.profiles.length&&<Empty title="Thêm tài khoản Muse đầu tiên" text="Tạo hồ sơ rồi đăng nhập trong trình duyệt mở ra."/>}
 <details className="account-advanced"><summary>Cấu hình Muse và dữ liệu</summary><div className="button-row"><Button tone="neutral" disabled={busy} onClick={connectionForm}>Trang Muse</Button><Button tone="neutral" disabled={busy||!status?.connection} onClick={flowForm}>Luồng Muse</Button><Button tone="neutral" disabled={busy} onClick={()=>action('revealWorkspace')}>Thư mục dữ liệu</Button><Badge tone={status?.generationReady?'success':'warning'}>{status?.generationReady?'Luồng Muse đã bật':'Chờ cấu hình Muse'}</Badge></div></details>
 </>}
 {(mode === 'queue' || !!p) && <>
 {p&&<div className="worker-scene-picker"><h3>Giao cảnh cho tác vụ nền</h3><p>Thêm vào tác vụ nền chỉ lưu nháp trên máy. Sau đó duyệt số lượt trước khi gửi Muse.</p><div className="desk-bulk"><PageSelection ids={visible.map(s=>s.id)} selected={selected.keys} onToggle={()=>selected.togglePage(visible.map(s=>s.id))}/><span>{selected.keys.length} cảnh đã chọn</span></div>{visible.map(s=><label key={s.id} className="worker-scene"><input type="checkbox" checked={selected.keys.includes(s.id)} onChange={()=>selected.toggle(s.id)}/><span><strong>{s.name}</strong> · v{s.revision} · {s.ratio} · {s.duration}s<small>{s.storyboardApproved?"Kịch bản đã duyệt":"Cần duyệt kịch bản"} · {s.references.length} tham chiếu</small>{promptWarnings(s,p).map(w=><small key={w}>{w}</small>)}</span></label>)}<Pagination page={sp} total={scenes.length} onPage={setScenePage}/><Button disabled={musePaused||busy||demo||paused||p.paused||!selected.keys.length} busy={busy} onClick={()=>void enqueue()}>Thêm {selected.keys.length} cảnh nháp vào tác vụ nền</Button></div>}
 <QueueBoard status={status} records={records} projectId={projectId} busy={busy} remainingCapacity={remainingBatchCapacity}
   onAction={action} onStart={startForm} onReconcile={reconcileForm}
   onImport={onImport && !demo ? job => void receive(job) : undefined}/></>}<WorkerActivity status={status} projectId={projectId} error={statusError} showMuseStatus={mode!=='accounts'}/></>}
 <Modal open={!!form} title={form?.title??''} description={form?.description} onClose={()=>{setForm(null);setDirty(false);}} dirty={dirty} locked={busy}>{form&&<RecordForm key={form.title+String(form.initial.id??'')} kind="settings" initial={form.initial} fields={form.fields} validation={form.validation} submitLabel={form.submitLabel} onDirty={setDirty} onCancel={()=>setForm(null)} onSave={async v=>{await form.save(v);setDirty(false);setForm(null);}}/>}</Modal>
 </section>;
}

const vpnLabels:Record<string,string>={closed:'đã đóng',installing:'đang cài',connecting:'đang kết nối',connected:'đã kết nối',error:'cần kiểm tra',off:'tắt'};

function MuseQuota({quota}:{quota:DesktopProfile['quota']}) {
  if (!quota) return <span className="muted">Chưa đo</span>;
  const hasReading=typeof quota.weeklyRemainingPercent==='number';
  return <div className="muse-quota">
    {hasReading&&<><strong>Còn {quota.weeklyRemainingPercent}% tuần</strong><progress max={100} value={quota.weeklyRemainingPercent} aria-label="Hạn mức Muse còn lại"/></>}
    {quota.state==='exhausted'&&<small role="status">Hạn mức Muse đã hết theo lần đo này</small>}
    {quota.state!=='available'&&quota.state!=='exhausted'&&<small role="status">{quota.message||'Chưa đọc được hạn mức'}{hasReading?' · đang hiển thị lần đo trước':''}</small>}
    {quota.checkedAt&&<small>Đo lúc {formatTime(quota.checkedAt)}</small>}
    <details><summary>Chi tiết hạn mức</summary><small>{quota.plan} · đã dùng {quota.weeklyUsedPercent ?? '—'}%</small>{quota.resetLabel&&<small>Đặt lại {quota.resetLabel}</small>}{quota.additionalTokens!==null&&quota.additionalTokens!==undefined&&<small>Token bổ sung {new Intl.NumberFormat('vi-VN').format(quota.additionalTokens)}</small>}</details>
  </div>;
}
