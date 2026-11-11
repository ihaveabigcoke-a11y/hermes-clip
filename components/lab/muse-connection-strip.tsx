"use client";

import {ArrowUpRight, PlugZap} from 'lucide-react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {museConnectionSummary} from '@/lib/lab/muse-connection';

export default function MuseConnectionStrip({onNavigate}: {onNavigate: (view: string) => void}) {
  const {status, error} = useDesktopStatus();
  const connection = museConnectionSummary(status, Boolean(desktopBridge()), error);

  return (
    <section className="engine-strip" aria-label="Kết nối Muse" data-connection-state={connection.state}>
      <span className="engine-icon"><PlugZap size={19} aria-hidden="true" /></span>
      <div role="status" aria-live="polite">
        <strong>{connection.title}</strong>
        <p>{connection.description}</p>
      </div>
      <button className="text-link" onClick={() => onNavigate(connection.view)}>
        {connection.action}<ArrowUpRight size={15} aria-hidden="true" />
      </button>
    </section>
  );
}
