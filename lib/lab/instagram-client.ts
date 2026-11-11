"use client";
import {useEffect, useState} from 'react';
import {desktopBridge} from './desktop-client';

export type InstagramProfile = {
  id: string; productId: string; name: string; handle: string; userId: string; session: string;
  open: boolean; busy: boolean; background: boolean; checkedAt: number | null; error: string;
  vpnEnabled: boolean; vpn: {state?: string}; proxy: {server: string; username: string; hasPassword: boolean};
};
export type InstagramJob = {
  id: string; state: string; createdAt: number; updatedAt: number; handle: string; postUrl: string; error: string; syncError: string;
  snapshot: {planId: string; accountId: string; productId: string; assetId: string; caption: string; name: string};
  history: {at: number; state: string; note: string}[];
};
export type InstagramMetricState = {planId:string;state:string;failures:number;lastAttemptAt:number|null;lastSuccessAt:number|null;nextAttemptAt:number|null;error:string};
export type InstagramStatus = {profiles: InstagramProfile[]; jobs: InstagramJob[]; active: string | null;
  metrics?:{intervalMs:number;active:string|null;rows:InstagramMetricState[]}};

export function useInstagramStatus(enabled: boolean) {
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const bridge = desktopBridge();
        if (!bridge?.instagramStatus) throw Error('Mở bản desktop đã cập nhật để quản lý trình duyệt Instagram.');
        const value = await bridge.instagramStatus();
        if (live) {setStatus(value); setError('');}
      } catch (reason) {if (live) setError((reason as Error).message);}
      finally {if (live) timer = setTimeout(poll, 2500);}
    }
    void poll();
    return () => {live = false; clearTimeout(timer);};
  }, [enabled, revision]);
  return {status, error, refresh: () => setRevision(value => value + 1)};
}
