"use client";
import {useId, useState} from 'react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {Button, Modal} from './primitives';

export const musePauseHelp = 'Muse đang tạm dừng, bật lại ở Tài khoản Muse';
export function MuseSwitch({demo=false}:{demo?:boolean}) {
  const helpId=useId(),reasonId=useId();
  const {status,refresh}=useDesktopStatus(!demo);
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const paused=status?.musePaused!==false;
  const stopReason=status?.museNight?.stopped
    ? status.museNight.stopReason||'Phiên Muse đã dừng. Giữ các lượt cũ để đối soát; nhập file cho cảnh còn lại.' : '';
  function closeConfirm(){setConfirm(false);setError('');}
  async function save(paused:boolean) {
    if(busy||(!paused&&stopReason))return;setBusy(true);setError('');
    try {
      await desktopBridge()!.setMusePaused({paused});
      await refresh();window.dispatchEvent(new Event('product-lab:workspace-changed'));closeConfirm();
    }catch(failure){setError((failure as Error).message);await refresh().catch(()=>{});}finally{setBusy(false);}
  }
  return <section className="production-card production-card-body muse-switch-card" aria-label="Công tắc Muse">
    <label className="account-toggle muse-switch-control"><input type="checkbox" role="switch" aria-label="Muse: Bật / Tạm dừng" aria-checked={!paused} aria-describedby={[helpId,stopReason?reasonId:''].filter(Boolean).join(' ')} checked={!paused} disabled={demo||busy||!status||(paused&&!!stopReason)}
      onChange={event=>{setError('');if(event.target.checked)setConfirm(true);else void save(true);}}/>
      <span className="muse-switch-copy"><strong role="status">Muse: {paused?'Đang tạm dừng':'Đang bật'}</strong>
        <span id={helpId}>Tạm dừng chặn tác vụ mới; tác vụ đang chạy vẫn hoàn tất.</span>
      </span>
    </label>
    {stopReason&&<p id={reasonId} role="status" className="inline-error">{stopReason}</p>}
    {error&&!confirm&&<p role="alert" className="inline-error">{error}</p>}
    {stopReason&&<a className="lab-button neutral" href="?view=queue">Xem lượt cần đối soát</a>}
    <Modal open={confirm} title="Bật Muse" description="Cho phép tạo mới và chat bằng Muse. Các lượt cũ không tự chạy lại; bạn chọn tác vụ cần chạy." locked={busy} onClose={closeConfirm}>
      <div className="modal-body">
        {(error||stopReason)&&<p role="alert" className="inline-error">{error||stopReason}</p>}
        <div className="button-row"><Button busy={busy} disabled={busy||!!stopReason} onClick={()=>void save(false)}>Bật Muse</Button><Button tone="neutral" disabled={busy} onClick={closeConfirm}>Giữ Tạm dừng</Button></div>
      </div>
    </Modal>
  </section>;
}
