"use client";
import {useEffect, useRef, useState} from 'react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {exchangeByteLimit, parseTextExchange, textTaskPrompt, type TextTaskKind} from '@/lib/lab/codex-exchange';
import {Button, Modal} from './primitives';

const labels = {research: 'research', content: 'nội dung', landing: 'landing'};
export default function TextExchange({kind, context, target, disabled, demo, onApply}: {
  kind: TextTaskKind; context: Record<string, unknown>; target: string; disabled: boolean; demo: boolean;
  onApply: (text: string, tool: string, importId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [tool, setTool] = useState('Codex');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [enabled, setEnabled] = useState(false);
  const lock = useRef(false), live = useRef(true), importId = useRef(crypto.randomUUID());
  useEffect(() => {
    live.current = true;
    const refresh = async () => { try { const value = await desktopBridge()?.codexTextSettings?.(); if (live.current) setEnabled(value?.enabled === true); } catch { if (live.current) setEnabled(false); } };
    void refresh(); window.addEventListener('product-lab:codex-settings-changed', refresh);
    return () => { live.current = false; window.removeEventListener('product-lab:codex-settings-changed', refresh); };
  }, []);
  async function action(work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (failure) { if (live.current) setError((failure as Error).message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  return <div className="text-exchange">
    <div className="button-row">
      <Button tone="neutral" disabled={disabled || busy} onClick={() => {setOpen(true); setError('');}}>Nhập kết quả {labels[kind]}</Button>
      <Button tone="neutral" disabled={disabled || busy} onClick={() => void action(async () => {await navigator.clipboard.writeText(textTaskPrompt(kind, context)); setNotice('Đã copy prompt ' + labels[kind] + '.');})}>Copy prompt {labels[kind]}</Button>
      <Button tone="neutral" disabled={disabled || busy || demo || !enabled} onClick={() => void action(async () => {
        const result = await desktopBridge()!.codexTextRun({kind, context});
        if (!live.current) return;
        setText(result.text); setTool('Codex CLI'); importId.current = crypto.randomUUID(); setOpen(true);
        parseTextExchange(kind, result.text, 'Codex CLI');
      })}>{busy ? 'Đang xử lý…' : 'Chạy Codex CLI'}</Button>
    </div>
    <p className="field-help">{target} · {enabled ? 'Codex CLI đã bật; dùng phiên đăng nhập và hạn mức gói hiện có.' : 'Codex CLI mặc định tắt; bật trong Cài đặt nếu muốn dùng.'}</p>
    {notice && <p role="status">{notice}</p>}
    {error && !open && <p className="inline-error" role="alert" style={{whiteSpace:'pre-wrap'}}>{error}</p>}
    <Modal open={open} title={'Nhập kết quả ' + labels[kind]} description={target} locked={busy} dirty={!!text} onClose={() => setOpen(false)}>
      <div className="modal-body">
        <label className="field">Công cụ tạo JSON<input value={tool} maxLength={80} disabled={busy} onChange={event => setTool(event.target.value)} placeholder="Codex, Claude, Gemini Deep Research…"/></label>
        <label className="field">Chọn file JSON (tối đa 384 KB)<input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void action(async () => {if (file.size > exchangeByteLimit) throw Error('JSON: file vượt 384 KB.'); setText(await file.text()); importId.current = crypto.randomUUID();});
        }}/></label>
        <label className="field">Dán JSON<textarea rows={12} value={text} disabled={busy} onChange={event => {setText(event.target.value); importId.current = crypto.randomUUID();}}/></label>
        <p>Giữ null khi chưa biết. Nhập toàn bộ đối tượng JSON, không kèm phần tóm tắt. Nội dung và landing sẽ mở thành bản nháp để duyệt.</p>
        {error && <p className="inline-error" role="alert" style={{whiteSpace:'pre-wrap'}}>{error}</p>}
        <div className="button-row"><Button disabled={disabled || busy || !text.trim()} onClick={() => void action(async () => {
          parseTextExchange(kind, text, tool);
          await onApply(text, tool, importId.current);
          setText(''); setOpen(false); setNotice('Đã nhận kết quả ' + labels[kind] + '.');
        })}>Kiểm tra và nhập JSON</Button><Button tone="ghost" disabled={busy} onClick={() => setOpen(false)}>Đóng</Button></div>
      </div>
    </Modal>
  </div>;
}

export function CodexTextSettings({demo}: {demo: boolean}) {
  const [enabled, setEnabled] = useState(false), [executable, setExecutable] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {let live = true; void desktopBridge()?.codexTextSettings?.().then(value => {
    if (live) {setEnabled(value.enabled === true); setExecutable(value.executable ?? '');}
  }).catch(failure => {if (live) setError(failure.message);}); return () => {live = false;};}, []);
  return <section className="production-card production-card-body">
    <h3>Research và nội dung bằng Codex CLI</h3>
    <p>Không cần Muse hoặc khóa API. Dùng phiên đăng nhập Codex CLI và hạn mức gói của bạn; app không mua thêm lượt. Mỗi lượt tối đa 3 phút, đầu ra tối đa 2 MB, JSON tối đa 384 KB.</p>
    <label className="field"><span><input type="checkbox" checked={enabled} disabled={busy || demo} onChange={event => setEnabled(event.target.checked)}/> Bật Codex CLI (mặc định tắt)</span></label>
    <label className="field">Đường dẫn Codex native (không bắt buộc)<input value={executable} disabled={busy || demo} maxLength={2000} onChange={event => setExecutable(event.target.value)} placeholder="Để trống để tìm codex.exe trong PATH"/></label>
    <Button disabled={busy || demo || !desktopBridge()?.saveCodexTextSettings} onClick={async () => {
      setBusy(true); setError(''); setNotice('');
      try {await desktopBridge()!.saveCodexTextSettings({enabled, executable}); window.dispatchEvent(new Event('product-lab:codex-settings-changed')); setNotice('Đã lưu cấu hình Codex CLI.');}
      catch (failure) {setError((failure as Error).message);} finally {setBusy(false);}
    }}>Lưu cấu hình Codex CLI</Button>
    {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
