"use client";
import {CompressionNote} from './compression-note';
import {uiCopy, reviewLabels} from '@/desktop/src/ui-copy.mjs';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Copy, Download, Images} from 'lucide-react';
import {type LabRecord, formatTime} from '@/lib/lab/domain';
import {mediaCatalog, mediaCaption, mediaReview, mediaInstructions, preferredMedia} from '@/lib/lab/media-catalog';
import {sceneKey, sceneCategory, matchesMediaPeriod, type MediaOrganization, type MediaPeriod} from '@/lib/lab/media-organization';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {useDesktopPreference} from '@/lib/lab/use-desktop-preference';
import {type Chat} from './muse-chat';
import {Badge, Button, Empty, Modal, Pagination, SearchBox} from './primitives';
import {MediaPlayer, MediaThumbnail} from './media-preview';
import {copyWorkbenchText, downloadOwnedMedia} from './workbench-controls';

export default function WorkspaceLibrary({records, demo}: {records: LabRecord[]; demo: boolean}) {
  const {status} = useDesktopStatus(!demo);
  const filters = useDesktopPreference('libraryFilters', {query: '', productId: 'all', type: 'all', batch: false, category: 'content', review: 'all', period: 'all', versions: false});
  const organization = useDesktopPreference<MediaOrganization>('mediaOrganization', {});
  const {query, productId, type, batch, category = 'content', review = 'all', period = 'all', versions = false} = filters.value;
  const restoredUrl = useRef(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const catalog = useMemo(() => mediaCatalog(records), [records]);
  const matching = catalog.filter(entry => (productId === 'all' || entry.production.productId === productId) &&
    (type === 'all' || entry.take.type.startsWith(type + '/')) &&
    (category === 'all' || sceneCategory(organization.value, entry.project.id, entry.scene.id) === category) &&
    (review === 'all' || mediaReview(entry) === review) &&
    matchesMediaPeriod(entry.take.createdAt, period as MediaPeriod) &&
    (!batch || status?.jobs.some(job => job.submitBatchId === status.batch?.id && job.uploadedAssetId === entry.take.assetId)) &&
    `${entry.product?.data.name} ${entry.scene.name} ${entry.take.name}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  const entries = versions ? matching : preferredMedia(matching, organization.value);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(entries.length / 12)));
  const entry = catalog.find(item => item.key === selected);
  const sceneVersions = entry ? catalog.filter(item => item.project.id === entry.project.id && item.scene.id === entry.scene.id) : [];
  const entryJob = entry && status?.jobs.find(job => job.uploadedAssetId === entry.take.assetId);
  const caption = entry ? mediaCaption(entry, records, chats) : null;
  const instructions = entry ? mediaInstructions(entry) : null;
  useEffect(() => {
    if (!filters.ready || restoredUrl.current) return;
    restoredUrl.current = true;
    const params = new URL(location.href).searchParams;
    if (!['lib_product', 'lib_type', 'lib_q', 'lib_batch', 'lib_category', 'lib_review', 'lib_period', 'lib_versions'].some(key => params.has(key))) return;
    const mediaType = params.get('lib_type') ?? 'all';
    filters.setValue({
      productId: params.get('lib_product') || 'all',
      type: ['all', 'image', 'video'].includes(mediaType) ? mediaType : 'all',
      query: params.get('lib_q') ?? '',
      batch: params.get('lib_batch') === 'true',
      category: ['content','test','all'].includes(params.get('lib_category') ?? '') ? params.get('lib_category')! : 'content',
      review: ['all','pending','approved','rejected','stale'].includes(params.get('lib_review') ?? '') ? params.get('lib_review')! : 'all',
      period: ['all','today','week','month'].includes(params.get('lib_period') ?? '') ? params.get('lib_period')! : 'all',
      versions: params.get('lib_versions') === 'true',
    });
  }, [filters.ready]);
  useEffect(() => {
    if (!filters.ready) return;
    const restoreSelection = () => {
      const assetId = new URL(location.href).searchParams.get('lib_asset');
      const item = catalog.find(item => item.take.assetId === assetId);
      setSelected(item?.key ?? '');
      setMessage('');
      setError(assetId && !item ? 'Không tìm thấy file trong liên kết này. Chọn một kết quả trong Thư viện.' : '');
    };
    restoreSelection();
    window.addEventListener('popstate', restoreSelection);
    return () => window.removeEventListener('popstate', restoreSelection);
  }, [filters.ready, catalog]);
  useEffect(() => {
    let live = true;
    if (!demo) void desktopBridge()?.museChatList({}).then(rows => {if (live) setChats(rows);}).catch(reason => {if (live) setError(reason.message);});
    return () => {live = false;};
  }, [demo]);
  function selectEntry(key: string) {
    const item = catalog.find(item => item.key === key);
    setSelected(item?.key ?? '');
    setError('');
    setMessage('');
    const url = new URL(location.href);
    if (item) url.searchParams.set('lib_asset', item.take.assetId);
    else url.searchParams.delete('lib_asset');
    history.replaceState({}, '', url);
  }
  function filter(key: string, value: string) {
    const fields: Record<string, string> = {lib_product: 'productId', lib_type: 'type', lib_q: 'query', lib_batch: 'batch', lib_category:'category', lib_review:'review', lib_period:'period', lib_versions:'versions'};
    const next = {...filters.value, [fields[key]]: ['lib_batch','lib_versions'].includes(key) ? value === 'true' : value};
    filters.setValue(next);
    setPage(1);
    const url = new URL(location.href);
    url.searchParams.set('lib_product', next.productId);
    url.searchParams.set('lib_type', next.type);
    url.searchParams.set('lib_q', next.query);
    url.searchParams.set('lib_batch', String(next.batch));
    url.searchParams.set('lib_category', next.category);
    url.searchParams.set('lib_review', next.review);
    url.searchParams.set('lib_period', next.period);
    url.searchParams.set('lib_versions', String(next.versions));
    history.replaceState({}, '', url);
  }
  function updateOrganization(patch: Partial<MediaOrganization[string]>) {
    if (!entry) return;
    const key = sceneKey(entry.project.id, entry.scene.id);
    organization.setValue(value => ({...value, [key]: {...(value[key] ?? {category:'content', preferredTakeId:null}), ...patch}}));
  }
  function clearFilters() {
    filters.setValue({query:'', productId:'all', type:'all', batch:false, category:'content', review:'all', period:'all', versions:false});
    setPage(1);
    const url = new URL(location.href);
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('lib_')) url.searchParams.delete(key);
    history.replaceState({}, '', url);
  }
  async function perform(task: () => Promise<unknown>, success = '') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {await task(); setMessage(success);}
    catch (reason) {setError((reason as Error).message);}
    finally {lock.current = false; setBusy(false);}
  }
  return <section className="workspace-library">
    <header className="production-heading"><div><h1><Images size={22}/>Thư viện</h1><p>{entries.length} {versions ? 'phiên bản' : 'cảnh'} · {matching.length} file phù hợp</p></div></header>
    <fieldset className="catalog-toolbar" disabled={!filters.ready || !organization.ready} aria-label="Lọc thư viện">
      <label className="field">Sản phẩm<select aria-label="Sản phẩm" value={productId} onChange={event => filter('lib_product', event.target.value)}><option value="all">Tất cả sản phẩm</option>{records.filter(record => record.kind === 'product').map(product => <option key={product.id} value={product.id}>{product.data.name}</option>)}</select></label>
      <label className="field">Loại nội dung<select aria-label="Loại nội dung" value={type} onChange={event => filter('lib_type', event.target.value)}><option value="all">Ảnh và video</option><option value="video">Video</option><option value="image">Ảnh</option></select></label>
      <label className="field">Phân loại<select aria-label="Phân loại" value={category} onChange={event => filter('lib_category', event.target.value)}><option value="content">{uiCopy.content}</option><option value="test">{uiCopy.test}</option><option value="all">Tất cả</option></select></label>
      <label className="field">Trạng thái duyệt<select aria-label="Trạng thái duyệt" value={review} onChange={event => filter('lib_review', event.target.value)}><option value="all">Tất cả trạng thái</option>{Object.entries(reviewLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">Thời gian<select aria-label="Thời gian" value={period} onChange={event => filter('lib_period', event.target.value)}><option value="all">Toàn bộ thời gian</option><option value="today">Hôm nay</option><option value="week">7 ngày qua</option><option value="month">30 ngày qua</option></select></label>
      <label className="catalog-check"><input type="checkbox" checked={batch} onChange={event => filter('lib_batch', String(event.target.checked))}/>Đợt hiện tại</label>
      <label className="catalog-check"><input type="checkbox" checked={versions} onChange={event => filter('lib_versions', String(event.target.checked))}/>Hiện mọi phiên bản</label>
      <SearchBox value={query} onChange={value => filter('lib_q', value)} placeholder="Tìm video, sản phẩm…"/>
    </fieldset>
    {!versions && <p className="catalog-hint">Mỗi cảnh hiện phiên bản bạn đã chọn, bản đã duyệt hoặc bản mới nhất. Mở cảnh để xem các phiên bản còn lại.</p>}
    {(error || filters.error || organization.error) && !entry && <div role="alert" className="inline-error"><p>{error || filters.error || organization.error}</p>
      {filters.error && <Button tone="neutral" disabled={filters.pending} onClick={filters.retry}>Lưu lại bộ lọc</Button>}
      {organization.error && <Button tone="neutral" disabled={organization.pending} onClick={organization.retry}>Lưu lại phân loại</Button>}
    </div>}
    <div className="media-grid workspace-media-grid">{entries.slice((currentPage - 1) * 12, currentPage * 12).map(item => {
      const job = status?.jobs.find(job => job.uploadedAssetId === item.take.assetId);
      return <article className="media-card" key={item.key}>
        <button className="media-cover" aria-label={`Xem ${item.scene.name}`} onClick={() => selectEntry(item.key)}><MediaThumbnail take={item.take}/></button>
        <div><strong>{item.product?.data.name ?? item.project.data.name}</strong><span>{item.scene.name}</span><small>{item.scene.ratio} · {item.take.metadata.duration ?? 'Ảnh'}{item.take.metadata.duration ? 's' : ''} · {status?.profiles.find(profile => profile.id === job?.profileId)?.name ?? 'Đã nhập'}</small>
          <Badge tone={mediaReview(item) === 'approved' ? 'success' : item.take.review === 'rejected' ? 'danger' : 'warning'}>{reviewLabels[mediaReview(item)]}</Badge><small>{catalog.filter(version => version.project.id === item.project.id && version.scene.id === item.scene.id).length} phiên bản · {formatTime(item.take.createdAt)}</small></div>
      </article>;
    })}</div>
    {!entries.length && <Empty title="Chưa có file phù hợp" text="Đổi bộ lọc hoặc tạo video từ một sản phẩm." action={<Button tone="neutral" onClick={clearFilters}>Xóa bộ lọc</Button>}/>}
    <Pagination page={currentPage} total={entries.length} size={12} onPage={setPage}/>
    <Modal open={!!entry} title={entry?.product?.data.name ?? 'Chi tiết media'} description={entry?.scene.name} onClose={() => selectEntry('')} locked={busy}>
      {entry && <div className="catalog-detail"><div className="catalog-player"><MediaPlayer take={entry.take}/></div><div>
        <label className="field">Phiên bản<select aria-label="Phiên bản" value={entry.key} onChange={event => selectEntry(event.target.value)}>{sceneVersions.map((version,index) => <option key={version.key} value={version.key}>Phiên bản {sceneVersions.length - index} · {reviewLabels[mediaReview(version)]} · {formatTime(version.take.createdAt)}</option>)}</select></label>
        <div className="button-row"><Badge tone={mediaReview(entry) === 'approved' ? 'success' : 'warning'}>{reviewLabels[mediaReview(entry)]}</Badge>
          <Button tone="neutral" disabled={!organization.ready || organization.pending || organization.value[sceneKey(entry.project.id,entry.scene.id)]?.preferredTakeId === entry.take.id}
            onClick={() => updateOrganization({preferredTakeId:entry.take.id})}>{organization.value[sceneKey(entry.project.id,entry.scene.id)]?.preferredTakeId === entry.take.id ? 'Đang dùng làm bản chính' : 'Đặt làm bản chính'}</Button></div>
        <label className="field">Phân loại cảnh<select aria-label="Phân loại cảnh" disabled={!organization.ready || organization.pending} value={sceneCategory(organization.value,entry.project.id,entry.scene.id)}
          onChange={event => updateOrganization({category:event.target.value as 'content' | 'test'})}><option value="content">{uiCopy.content}</option><option value="test">{uiCopy.test}</option></select></label>
        <h3>Chú thích tiếng Anh</h3>{caption ? <><small>{caption.source}</small><p className="muse-chat-text">{caption.text}</p><Button tone="neutral" disabled={busy} onClick={() => void perform(() => copyWorkbenchText(caption.text), 'Đã sao chép caption.')}><Copy size={15}/>Sao chép caption</Button></> : <p>Chưa có caption gắn với sản phẩm này.</p>}
        <details><summary>{instructions?.fromSnapshot ? 'Prompt và ảnh tham chiếu của phiên bản' : 'Prompt và ảnh tham chiếu hiện tại'}</summary>
          {!instructions?.fromSnapshot && <p>Phiên bản cũ chưa lưu prompt gốc. Dưới đây là nội dung cảnh hiện tại.</p>}
          <p className="muse-chat-text">{instructions?.prompt}</p><div className="catalog-references">{instructions?.references.map((ref, index) => <img key={`${ref.assetId}:${index}`} src={`/api/assets/${ref.assetId}`} alt={ref.name}/>)}</div></details>
        <CompressionNote take={entry.take}/><p>{entry.take.metadata.width}×{entry.take.metadata.height} · {entry.take.metadata.duration ?? '—'}s</p>
        <div className="button-row"><Button disabled={busy} onClick={() => void perform(() => downloadOwnedMedia(entry.take.assetId, entry.take.name))}><Download size={16}/>{uiCopy.downloadFile}</Button><a className="lab-button neutral" href={`?view=${entry.take.type.startsWith("image/") ? "images" : "production"}&production=${encodeURIComponent(entry.project.id)}&stage=scenes&desk_scene=${encodeURIComponent(entry.scene.id)}&desk_take=${encodeURIComponent(entry.take.id)}`}>Mở phiên bản trong dự án</a></div>
        {entryJob?.providerUrl && <Button tone="neutral" disabled={busy} onClick={() => void perform(() => desktopBridge()!.openResult({id:entryJob.id}))}>{uiCopy.openMuseResult}</Button>}
        {message && <p role="status">{message}</p>}{(error || organization.error) && <div role="alert" className="inline-error"><p>{error || organization.error}</p>
          {organization.error && <Button tone="neutral" disabled={organization.pending} onClick={organization.retry}>Lưu lại phân loại</Button>}
        </div>}
      </div></div>}
    </Modal>
  </section>;
}
