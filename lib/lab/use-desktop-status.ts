"use client";
import {useCallback, useEffect, useState} from 'react';
import {desktopBridge, type DesktopStatus} from './desktop-client';

export function useDesktopStatus(active = true, poll = true) {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const bridge = desktopBridge();
    if (!bridge) return;
    const next = await bridge.status();
    setStatus(next);
    setError('');
  }, []);
  useEffect(() => {
    let live = true;
    const update = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      try {
        const next = await desktopBridge()?.status();
        if (live && next) {setStatus(next); setError('');}
      } catch {
        if (live) setError("Chưa đọc được tác vụ nền. App sẽ kiểm tra lại.");
      }
    };
    void update();
    const timer = poll ? setInterval(update, 1500) : undefined;
    window.addEventListener('product-lab:workspace-changed', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('product-lab:workspace-changed', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [active, poll]);
  return {status, error, refresh};
}
