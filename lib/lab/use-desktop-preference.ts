"use client";
import {useEffect, useRef, useState} from 'react';
import {desktopBridge} from './desktop-client';

export function useDesktopPreference<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [reloadCount, setReloadCount] = useState(0);
  const loaded = useRef(false);
  const revision = useRef(0);
  const saved = useRef<T>(initial);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const bridge = desktopBridge();
        const stored = bridge?.loadUiState ? await bridge.loadUiState({key}) : JSON.parse(localStorage.getItem('hermes-' + key) ?? 'null');
        if (live) {
          const previous = saved.current;
          if (stored !== null) {
            saved.current = stored;
            setValue(current => JSON.stringify(current) === JSON.stringify(previous) ? stored : current);
          }
          loaded.current = true;
          setError('');
        }
      } catch {if (live) setError('Chưa đọc được thay đổi đã lưu. Nội dung trong phiên vẫn được giữ.');}
      finally {if (live) setReady(true);}
    })();
    return () => {live = false;};
  }, [key, reloadCount]);
  useEffect(() => {
    if (!ready || !loaded.current) return;
    if (JSON.stringify(value) === JSON.stringify(saved.current)) return;
    const current = ++revision.current;
    setSaving(true);
    void (async () => {
      try {
        const bridge = desktopBridge();
        if (bridge?.saveUiState) {
          const patch = ['chatDrafts', 'productionDrafts', 'mediaOrganization'].includes(key);
          const changed = patch ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([name, item]) => JSON.stringify(item) !== JSON.stringify((saved.current as Record<string, unknown>)[name]))) : value;
          await bridge.saveUiState({key, value: changed, patch});
        }
        else localStorage.setItem('hermes-' + key, JSON.stringify(value));
        if (revision.current === current) {saved.current = value; setError('');}
      } catch {if (revision.current === current) setError('Chưa lưu được thay đổi trên máy. Giữ cửa sổ này và thử lưu lại.');}
      finally {if (revision.current === current) setSaving(false);}
    })();
  }, [key, value, ready, retryCount, reloadCount]);
  const pending = saving || (ready && !error && JSON.stringify(value) !== JSON.stringify(saved.current));
  function retry() {
    if (loaded.current) setRetryCount(count => count + 1);
    else {setReady(false); setReloadCount(count => count + 1);}
  }
  return {value, setValue, ready, error, pending, retry};
}
