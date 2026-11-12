"use client";
import {useId, useState} from 'react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {Button, Modal} from './primitives';

export const musePauseHelp = 'Muse đang tạm dừng, bật lại ở Tài khoản Muse';
export function MuseSwitch({demo=false}:{demo?:boolean}) {
  const helpId=useId();
  const {status,refresh}=useDesktopStatus(!demo);
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const paused=status?.musePaused!==false;
  async function save(paused:boolean) {
    if(busy)return;setBusy(true);setError('');
    try {
      await desktopBridge()!.setMusePaused({paused});
      await refresh();window.dispatchEvent(new Event('product-lab:workspace-changed'));setConfirm(false);
    }catch(failure){setError((failure as Error).message);}finally{setBusy(false);}
  }
  return <section className="production-card production-card-body muse-switch-card" aria-label="Công tắc Muse">
    <label className="account-toggle muse-switch-control"><input type="checkbox" role="switch" aria-label="Muse: Bật / Tạm dừng" aria-checked={!paused} aria-describedby={helpId} checked={!paused} disabled={demo||busy||!status}
      onChange={event=>event.target.checked?setConfirm(true):void save(true)}/>
      <span className="muse-switch-copy"><strong role="status">Muse: {paused?'Đang tạm dừng':'Đang bật'}</strong>
        <span id={helpId}>Tạm dừng chặn tác vụ mới; tác vụ đang chạy vẫn hoàn tất.</span>
      </span>
    </label>
    {error&&<p role="alert" className="inline-error">{error}</p>}
    <Modal open={confirm} title="Bật Muse" description="Muse chạy bằng trình duyệt tự động; tài khoản có thể bị khoá. Bật?" locked={busy} onClose={()=>setConfirm(false)}>
      <div className="modal-body button-row"><Button busy={busy} disabled={busy} onClick={()=>void save(false)}>Bật Muse</Button><Button tone="neutral" disabled={busy} onClick={()=>setConfirm(false)}>Giữ Tạm dừng</Button></div>
    </Modal>
  </section>;
}
