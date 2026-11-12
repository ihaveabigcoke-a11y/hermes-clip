"use client";
import {useEffect,useState} from 'react';
import {desktopBridge,type DesktopProfile,type DesktopBatch} from '@/lib/lab/desktop-client';
import {Badge,Button} from './primitives';
type Item={productId:string;name:string;projectId?:string;sceneId?:string;state:string;step?:string;error?:string;assetId?:string};
type Run={id:string;batchId:string;profileName:string;state:string;error?:string;items:Item[]};
const labels:Record<string,string>={queued:'Chờ tạo',preparing:'Chuẩn bị cảnh',running:'Đang xử lý',paused:'Tạm dừng',needs_attention:'Cần kiểm tra',ready_for_review:'Chờ duyệt video'};
export default function ProductDeploymentPanel({batchId,profiles,profileId,onProfile,batch,selectedCount}:{batchId:string;profiles:DesktopProfile[];profileId:string;onProfile:(id:string)=>void;batch?:DesktopBatch|null;selectedCount:number}){
 const [runs,setRuns]=useState<Run[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true,timer:ReturnType<typeof setTimeout>|undefined;
  async function refresh(){clearTimeout(timer);try{const api=desktopBridge();if(!api?.deploymentStatus)return;const status=await api.deploymentStatus();if(!live)return;setRuns(status.runs.filter((r:Run)=>r.batchId===batchId));if(status.active)timer=setTimeout(refresh,2500);}catch(e){if(live)setError((e as Error).message);}}
  void refresh();window.addEventListener('product-lab:workspace-changed',refresh);return()=>{live=false;clearTimeout(timer);window.removeEventListener('product-lab:workspace-changed',refresh);};
 },[batchId]);
 async function act(method:string,id:string){setBusy(true);setError('');try{await desktopBridge()?.[method]({id});window.dispatchEvent(new Event('product-lab:workspace-changed'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const enabled=profiles.filter(p=>p.enabled);
 const used=batch?.submittedByProfile[profileId]??0;
 return <section className="production-card" aria-label="Triển khai video tự động"><div className="production-card-body">
  <div className="production-heading"><div><h3>Tự động đến bước duyệt video</h3><p>Mỗi sản phẩm: một video dọc 10 giây từ ảnh và hồ sơ đã chọn. App tự chuẩn bị cảnh theo mẫu, tạo qua Muse, tải và nhập Thư viện. Bạn duyệt video cuối.</p></div><label>Hồ sơ Muse<select aria-label="Hồ sơ Muse triển khai" value={profileId} disabled={busy||runs.some(r=>['queued','running'].includes(r.state))} onChange={e=>onProfile(e.target.value)}>{!enabled.length&&<option value="">Thêm hồ sơ Muse</option>}{enabled.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
  <p role="status">Đã gửi {used} lượt trong đợt · Đã chọn {selectedCount} sản phẩm. Hermes không giới hạn số lượt; hạn mức thực tế do Muse cung cấp.</p>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {runs.slice(0,5).map(run=><div key={run.id}><div className="button-row"><Badge>{labels[run.state]??run.state}</Badge><span>{run.items.filter(i=>i.state==='ready_for_review').length}/{run.items.length} video · {run.profileName}</span>{['queued','running'].includes(run.state)?<Button tone="neutral" disabled={busy} onClick={()=>void act('deploymentPause',run.id)}>Tạm dừng</Button>:run.state!=='ready_for_review'&&<Button tone="neutral" disabled={busy} onClick={()=>void act('deploymentResume',run.id)}>Tiếp tục cùng đợt</Button>}</div>{run.error&&<p className="inline-error">{run.error}</p>}
   <div className="operations-table-scroll" role="region" aria-label="Tiến độ theo sản phẩm" tabIndex={0}><table className="operations-comparison"><caption className="sr-only">Tiến độ theo sản phẩm</caption><thead><tr><th scope="col">Sản phẩm</th><th scope="col">Tiến độ</th><th scope="col">Kết quả</th></tr></thead><tbody>{run.items.map(item=><tr key={item.productId}><th scope="row">{item.name}</th><td>{labels[item.state]??item.state}<small>{item.error||item.step}</small></td><td>{item.projectId&&<a href={item.assetId?`/?view=library&lib_asset=${encodeURIComponent(item.assetId)}&lib_product=${encodeURIComponent(item.productId)}&lib_type=video&lib_category=all&lib_review=pending`:`/?view=production&production=${item.projectId}&stage=scenes`}>{item.assetId?'Xem và duyệt video':'Xem cảnh'}</a>}</td></tr>)}</tbody></table></div></div>)}
 </div></section>;
}
