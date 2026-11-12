"use client";
import {uiCopy} from '@/desktop/src/ui-copy.mjs';
import {useEffect, useRef, useState} from 'react';
import {ArrowUp, Download, MessageSquare, Pin, Plus, RefreshCw} from 'lucide-react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {useDesktopPreference} from '@/lib/lab/use-desktop-preference';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {formatTime, type LabRecord} from '@/lib/lab/domain';
import {mediaCatalog, museConversationTitle} from '@/lib/lab/media-catalog';
import {Button, Empty, SearchBox} from './primitives';
import {downloadOwnedMedia} from './workbench-controls';
import {MediaPlayer, MediaThumbnail} from './media-preview';
import MuseResponse from './muse-response';

export type Chat = {
  requestId: string; profileId: string; projectId: string; prompt: string;
  provider?:'muse'; response: string; state: string; error: string | null; providerUrl: string | null;
  parentId?: string | null; createdAt?: number; updatedAt?: number; pinned?: boolean;
};
const labels: Record<string, string> = {
  preparing: "Đang mở hồ sơ", waiting: 'Đang chờ Muse', done: 'Đã nhận phản hồi Muse',
  failed: 'Gửi chưa bắt đầu', needs_attention: 'Cần đối soát kết quả',
};
const threadKey = (chat: Chat) => chat.profileId + ':' + (chat.providerUrl?.match(/\/thread\/(?!new(?:\/|$))/) ? chat.providerUrl : chat.parentId || chat.requestId);

export default function MuseChatPanel({projectId = 'general', demo = false, active = true, initialPrompt = '', onResponse, autoApply = false, responseLabel = 'Dùng phản hồi cho bản nháp', records = [], onCompose}: {
  projectId?: string; demo?: boolean; active?: boolean; initialPrompt?: string;
  onResponse?: (text: string, chat: Chat) => void | Promise<void>;
  autoApply?: boolean; responseLabel?: string; records?: LabRecord[];
  onCompose?: (mode: 'video' | 'image', prompt: string, projectId: string) => void;
}) {
  const studio = !onResponse;
  const {status, refresh, error: statusError} = useDesktopStatus(active && !demo);
  const [history, setHistory] = useState<Chat[]>([]);
  const selectionPreference = useDesktopPreference<{profileId: string; requestId: string | null}>('chatSelection', {profileId:'', requestId:null});
  const draftPreference = useDesktopPreference<Record<string, string>>('chatDrafts', {});
  const [compactSelection, setCompactSelection] = useState<{profileId: string; requestId: string | null}>({profileId:'',requestId:null});
  const selection = studio ? selectionPreference.value : compactSelection;
  const setSelection = studio ? selectionPreference.setValue : setCompactSelection;
  const profileId = selection.profileId;
  const selectedId = selection.requestId;
  const drafts = draftPreference.value;
  const setDrafts = draftPreference.setValue;
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<string[]>([]);
  const [mode, setMode] = useState<'chat' | 'image' | 'video'>('chat');
  const [mediaProject, setMediaProject] = useState('');
  const [mediaType, setMediaType] = useState('all');
  const [mediaId, setMediaId] = useState('');
  const submitting = useRef(false);
  const sendAttempt = useRef<{fingerprint: string; requestId: string} | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const historyBox = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const profiles = status?.profiles ?? [];
  const current = history.find(chat => chat.requestId === selectedId);
  const selectedProfileId = current?.profileId || profileId || profiles.find(profile => profile.enabled && profile.session === 'signed_in')?.id || profiles.find(profile => profile.enabled)?.id || '';
  const selectedProfile = profiles.find(profile => profile.id === selectedProfileId);
  const count = status?.batch?.submittedByProfile[selectedProfileId] ?? 0;
  const pending = history.some(chat => chat.profileId === selectedProfileId && ['preparing', 'waiting'].includes(chat.state));
  const draftKey = projectId + ':' + (current ? threadKey(current) : 'new:' + selectedProfileId);
  const prompt = drafts[draftKey] ?? initialPrompt;
  const conversation = current ? history.filter(chat => threadKey(chat) === threadKey(current)) : [];
  const last = conversation.at(-1);
  const parentId = last?.state === 'done' ? last.requestId : null;
  const groups = new Map<string, Chat[]>();
  for (const chat of history.filter(chat => chat.profileId === selectedProfileId)) {
    const key = threadKey(chat);
    groups.set(key, [...(groups.get(key) ?? []), chat]);
  }
  const threads = [...groups.values()].sort((a, b) => Number(b[0].pinned) - Number(a[0].pinned) || (b.at(-1)?.createdAt ?? 0) - (a.at(-1)?.createdAt ?? 0))
    .filter(rows => rows.some(chat => `${chat.prompt} ${chat.response}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))));
  const projects = records.filter(record => record.kind === 'production');
  const project = projects.find(record => record.id === mediaProject) ?? projects.find(record => record.id === current?.projectId) ?? projects[0];
  const media = mediaCatalog(records).filter(entry => entry.project.id === project?.id && (mediaType === 'all' || entry.take.type.startsWith(mediaType + '/')));
  const selectedMedia = media.find(entry => entry.key === mediaId);

  async function readHistory() {
    const rows = await desktopBridge()?.museChatList?.(studio ? {} : {projectId});
    if (rows) setHistory(rows);
  }
  useEffect(() => {
    if (demo || !active) return;
    let live = true;
    let reading = false;
    const update = async () => {
      if (reading) return;
      reading = true;
      try {
        const rows = await desktopBridge()?.museChatList?.(studio ? {} : {projectId});
        if (live && rows) setHistory(rows);
      } catch (reason) { if (live) setError((reason as Error).message); }
      finally { reading = false; if (live) setLoading(false); }
    };
    void update();
    const timer = setInterval(update, 1500);
    return () => { live = false; clearInterval(timer); };
  }, [projectId, demo, active, studio]);
  useEffect(() => {
    if (follow.current && historyBox.current) historyBox.current.scrollTop = historyBox.current.scrollHeight;
  }, [last?.requestId, last?.state, last?.response]);
  function select(chat: Chat | null, profile = selectedProfileId) {
    setSelection({profileId: profile, requestId: chat?.requestId ?? null});
    follow.current = true;
  }
  async function apply(chat: Chat) {
    await onResponse?.(chat.response, chat);
    setApplied(value => [...value, chat.requestId]);
  }
  async function action(task: () => Promise<unknown>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try { await task(); }
    catch (reason) { setError((reason as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function run(recoverId?: string) {
    const bridge = desktopBridge();
    if (!bridge?.museChatSend) return;
    if (!recoverId && (!prompt.trim() || prompt.length > 16000 || pending || last?.state === 'needs_attention' || !selectedProfile?.enabled || selectedProfile.busy)) return;
    const submittedPrompt = prompt;
    const submittedKey = draftKey;
    await action(async () => {
      const scope = current?.projectId ?? projectId;
      const fingerprint = JSON.stringify([scope, selectedProfileId, prompt, parentId]);
      if (!sendAttempt.current || sendAttempt.current.fingerprint !== fingerprint) sendAttempt.current = {fingerprint, requestId: crypto.randomUUID()};
      if (!recoverId) setSelection({profileId:selectedProfileId, requestId:sendAttempt.current.requestId});
      const result: Chat = recoverId
        ? await bridge.museChatRecover({requestId: recoverId})
        : await bridge.museChatSend({requestId: sendAttempt.current.requestId, projectId: scope, profileId: selectedProfileId, prompt: submittedPrompt, parentId});
      await readHistory();
      select(result, result.profileId);
      if (result.state === 'done') {
        sendAttempt.current = null;
        if (!recoverId) setDrafts(value => ({...value, [submittedKey]: '', [projectId + ':' + threadKey(result)]: ''}));
        if (autoApply && onResponse) await apply(result);
      } else setError(result.error ?? labels[result.state]);
      await refresh();
    });
    input.current?.focus();
  }
  function submit() {
    if (mode === 'chat') void run();
    else if (project && prompt.trim()) onCompose?.(mode, prompt, project.id);
  }
  const unavailable = demo || busy || !selectionPreference.ready || !draftPreference.ready || !desktopBridge()?.museChatSend;
  return <section className={studio ? 'muse-studio' : 'muse-chat-panel'} aria-label={uiCopy.chat}>
    <aside className="muse-conversations">
      <header><h2><MessageSquare size={19}/>Hội thoại</h2><Button tone="ghost" aria-label="Tải lại hội thoại" disabled={unavailable} onClick={() => void action(readHistory)}><RefreshCw size={16}/></Button></header>
      <label className="field">{uiCopy.accounts}<select aria-label="Hồ sơ Muse" value={selectedProfileId} disabled={busy || demo || !selectionPreference.ready} onChange={event => select(null, event.target.value)}>
        {!profiles.length && <option value="">Thêm hồ sơ trong Tài khoản</option>}
        {profiles.map(profile => <option value={profile.id} key={profile.id}>{profile.name}{profile.enabled ? '' : ' · đã tắt'}</option>)}
      </select></label>
      <Button disabled={unavailable} onClick={() => { select(null); input.current?.focus(); }}><Plus size={16}/>Hội thoại mới</Button>
      <SearchBox value={query} onChange={setQuery} placeholder="Tìm hội thoại…"/>
      <small>Hội thoại đã lưu trong Hermes Clip</small>
      <div className="muse-thread-list">
        {loading && !demo && <p role="status">Đang đọc hội thoại…</p>}
        {threads.map(rows => <div className="muse-thread-row" key={threadKey(rows[0])}>
          <button className="muse-thread" data-request-id={rows[0].requestId} aria-pressed={!!current && threadKey(current) === threadKey(rows[0])} onClick={() => select(rows.at(-1)!)}>
            <strong>{rows[0].pinned && <Pin size={12}/>} {museConversationTitle(rows[0])}</strong>
            <span>{rows.at(-1)?.response.startsWith('{') ? labels[rows.at(-1)!.state] : rows.at(-1)?.response.slice(0, 100) || labels[rows.at(-1)!.state]}</span>
            <small>{rows.length} lượt · {rows.at(-1)?.createdAt ? formatTime(rows.at(-1)!.createdAt!) : 'Đã lưu'}</small>
          </button>
          <Button tone="ghost" aria-label={rows[0].pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'} disabled={unavailable} onClick={() => void action(async () => {await desktopBridge()!.museChatPin({requestId: rows[0].requestId, pinned: !rows[0].pinned}); await readHistory();})}><Pin size={14}/></Button>
        </div>)}
        {!loading && !threads.length && <p>{query ? 'Không tìm thấy hội thoại.' : 'Gửi tin nhắn để bắt đầu.'}</p>}
      </div>
    </aside>
    <div className="muse-conversation">
      {status?.musePaused!==false&&<p className="field-help">Muse đang tạm dừng, bật lại ở Tài khoản Muse</p>}
      <header><div><h2>{current ? 'Cuộc trò chuyện với Muse' : 'Cuộc trò chuyện mới'}</h2><small>{selectedProfile?.name || "Chưa có hồ sơ"} · Đã gửi {count} lượt trong đợt</small></div>
        {current?.providerUrl && <Button tone="neutral" disabled={unavailable || status?.musePaused!==false || selectedProfile?.busy} onClick={() => void action(() => desktopBridge()!.museChatOpen({requestId: current.requestId}))}>Mở trong Chrome</Button>}
      </header>
      <div ref={historyBox} className="muse-chat-history" onScroll={() => {const el = historyBox.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;}}>
        {!conversation.length && <Empty title="Muse trong không gian làm việc của bạn" text="Chọn hội thoại để chat tiếp, hoặc nhập ý tưởng bên dưới."/>}
        {conversation.map(chat => <article className="muse-message" key={chat.requestId}>
          <div className="muse-user-message"><small>Bạn · {profiles.find(profile => profile.id === chat.profileId)?.name ?? "Hồ sơ đã lưu"}{chat.createdAt ? ' · ' + formatTime(chat.createdAt) : ''}</small><details open={chat.prompt.length < 1200}><summary>Nội dung đã gửi</summary><p className="muse-chat-text">{chat.prompt}</p></details></div>
          <div className="muse-assistant-message"><h3>Muse</h3><small>Nhà cung cấp: muse</small>{chat.response ? <MuseResponse text={chat.response}/> : <p role="status">{labels[chat.state]}</p>}
            {chat.error && <p className="inline-error">{chat.error}</p>}
            {chat.state === 'needs_attention' && <Button tone="neutral" busy={busy} disabled={status?.musePaused!==false} onClick={() => void run(chat.requestId)}>{status?.musePaused!==false?"Muse đang tạm dừng":"Đọc lại kết quả"}</Button>}
            {chat.state === 'done' && onResponse && <Button disabled={busy || applied.includes(chat.requestId)} onClick={() => void action(() => apply(chat))}>{applied.includes(chat.requestId) ? 'Đã áp dụng phản hồi' : responseLabel}</Button>}
          </div>
        </article>)}
      </div>
      <form className="muse-composer" noValidate onSubmit={event => {event.preventDefault(); submit();}}>
        {busy && <p role="status">Đang xử lý trên hồ sơ {selectedProfile?.name}…</p>}
        {(error || statusError || selectionPreference.error || draftPreference.error) && <p role="alert" className="inline-error">{error || statusError || selectionPreference.error || draftPreference.error}</p>}
        {!desktopBridge() && <p>Mở Hermes Clip trên máy để dùng hồ sơ Muse.</p>}
        <label className="field"><span className="sr-only">Tin nhắn cho Muse</span><textarea ref={input} aria-label="Tin nhắn cho Muse" value={prompt} rows={4} maxLength={16000} disabled={unavailable}
          onChange={event => setDrafts(value => ({...value, [draftKey]: event.target.value}))}
          onKeyDown={event => {if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); submit();}}}
          placeholder="Nhập ý tưởng… Enter để gửi, Shift+Enter xuống dòng"/></label>
        <div className="muse-composer-tools"><div className="segmented" aria-label="Chế độ Muse">
          <button type="button" aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}>Chat AI</button>
          {studio && onCompose && <><button type="button" aria-pressed={mode === 'image'} onClick={() => setMode('image')}>Tạo ảnh</button><button type="button" aria-pressed={mode === 'video'} onClick={() => setMode('video')}>Tạo video</button></>}
        </div><Button type="submit" busy={busy} disabled={unavailable || (mode==='chat'&&status?.musePaused!==false) || !prompt.trim() || prompt.length > 16000 || (mode === 'chat' ? pending || last?.state === 'needs_attention' || !selectedProfile?.enabled || !!selectedProfile.busy : !project)}><ArrowUp size={17}/>{mode === 'chat' ? (status?.musePaused!==false?'Muse đang tạm dừng':'Gửi Muse') : 'Mở bản nháp'}</Button></div>
        <small>{mode === 'chat' ? "Hermes không giới hạn số lượt. Xem hạn mức thực tế tại Tài khoản Muse." : 'Chọn ảnh tham chiếu và duyệt bản nháp trong màn tạo nội dung.'}</small>
      </form>
    </div>
    {studio && <aside className="muse-media"><header><h2>Ảnh và video dự án</h2><span>{media.length}</span></header>
      <label className="field">Dự án<select value={project?.id ?? ''} onChange={event => {setMediaProject(event.target.value); setMediaId('');}}>{!projects.length && <option value="">Tạo dự án trước</option>}{projects.map(record => <option key={record.id} value={record.id}>{record.data.name}</option>)}</select></label>
      <div className="segmented">{[['all', 'Tất cả'], ['image', 'Ảnh'], ['video', 'Video']].map(([value, label]) => <button key={value} type="button" aria-pressed={mediaType === value} onClick={() => {setMediaType(value); setMediaId('');}}>{label}</button>)}</div>
      <div className="muse-media-list">{selectedMedia && <MediaPlayer take={selectedMedia.take}/>}{media.map(entry => <button className="muse-media-item" aria-pressed={mediaId === entry.key} key={entry.key} onClick={() => setMediaId(entry.key)}><MediaThumbnail take={entry.take}/><span>{entry.scene.name}<small>{entry.take.metadata.width}×{entry.take.metadata.height} · {entry.take.metadata.duration ?? '—'}s</small></span></button>)}{!media.length && <p>Kết quả đã tải về của dự án sẽ xuất hiện tại đây.</p>}</div>
      <Button tone="neutral" disabled={!selectedMedia || busy} onClick={() => void action(() => downloadOwnedMedia(selectedMedia!.take.assetId, selectedMedia!.take.name))}><Download size={16}/>Tải file đã chọn</Button>
    </aside>}
  </section>;
}
