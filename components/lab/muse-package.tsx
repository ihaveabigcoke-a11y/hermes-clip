"use client";
import {useCallback,useEffect,useState} from 'react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {Button} from './primitives';
type Night={remaining:number;limit:number;submitted:number;successful:number;errors:number;intervalSeconds:number;stopped:boolean;stopReason:string|null};
type Preview={projectId:string;revision:number;count:number;blocked:number;night:Night};
export function MusePackageButton({projectId,disabled}:{projectId:string;disabled:boolean}){
 const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const refresh=useCallback(async()=>{if(!projectId||!desktopBridge()?.musePackagePreview)return;try{setPreview(await desktopBridge()!.musePackagePreview({projectId}));setError('');}catch(e){setError((e as Error).message);}},[projectId]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),5000);window.addEventListener('product-lab:workspace-changed',refresh);return()=>{clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',refresh);};},[refresh]);
 async function send(){if(!preview||busy)return;setBusy(true);setError('');try{const result=await desktopBridge()!.musePackageStart({projectId,revision:preview.revision});setMessage(`Đã xếp ${result.count} lượt Muse. Theo dõi ở Tín hiệu & Phòng chờ.`);await refresh();window.dispatchEvent(new Event('product-lab:workspace-changed'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="info-panel" aria-label="Gói tạo bằng Muse"><strong>Muse · tạo media cho cả gói</strong><p>{preview?`${preview.count} lượt sẽ gửi · Đêm còn ${preview.night.remaining}/${preview.night.limit} lượt · Giãn ${preview.night.intervalSeconds} giây`:'Mở bản desktop để xem số lượt.'}</p>
 <Button disabled={disabled||busy||!preview||!preview.count||!!preview.blocked||preview.night.stopped||preview.count>preview.night.remaining} busy={busy} onClick={()=>void send()}>Tạo bằng Muse</Button>
 {!!preview?.blocked&&<p role="alert">Có kết quả chưa rõ; cần đối soát trước khi gửi.</p>}{preview?.night.stopReason&&<p role="alert">{preview.night.stopReason}</p>}{error&&<p role="alert" className="inline-error">{error}</p>}{message&&<p role="status">{message}</p>}</div>;
}
export function MusePacingSettings({demo=false}:{demo?:boolean}){
 const [seconds,setSeconds]=useState(60),[status,setStatus]=useState<Night|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!demo&&desktopBridge()?.museNightStatus)void desktopBridge()!.museNightStatus().then(s=>{setStatus(s);setSeconds(s.intervalSeconds);}).catch(e=>setError(e.message));},[demo]);
 return <div className="field"><label>Giãn nhịp gói Muse (giây)<input aria-label="Giãn nhịp Muse" type="number" min="60" max="3600" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label><small>Mặc định 60 giây. Mỗi đêm tối đa 12 lượt gửi; số lượt theo profile không giới hạn.</small><Button tone="neutral" disabled={demo||!status} onClick={()=>void desktopBridge()!.saveMusePacing({intervalSeconds:seconds}).then(setStatus).catch(e=>setError(e.message))}>Lưu giãn nhịp</Button>{status&&<p>Đã gửi {status.submitted} · Thành công {status.successful} · Lỗi {status.errors} · Còn {status.remaining} lượt</p>}{status?.stopReason&&<p role="alert">{status.stopReason}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
