"use client";

import {useEffect, useRef, useState} from 'react';
import {Pause, Play, FileVideo, Image as ImageIcon} from 'lucide-react';
import {uiCopy, reviewLabels} from '@/desktop/src/ui-copy.mjs';
import {formatTime, type LabRecord} from '@/lib/lab/domain';
import {groupQueueJobs, matchesQueueFilter, resolvedQueueFailures, queueAction, queueFilters, queueTone, queueTakeSelections, type QueueFilter} from '@/lib/lab/queue-view';
import {mediaCatalog, mediaReview} from '@/lib/lab/media-catalog';
import {sceneKey, sceneCategory, matchesMediaPeriod, type MediaOrganization, type MediaScope, type MediaPeriod} from '@/lib/lab/media-organization';
import {useDesktopPreference} from '@/lib/lab/use-desktop-preference';
import type {DesktopJob, DesktopStatus} from '@/lib/lab/desktop-client';
import {Badge, Button, Empty, Modal, Pagination, SearchBox} from './primitives';

type Props = {
  status: DesktopStatus | null;
  records: LabRecord[];
  projectId?: string;
  busy: boolean;
  remainingCapacity: number;
  onAction: (method: string, value?: {id: string}) => Promise<unknown>;
  onStart: (jobs: DesktopJob[]) => void;
  onReconcile: (job: DesktopJob) => void;
  onImport?: (job: DesktopJob) => void;
};

const actionLabels = {
  start: 'Duyệt và chạy', retry: uiCopy.newAttempt, resume: 'Lấy tiếp kết quả cũ',
  reconcile: 'Kiểm tra kết quả', result: 'Xem kết quả', details: 'Xem tiến trình',
  recheckResult: 'Kiểm tra lại trên Muse',
};

export default function QueueBoard({status, records, projectId, busy, remainingCapacity, onAction, onStart, onReconcile, onImport}: Props) {
  const organization = useDesktopPreference<MediaOrganization>('mediaOrganization', {});
  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [category, setCategory] = useState<MediaScope>('content');
  const [productId, setProductId] = useState('all');
  const [mediaType, setMediaType] = useState('all');
  const [period, setPeriod] = useState<MediaPeriod>('all');
  const [attemptId, setAttemptId] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [profileId, setProfileId] = useState('all');
  const [batchOnly, setBatchOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [compact, setCompact] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const rows = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const update = () => {setCompact(media.matches); setDetailOpen(false);};
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const jobs = status?.jobs.filter(job => !projectId || job.request.projectId === projectId) ?? [];
  const resolvedFailures = resolvedQueueFailures(jobs);
  const catalog = mediaCatalog(records);
  const products = records.filter(record => record.kind === 'product');
  const takeSelections = queueTakeSelections(records, projectId).filter(item=>productId==='all'||item.productId===productId);
  const categoryJobs = jobs.filter(job => category === 'all' || sceneCategory(organization.value, job.request.projectId, job.request.sceneId) === category);
  const scoped = categoryJobs.filter(job => {
    const profile = status?.profiles.find(profile => profile.id === job.profileId);
    const product = products.find(product => product.id === job.request.productId);
    const searchable = [job.request.name, product?.data.name, profile?.name, job.id, job.providerId].join(' ').toLocaleLowerCase('vi');
    return (!batchOnly || !!status?.batch && job.submitBatchId === status.batch.id)
      && (productId === 'all' || job.request.productId === productId)
      && (mediaType === 'all' || job.request.mediaType === mediaType)
      && matchesMediaPeriod(job.createdAt, period)
      && (profileId === 'all' || (profileId === 'unassigned' ? !job.profileId : job.profileId === profileId))
      && searchable.includes(query.trim().toLocaleLowerCase('vi'));
  });
  const filtered = scoped.filter(job => matchesQueueFilter(job, filter, resolvedFailures));
  const groups = groupQueueJobs(filtered);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(groups.length / 8)));
  const visible = groups.slice((currentPage - 1) * 8, currentPage * 8);
  const selectedGroup = visible.find(group => group.key === selectedId) ?? visible[0];
  const attempts = jobs.filter(job => sceneKey(job.request.projectId, job.request.sceneId) === selectedGroup?.key)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const selected = attempts.find(job => job.id === attemptId) ?? selectedGroup?.latest;
  const queued = filtered.filter(job => job.state === 'queued');
  const canStart = !busy && organization.ready && !!status?.generationReady && !status?.storage?.blocked && remainingCapacity > 0;
  const filteredScope = !['pending', 'history'].includes(filter) || query.trim() || profileId !== 'all' || batchOnly || productId !== 'all' || mediaType !== 'all' || period !== 'all';

  function resetPage() {
    if (rows.current) rows.current.scrollTop = 0;
    setPage(1);
    setSelectedId('');
    setAttemptId('');
    setDetailOpen(false);
  }
  function openDetails(job: DesktopJob) {
    setSelectedId(sceneKey(job.request.projectId, job.request.sceneId));
    setAttemptId(job.id);
    setDetailOpen(true);
    if (!compact) requestAnimationFrame(() => detailHeading.current?.focus({preventScroll: true}));
  }
  async function primaryAction(job: DesktopJob) {
    const action = queueAction(job);
    if (action === 'start') onStart([job]);
    else if (action === 'retry') {
      const retry = await onAction(action, {id: job.id}) as DesktopJob | undefined;
      if (retry?.state === 'queued' && retry.request?.sceneId === job.request.sceneId) {
        setFilter('pending');
        setProfileId('all');
        setBatchOnly(false);
        setQuery('');
        setPage(1);
        openDetails(retry);
        setMessage('Đã thêm một lượt nháp. Chọn Duyệt và chạy để gửi Muse.');
      }
    }
    else if (action === 'resume' || action === 'recheckResult') await onAction(action, {id: job.id});
    else if (action === 'reconcile') onReconcile(job);
    else openDetails(job);
  }
  function actionButton(job: DesktopJob) {
    const action = queueAction(job);
    const museBlocked=status?.musePaused!==false&&['start','resume','recheckResult'].includes(action);
    const disabled = museBlocked || busy || (action === 'start' && !canStart);
    return <Button tone="neutral" disabled={disabled} onClick={() => void primaryAction(job)}>{museBlocked?'Muse đang tạm dừng':actionLabels[action]}</Button>;
  }

  function reviewLabel(job: DesktopJob) {
    if (job.importError || job.state !== 'ready') return job.label;
    const entry = catalog.find(entry => entry.take.assetId === job.uploadedAssetId);
    return entry ? reviewLabels[mediaReview(entry)] : job.label;
  }
  function resultTone(job: DesktopJob) {
    if (job.importError || job.state !== 'ready') return queueTone(job);
    const entry = catalog.find(entry => entry.take.assetId === job.uploadedAssetId);
    if (!entry) return queueTone(job);
    const review = mediaReview(entry);
    return review === 'approved' ? 'success' : review === 'rejected' ? 'danger' : 'warning';
  }

  const detail = selected && <>
    <label className="field">Các lượt tạo của cảnh<select aria-label="Lượt tạo của cảnh" value={selected.id} onChange={event => setAttemptId(event.target.value)}>
      {attempts.map((job, index) => <option value={job.id} key={job.id}>Lượt {attempts.length - index} · {reviewLabel(job)} · {formatTime(job.createdAt)}</option>)}
    </select></label>
    <label className="field">Phân loại cảnh<select aria-label="Phân loại cảnh" value={sceneCategory(organization.value, selected.request.projectId, selected.request.sceneId)}
      disabled={!organization.ready || organization.pending} onChange={event => {
        const key = sceneKey(selected.request.projectId, selected.request.sceneId);
        const next = event.target.value as 'content' | 'test';
        organization.setValue(value => ({...value, [key]: {...value[key], category: next, preferredTakeId: value[key]?.preferredTakeId ?? null}}));
        setMessage('Đã chuyển cảnh “' + selected.request.name + '” sang ' + (next === 'test' ? uiCopy.test : uiCopy.content) + '.');
      }}><option value="content">{uiCopy.content}</option><option value="test">{uiCopy.test}</option></select></label>
    <QueueDetails key={selected.id} job={selected} label={reviewLabel(selected)} tone={resultTone(selected)}
    profileName={status?.profiles.find(profile => profile.id === selected.profileId)?.name ?? 'Chờ phân hồ sơ'}
    busy={busy} musePaused={status?.musePaused!==false} onAction={onAction} onImport={onImport}
    primary={queueAction(selected) !== 'result' && queueAction(selected) !== 'details' ? actionButton(selected) : null}/></>;

  return <section className="queue-board" aria-label="Tác vụ Muse">
    <div className="queue-filters" role="group" aria-label="Phân loại nội dung">
      {([{id:'content', label:uiCopy.content}, {id:'test', label:uiCopy.test}, {id:'all', label:'Tất cả'}] as const).map(item =>
        <button type="button" key={item.id} aria-pressed={category === item.id} disabled={!organization.ready}
          onClick={() => {setCategory(item.id); resetPage();}}>{item.label}<span>{groupQueueJobs(jobs.filter(job => item.id === 'all' || sceneCategory(organization.value, job.request.projectId, job.request.sceneId) === item.id)).length}</span></button>)}
      <a className="lab-button neutral" href="?view=library">Mở Thư viện</a>
    </div>
    {organization.error && <div role="alert" className="inline-error"><p>{organization.error}</p><Button tone="neutral" disabled={organization.pending} onClick={organization.retry}>Lưu lại phân loại</Button></div>}
    {message && !organization.pending && !organization.error && <p role="status">{message}</p>}
    {status?.storage?.blocked&&<p role="alert" className="inline-error">{status.storage.message}</p>}
    {takeSelections.length>0&&<p className="info-panel">Chờ chọn take · {takeSelections.map(item=>item.name).join(' · ')}. Duyệt video rồi chọn đủ phiên bản trong Ghép và xuất.</p>}
    <div className="queue-controls">
      <div className="queue-dispatch">
        <Badge tone={status?.paused ? 'neutral' : 'success'}>{status?.paused ? 'Đã dừng giao mới' : 'Cho phép giao việc'}</Badge>
        <span>{status?.active ?? 0} đang chạy · còn {remainingCapacity} lượt trong đợt</span>
        <small>Tác vụ đã gửi vẫn có thể tiếp tục trên Muse.</small>
      </div>
      <div className="button-row">
        <Button tone="neutral" disabled={busy || !status || status.paused} onClick={() => onAction('pause')}><Pause size={16}/>Dừng giao mới</Button>
        <Button disabled={!canStart || !queued.length} onClick={() => onStart(queued)}><Play size={16}/>Duyệt và chạy{queued.length ? ` (${queued.length})` : ''}</Button>
      </div>
    </div>
    <div className="queue-filters" role="group" aria-label="Lọc trạng thái tác vụ">
      {queueFilters.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id}
        onClick={() => {setFilter(item.id); resetPage();}}>
        {item.label}<span>{groupQueueJobs(scoped.filter(job => matchesQueueFilter(job, item.id, resolvedFailures))).length}</span>
      </button>)}
    </div>
    <div className="queue-search">
      <SearchBox value={query} onChange={value => {setQuery(value); resetPage();}} placeholder="Tìm sản phẩm, cảnh, hồ sơ hoặc mã tác vụ…"/>
      <label className="queue-profile-filter">Sản phẩm<select aria-label="Lọc theo sản phẩm" value={productId} onChange={event => {setProductId(event.target.value); resetPage();}}>
        <option value="all">Tất cả sản phẩm</option>{products.map(product => <option key={product.id} value={product.id}>{product.data.name}</option>)}
      </select></label>
      <details className="queue-refine"><summary>Bộ lọc bổ sung</summary><div className="queue-search">
      <label className="queue-profile-filter">Hồ sơ Muse<select aria-label="Lọc theo hồ sơ Muse" value={profileId} onChange={event => {setProfileId(event.target.value); resetPage();}}>
        <option value="all">Tất cả hồ sơ</option>
        <option value="unassigned">Chờ phân hồ sơ</option>
        {status?.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
      </select></label>
      <label className="queue-profile-filter">Loại nội dung<select aria-label="Loại nội dung" value={mediaType} onChange={event => {setMediaType(event.target.value); resetPage();}}><option value="all">Ảnh và video</option><option value="video">Video</option><option value="image">Ảnh</option></select></label>
      <label className="queue-profile-filter">Thời gian<select aria-label="Thời gian" value={period} onChange={event => {setPeriod(event.target.value as MediaPeriod); resetPage();}}><option value="all">Toàn bộ thời gian</option><option value="today">Hôm nay</option><option value="week">7 ngày qua</option><option value="month">30 ngày qua</option></select></label>
      <label className="queue-batch-filter"><input type="checkbox" checked={batchOnly} onChange={event => {setBatchOnly(event.target.checked); resetPage();}}/>Đợt hiện tại</label>
      <small>RAM trống {status?.freeRamGb ?? '—'} GB</small>
      </div></details>
    </div>
    <div className="queue-workspace">
      <div className="queue-list">
        <div className="queue-list-heading"><h2>{filter === 'history' ? 'Lịch sử theo cảnh' : 'Cảnh cần xử lý'}</h2><span>{groups.length} cảnh · {filtered.length} lượt tạo</span></div>
        <div className="queue-column-head" aria-hidden="true"><span>Cảnh</span><span>Hồ sơ</span><span>Trạng thái</span><span>Thao tác</span></div>
        <ul ref={rows} className="queue-rows" aria-label="Danh sách tác vụ">
          {visible.map(group => {const job = group.latest; return <li className="queue-row" key={group.key} data-selected={selectedGroup?.key === group.key}>
            <button type="button" className="queue-row-title" aria-pressed={selected?.id === job.id}
              aria-label={'Chi tiết ' + job.request.name} onClick={() => openDetails(job)}>
              {job.request.mediaType === 'video' ? <FileVideo size={19}/> : <ImageIcon size={19}/>}
              <span><small title={products.find(product => product.id === job.request.productId)?.data.name}>{products.find(product => product.id === job.request.productId)?.data.name ?? 'Sản phẩm đã lưu'}</small><strong title={job.request.name}>{job.request.name}</strong><small>{group.jobs.length} lượt tạo · {formatTime(job.createdAt)}<span className="queue-inline-profile"> · {status?.profiles.find(profile => profile.id === job.profileId)?.name ?? 'Chờ phân hồ sơ'}</span></small></span>
            </button>
            <span className="queue-row-profile">{status?.profiles.find(profile => profile.id === job.profileId)?.name ?? 'Chờ phân hồ sơ'}</span>
            <Badge tone={resultTone(job)}>{reviewLabel(job)}</Badge>
            <div className="queue-row-action">{actionButton(job)}</div>
          </li>;})}
        </ul>
        {!visible.length && <Empty title={filteredScope ? 'Không có tác vụ phù hợp' : filter === 'history' ? 'Chưa có lịch sử' : 'Không có tác vụ cần xử lý'}
          text={filteredScope ? 'Thử đổi sản phẩm, trạng thái hoặc từ khóa.' : filter === 'history' ? 'Mỗi cảnh có một hàng. Mở chi tiết để xem từng lượt tạo.' : 'Xem video và ảnh đã tạo trong Thư viện. Các lượt kiểm thử có mục riêng ở phía trên.'}
          action={filteredScope ? <Button tone="neutral" onClick={() => {setFilter(filter === 'history' ? 'history' : 'pending'); setQuery(''); setProfileId('all'); setProductId('all'); setMediaType('all'); setPeriod('all'); setBatchOnly(false); resetPage();}}>Xóa bộ lọc</Button>
            : filter === 'pending' && jobs.some(job => matchesQueueFilter(job, 'history', resolvedFailures)) ? <Button tone="neutral" onClick={() => {setFilter('history'); resetPage();}}>Xem lịch sử</Button> : undefined}/>}
        <Pagination page={currentPage} total={groups.length} onPage={value => {if (rows.current) rows.current.scrollTop = 0; setPage(value); setSelectedId(''); setAttemptId(''); setDetailOpen(false);}}/>
      </div>
      {!compact && <aside className="queue-detail" aria-label="Chi tiết tác vụ">
        <h2 ref={detailHeading} tabIndex={-1}>Chi tiết tác vụ</h2>
        {detail ?? <p>Chọn một tác vụ để xem prompt, kết quả và lịch sử.</p>}
      </aside>}
    </div>
    {compact && <Modal open={detailOpen && !!selected} title="Chi tiết tác vụ" description={selected?.request.name}
      locked={busy} onClose={() => setDetailOpen(false)}>{detail}</Modal>}
  </section>;
}

function QueueDetails({job, label, tone, profileName, busy, musePaused, primary, onAction, onImport}: {
  job: DesktopJob; label: string; tone: 'neutral' | 'success' | 'danger' | 'warning'; profileName: string; busy: boolean; musePaused:boolean; primary: React.ReactNode;
  onAction: Props['onAction']; onImport: Props['onImport'];
}) {
  const [mediaError, setMediaError] = useState(false);
  useEffect(() => setMediaError(false), [job.uploadedAssetId]);
  const projectUrl = '?view=' + (job.request.mediaType === 'image' ? 'images' : 'production')
    + '&production=' + encodeURIComponent(job.request.projectId) + '&stage=scenes&desk_scene=' + encodeURIComponent(job.request.sceneId);
  const assetUrl = job.uploadedAssetId ? '/api/assets/' + encodeURIComponent(job.uploadedAssetId) : '';
  return <div className="queue-detail-body">
    <h3>{job.request.name}</h3>
    <Badge tone={tone}>{label}</Badge>
    {assetUrl && job.state === 'ready' && <div className="queue-result">
      {mediaError ? <p role="alert">Chưa đọc được file. Mở vị trí file để kiểm tra bản lưu trên máy.</p>
        : job.request.mediaType === 'video'
          ? <video src={assetUrl} controls playsInline preload="metadata" aria-label={'Kết quả ' + job.request.name} onError={() => setMediaError(true)}/>
          : <img src={assetUrl} alt={job.request.name} onError={() => setMediaError(true)}/>}
    </div>}
    <p className="queue-latest">{job.importError || job.history.at(-1)?.note || 'Đã lưu tác vụ trên máy.'}</p>
    {job.providerResponse && <details className="queue-detail-section" open={job.state === 'needs_attention'}>
      <summary>Phản hồi của Muse</summary><p className="queue-prompt">{job.providerResponse}</p>
    </details>}
    <dl className="queue-facts"><div><dt>Hồ sơ Muse</dt><dd>{profileName}</dd></div>
      <div><dt>Định dạng</dt><dd>{job.request.mediaType === 'video' ? 'Video' : 'Ảnh'} · {job.request.ratio}{job.request.mediaType === 'video' && ` · ${job.request.duration} giây`}</dd></div>
      <div><dt>Đã thêm</dt><dd>{formatTime(job.createdAt)}</dd></div>
    </dl>
    {job.output?.warning && <p className="queue-latest">{job.output.warning}</p>}
    <div className="button-row">
      {primary}
      <a className="lab-button neutral" href={projectUrl}>Mở dự án</a>
      {job.uploadedAssetId && <a className="lab-button neutral" href={'?view=library&lib_asset=' + encodeURIComponent(job.uploadedAssetId)}>Xem trong Thư viện</a>}
      {job.providerUrl && <Button tone="neutral" disabled={busy||musePaused} onClick={() => onAction('openResult', {id: job.id})}>{musePaused?'Muse đang tạm dừng':uiCopy.openMuseResult}</Button>}
      {job.state === 'queued' && <Button tone="ghost" disabled={busy} onClick={() => onAction('cancel', {id: job.id})}>Hủy bản nháp</Button>}
      {(job.output || job.failedFilePath || job.diagnosticPath) && <Button tone="ghost" disabled={busy} onClick={() => onAction('reveal', {id: job.id})}>Mở vị trí file</Button>}
      {job.state === 'ready' && onImport && <Button disabled={busy} onClick={() => onImport(job)}>Nhập file vào dự án</Button>}
    </div>
    <details className="queue-detail-section"><summary>Prompt</summary><p className="queue-prompt">{job.request.prompt}</p></details>
    <details className="queue-detail-section"><summary>Lịch sử xử lý · {job.history.length} bước</summary>
      <ol className="queue-history">{[...job.history].reverse().map((entry, index) => <li key={index}><time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time><p>{entry.note}</p></li>)}</ol>
    </details>
    <details className="queue-detail-section"><summary>Thông tin kỹ thuật</summary>
      <dl className="queue-technical"><dt>Mã tác vụ</dt><dd>{job.id}</dd><dt>Mã kết quả Muse</dt><dd>{job.providerId || 'Chưa xác nhận'}</dd>
        <dt>Chi phí</dt><dd>Chưa biết</dd>{job.output && <><dt>Đường dẫn file</dt><dd>{job.output.path}</dd></>}
      </dl>
    </details>
  </div>;
}
