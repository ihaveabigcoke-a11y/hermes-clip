"use client";
import {useEffect, useRef, useState} from 'react';
import {Button} from './primitives';
import {desktopBridge, type DesktopStatus} from '@/lib/lab/desktop-client';

export default function WorkerActivity({status, projectId, error}: {status: DesktopStatus | null; projectId?: string; error: string}) {
  const [actionError, setActionError] = useState('');
  const [opening, setOpening] = useState(false);
  const log = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  const jobs = status?.jobs.filter(job => !projectId || job.request.projectId === projectId) ?? [];
  const entries = jobs.flatMap(job => job.history.map((event, index) => ({...event, job, key: job.id + '_' + index})))
    .sort((a, b) => a.at - b.at).slice(-80);
  const last = entries.at(-1);
  useEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [last?.key, last?.at]);
  if (!status) return error ? <p role="alert">{error}</p> : null;
  async function showProfile(id: string) {
    setOpening(true);
    setActionError('');
    try {await desktopBridge()!.openProfile({id});}
    catch (error) {setActionError((error as Error).message);}
    finally {setOpening(false);}
  }
  return <section className="worker-activity" aria-label="Nhật ký chạy Muse">
    <details>
      <summary><strong>Nhật ký chạy</strong><span>{last?.note ?? 'Sẵn sàng nhận prompt.'}</span></summary>
      <ol ref={log} role="log" aria-label="Tiến trình tác vụ · giờ Việt Nam" aria-live="polite" aria-relevant="additions"
        onScroll={() => {const element = log.current; if (element) follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;}}>
        {entries.map(entry => <li key={entry.key} data-state={entry.state}>
          <time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleTimeString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}</time>
          <span>{entry.profileId && <b>[{status.profiles.find(profile => profile.id === entry.profileId)?.name ?? 'Hồ sơ Muse'}] </b>}{entry.job.request.name} · {entry.note}</span>
        </li>)}
      </ol>
    </details>
    {status.profiles.some(profile => profile.health === 'login_required') && <div className="worker-login-actions">
      {status.profiles.filter(profile => profile.health === 'login_required').map(profile =>
        <Button key={profile.id} tone="neutral" busy={opening} onClick={() => void showProfile(profile.id)}>Đăng nhập Muse · {profile.name}</Button>)}
    </div>}
    {(error || actionError) && <p role="alert" className="inline-error">{error || actionError}</p>}
  </section>;
}
