"use client";
import {useCallback, useEffect, useState} from 'react';
import {MusePackageButton,MusePacingSettings} from './muse-package';
import {desktopBridge, type DesktopStatus} from '@/lib/lab/desktop-client';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {mediaProviders, mediaProviderDisabled, type MediaProvider} from '@/lib/lab/provider';
import type {Production, Scene} from '@/lib/lab/production';
import {MuseSwitch, musePauseHelp} from './muse-switch';
import {resolveProvider, mediaProviderReceipts} from '@/desktop/src/provider-routing.mjs';
import {Button, Badge, Modal} from './primitives';

type Receipt = {sha256:string;name:string;warning:string;error?:string;metadata:{width:number;height:number;duration:number|null}};
export type ManualStatus = {inbox:string;scenes:{projectId:string;sceneId:string;code:string;state:string;exportedPath:string|null}[];unmatched:Receipt[];errors:{name:string;message:string}[]};
export function useManualMedia(active=true) {
  const [status,setStatus]=useState<ManualStatus|null>(null),[error,setError]=useState('');
  const refresh=useCallback(async()=>{if(!active||!desktopBridge()?.manualMediaStatus)return;try{setStatus(await desktopBridge()!.manualMediaStatus());setError('');}catch(e){setError((e as Error).message);}},[active]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),2500);window.addEventListener('product-lab:workspace-changed',refresh);return()=>{clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',refresh);};},[refresh]);
  return {status,error,refresh};
}
export const skipReconciliationPrompt='Kết quả Muse cũ của cảnh này chưa rõ. App sẽ không gửi lại Muse và cho phép dùng manual. Tiếp tục?';
// Only offered while the scene is blocked by an uncertain Muse receipt; the server re-checks.
export function SkipReconciliation({blocked,disabled,onSkip}:{blocked:boolean;disabled:boolean;onSkip:()=>Promise<unknown>}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!blocked)return null;
  async function confirm(){setBusy(true);setError('');try{await onSkip();setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <>
    <Button tone="neutral" disabled={disabled||busy} onClick={()=>{setError('');setOpen(true);}}>Bỏ qua, không đối soát</Button>
    {error&&!open&&<p role="alert" className="inline-error">{error}</p>}
    <Modal open={open} title="Bỏ qua đối soát Muse" description={skipReconciliationPrompt} locked={busy} onClose={()=>setOpen(false)}>
      <div className="modal-body">{error&&<p role="alert" className="inline-error">{error}</p>}<div className="button-row"><Button busy={busy} disabled={busy} onClick={()=>void confirm()}>Bỏ qua, dùng manual</Button><Button tone="neutral" disabled={busy} onClick={()=>setOpen(false)}>Giữ để đối soát</Button></div></div>
    </Modal>
  </>;
}
export function ProviderSelect({value,paused,disabled,onChange,label}:{value:MediaProvider|'auto';paused:boolean;disabled:boolean;onChange:(value:MediaProvider|'auto')=>void;label:string}) {
  return <label className="manual-provider"><span>{label}</span><select aria-label={label} value={value} disabled={disabled} onChange={e=>onChange(e.target.value as MediaProvider|'auto')}><option value="auto">Tự động theo trạng thái Muse</option>{mediaProviders.map(provider=><option key={provider.id} value={provider.id} disabled={mediaProviderDisabled(provider.id,paused)}>{provider.id==='muse'&&paused?'Muse đang tạm dừng':provider.label}</option>)}</select>{paused&&<small>{musePauseHelp}</small>}</label>;
}
export function ManualMediaSettings({demo=false}:{demo?:boolean}) {
  const {status,refresh}=useDesktopStatus(!demo), manual=useManualMedia(!demo);
  const [path,setPath]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!dirty&&manual.status)setPath(manual.status.inbox);},[manual.status,dirty]);
  async function act(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();await refresh();await manual.refresh();window.dispatchEvent(new Event('product-lab:workspace-changed'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="info-panel manual-settings" aria-label="Cài đặt nhà cung cấp media"><h3>Nhà cung cấp media</h3>
    <MuseSwitch demo={demo}/>
    <MusePacingSettings demo={demo}/>
    {status?.compression&&<p data-testid="compression-settings">Tự nén file mới: bật (video &lt; 6 MB) · Đã tiết kiệm {(status.compression.savedBytes/1024**2).toLocaleString('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1})} MB<br/><small>Video trên 15 giây có thể vượt 6 MB để giữ chất lượng. Gốc mới trong Hộp nhận được đưa vào Thùng rác sau khi nhập và gắn cảnh thành công.</small></p>}
    <label className="field">Hộp nhận media<input aria-label="Đường dẫn Hộp nhận media" value={path} disabled={demo||busy} onChange={e=>{setPath(e.target.value);setDirty(true);}} placeholder="Đường dẫn thư mục trên máy"/></label>
    <Button tone="neutral" disabled={demo||busy||!dirty||!path.trim()||!manual.status} onClick={()=>void act(async()=>{await desktopBridge()!.manualMediaConfigure({inbox:path});setDirty(false);})}>Lưu hộp nhận media</Button>
    {(error||manual.error)&&<p role="alert" className="inline-error">{error||manual.error}</p>}
  </section>;
}
export function ManualToolbar({projectId,production,paused,disabled,manual,onAction,status}:{status?:DesktopStatus|null;projectId:string;production:Production|null;paused:boolean;disabled:boolean;manual:ReturnType<typeof useManualMedia>;onAction:(action:string,input:any)=>Promise<unknown>}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[assignments,setAssignments]=useState<Record<string,string>>({});
  async function act(operation:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await operation();await manual.refresh();window.dispatchEvent(new Event('product-lab:workspace-changed'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const unavailable=disabled||busy||!desktopBridge()?.manualMediaExport;
  const canReceive=(scene:Scene)=>{
    const route=resolveProvider({kind:'media',status,selection:scene.mediaProvider??production?.mediaProvider,
      previous:mediaProviderReceipts({jobs:status?.jobs??[],scene,projectId})});
    return route.provider==='manual'&&!route.blocked;
  };
  return <div className="manual-media-tools">
    <MusePackageButton projectId={projectId} disabled={disabled||paused||busy}/>
    <div className="manual-action-bar">
      <ProviderSelect label="Nhà cung cấp cả dự án" value={production?.mediaProvider??'auto'} paused={paused} disabled={disabled||busy||!production} onChange={provider=>void act(()=>onAction('media_provider',{provider}))}/>
      <Button disabled={unavailable||!production?.scenes.some(scene=>scene.storyboardApproved&&canReceive(scene))} busy={busy} onClick={()=>void act(async()=>{const result=await desktopBridge()!.manualMediaExport({projectId});setMessage(`Đã xuất ${result.scenes.length} cảnh: ${result.path}`);})}>Xuất gói prompt</Button>
      <Button tone="neutral" disabled={unavailable} onClick={()=>void act(async()=>{await desktopBridge()!.manualMediaOpen({projectId});setMessage('Chờ file trong Hộp nhận media. Giữ nguyên mã cảnh khi đặt tên file.');})}>Mở hộp nhận media</Button>
      {paused&&<Badge tone="warning">Muse đang tạm dừng</Badge>}
    </div>
    {message&&<p role="status" className="manual-path">{message}</p>}
    {(error||manual.error)&&<p className="inline-error" role="alert">{error||manual.error}</p>}
    {!!manual.status?.unmatched.length&&<details className="manual-unmatched"><summary>Chưa gắn cảnh ({manual.status.unmatched.length})</summary>{manual.status.unmatched.map(receipt=><div className="manual-unmatched-row" key={receipt.sha256}><span><strong>{receipt.name}</strong><small>manual · {receipt.metadata.width}×{receipt.metadata.height} · {receipt.metadata.duration??'—'} giây{receipt.warning&&` · ${receipt.warning}`}{receipt.error&&` · ${receipt.error}`}</small></span><select aria-label={`Gắn cảnh cho ${receipt.name}`} value={assignments[receipt.sha256]??''} disabled={unavailable} onChange={e=>setAssignments(value=>({...value,[receipt.sha256]:e.target.value}))}><option value="">Chọn cảnh trong dự án</option>{production?.scenes.filter(canReceive).map(scene=><option key={scene.id} value={scene.id}>{manual.status?.scenes.find(row=>row.projectId===projectId&&row.sceneId===scene.id)?.code} · {scene.name}</option>)}</select><Button tone="neutral" disabled={unavailable||!assignments[receipt.sha256]} onClick={()=>void act(()=>desktopBridge()!.manualMediaAssign({sha256:receipt.sha256,projectId,sceneId:assignments[receipt.sha256]}))}>Gắn vào cảnh</Button></div>)}</details>}
    {!!manual.status?.errors.length&&<details><summary>File cần kiểm tra ({manual.status.errors.length})</summary>{manual.status.errors.map(row=><p key={row.name}>{row.name}: {row.message}</p>)}</details>}
  </div>;
}
