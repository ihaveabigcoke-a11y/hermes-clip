"use client";
import {useEffect, useRef, useState} from 'react';
import {Plus, Settings2, ExternalLink, Play, RefreshCw} from 'lucide-react';
import {z} from 'zod';
import {type LabRecord, formatTime} from '@/lib/lab/domain';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {useInstagramStatus, type InstagramJob, type InstagramProfile} from '@/lib/lab/instagram-client';
import {mediaCatalog, preferredMedia} from '@/lib/lab/media-catalog';
import {useDesktopPreference} from '@/lib/lab/use-desktop-preference';
import {type MediaOrganization} from '@/lib/lab/media-organization';
import {instagramStateLabels, instagramSessionLabels, contentPlanLabels, reviewLabels} from '@/desktop/src/ui-copy.mjs';
import {profileInput} from '@/desktop/src/shared.mjs';
import {Badge, Button, Empty, Modal, Pagination, RecordForm} from './primitives';
import {MediaPlayer} from './media-preview';
import InstagramMetrics from './instagram-metrics';
import {ProductMetrics,InstagramContentTable} from './instagram-overview';
import InstagramKeywordComments from './instagram-keyword-comments';
import PlanUtmLink from './plan-utm-link';
import {instagramAccountContentRows} from '@/lib/lab/instagram-summary';

type Props = {
  product: LabRecord; accounts: LabRecord[]; plans: LabRecord[]; records: LabRecord[]; demo: boolean; disabled: boolean;
  onAccount: (account?: LabRecord) => void; onPlan: (plan?: LabRecord) => void;
  onCreateProduction: (plan: LabRecord) => void;
  onSaveComments: (id:string,data:Record<string,any>) => Promise<LabRecord>;
  onSavePlan: (plan:LabRecord,data:Record<string,any>) => Promise<LabRecord>;
  notify: (text: string, tone?: string) => void;
};
const pendingStates = ['queued', 'waiting_login', 'preparing', 'uploading', 'submitting', 'needs_attention'];
const configSchema = z.object({vpnEnabled: z.boolean(), server: z.string().max(300), username: z.string().max(200),
  apiAppId:z.string().regex(/^\d{1,40}$|^$/),apiMode:z.enum(['browser','api']),apiUserId:z.string().regex(/^\d{1,40}$|^$/, 'Nhập mã tài khoản API bằng chữ số.'),apiToken:z.string().max(8192),clearApiToken:z.boolean(),
  password: z.string().max(300), clearPassword: z.boolean()}).superRefine((value, ctx) => {
  const result = profileInput.safeParse({name: 'Instagram', accountLabel: '', enabled: true, vpnEnabled: value.vpnEnabled,
    proxy: {server: value.server, username: value.username, password: value.password, clearPassword: value.clearPassword}});
  if (!result.success) for (const error of result.error.issues) ctx.addIssue({code: 'custom', path: ['server'], message: error.message});
});

function jobTone(job?: InstagramJob) {
  if (job?.state === 'published') return 'success';
  if (job?.state === 'failed') return 'danger';
  if (job?.state === 'needs_attention' || job?.state === 'waiting_login') return 'warning';
  return 'neutral';
}

export default function InstagramPanel({product, accounts, plans, records, demo, disabled, onAccount, onPlan, onCreateProduction, onSaveComments, onSavePlan, notify}: Props) {
  const live = useInstagramStatus(!demo);
  const organization = useDesktopPreference<MediaOrganization>('mediaOrganization', {});
  type Tab='overview'|'content'|'accounts'|'history';
  const readTab=()=>{const value=new URL(location.href).searchParams.get('ig_tab');return (['overview','content','accounts','history'].includes(value??'')?value:'overview') as Tab;};
  const [tab, updateTab] = useState<Tab>(readTab);
  const setTab=(value:Tab)=>{updateTab(value);const url=new URL(location.href);url.searchParams.set('ig_tab',value);history.replaceState({},'',url);};
  useEffect(()=>{const restore=()=>updateTab(readTab());window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [selection, setSelection] = useState<Record<string, {accountId?: string; assetId?: string}>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<LabRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const lock = useRef(false);
  const jobs = (live.status?.jobs.filter(job => job.snapshot.productId === product.id) ?? []).sort((a, b) => b.createdAt - a.createdAt);
  const catalog = mediaCatalog(records);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(plans.length / 8)));
  const visiblePlans = plans.slice((currentPage - 1) * 8, currentPage * 8);
  const plan = visiblePlans.find(plan => plan.id === selectedId) ?? visiblePlans[0];
  const latest = plan && jobs.find(job => job.snapshot.planId === plan.id);
  const fixedSnapshot = latest && (pendingStates.includes(latest.state) || latest.state === 'published') ? latest.snapshot : null;
  const production = plan && records.find(record => record.kind === 'production' && (record.id === plan.data.productionId || !plan.data.productionId && record.data.contentPlanId === plan.id));
  const media = catalog.filter(entry => entry.project.id === production?.id && entry.take.type === 'video/mp4');
  const chosenMedia = fixedSnapshot ? media.find(entry => entry.take.assetId === fixedSnapshot.assetId) : media.find(entry => entry.take.assetId === selection[plan?.id ?? '']?.assetId)
    ?? media.find(entry => entry.take.assetId === plan?.data.assetId) ?? preferredMedia(media, organization.value)[0];
  const activeAccounts = accounts.filter(account => !account.data.archived);
  const accountId = fixedSnapshot?.accountId ?? selection[plan?.id ?? '']?.accountId ?? plan?.data.accountId ?? '';
  const account = activeAccounts.find(account => account.id === accountId) ?? (!accountId ? activeAccounts[0] : undefined);
  const profile = live.status?.profiles.find(profile => profile.id === account?.id);
  const published = plan && (['published_browser', 'published_manual'].includes(plan.data.status) || latest?.state === 'published');
  const commentPost = plan && instagramAccountContentRows(records,product.id,live.status?.jobs).find(post=>post.planIds.includes(plan.id));
  const pending = latest && pendingStates.includes(latest.state);
  const canPublish = !!plan && !!chosenMedia && !!account && !!plan.data.caption?.trim() && chosenMedia.take.review !== 'rejected'
    && !pending && !published && !disabled && !busy && !demo && !!live.status;
  const configProfile = live.status?.profiles.find(profile => profile.id === config?.id);
  const historyCurrentPage = Math.min(historyPage, Math.max(1, Math.ceil(jobs.length / 8)));
  function openContent(id:string){setSelectedId(id);setPage(Math.max(1,Math.floor(plans.findIndex(p=>p.id===id)/8)+1));setTab('content');}

  async function action(method: string, payload: unknown, message = '') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const bridge = desktopBridge();
      if (!bridge?.[method]) throw Error('Mở bản desktop đã cập nhật để dùng Instagram.');
      const result = await bridge[method](payload);
      if (message) notify(message);
      return result;
    } catch (reason) {setError((reason as Error).message); throw reason;}
    finally {lock.current = false; setBusy(false); live.refresh();}
  }
  function act(method: string, payload: unknown, message = '') {void action(method, payload, message).catch(() => {});}
  function choose(key: 'accountId' | 'assetId', value: string) {
    if (plan) setSelection(current => ({...current, [plan.id]: {...current[plan.id], [key]: value}}));
  }
  function publish() {
    if (!canPublish || !plan || !account || !chosenMedia) return;
    act('instagramPublish', {requestId: crypto.randomUUID(), planId: plan.id, revision: plan.revision,
      accountId: account.id, assetId: chosenMedia.take.assetId}, 'Đã nhận lượt đăng. Tiến trình hiển thị tại nội dung này.');
  }
  function jobActions(job: InstagramJob) {
    return <div className="button-row">
      {job.state === 'waiting_login' && <Button disabled={busy || demo} onClick={() => act('instagramOpen', {id: job.snapshot.accountId})}>Đăng nhập để tiếp tục</Button>}
      {['queued', 'waiting_login'].includes(job.state) && <Button tone="neutral" disabled={busy || demo} onClick={() => act('instagramCancel', {id: job.id})}>Hủy lượt đăng</Button>}
      {job.state === 'failed' && <Button tone="neutral" disabled={busy || demo} onClick={() => act('instagramRetry', {id: job.id})}>Thử lại lượt đăng</Button>}
      {job.state === 'needs_attention' && (job.attentionReason === 'ai_label'
        ? <Button disabled={busy || demo} onClick={() => act('instagramOpen', {id: job.snapshot.accountId})}>Mở trình duyệt kiểm tra nhãn AI</Button>
        : <Button disabled={busy || demo} onClick={() => act('instagramReconcile', {id: job.id})}>Kiểm tra kết quả</Button>)}
      {job.state === 'published' && job.syncError && <Button tone="neutral" disabled={busy || demo} onClick={() => act('instagramReconcile', {id: job.id})}>Đồng bộ bài đã đăng</Button>}
      {job.postUrl && <a className="lab-button neutral" href={job.postUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Xem trên Instagram</a>}
    </div>;
  }
  function profileStatus(profile?: InstagramProfile) {
    if (!profile) return 'Chưa đăng nhập';
    if (profile.apiMode !== 'browser') return !live.status?.api?.enabled ? 'API đang tắt' : profile.session === 'signed_in' ? 'Đã xác minh API' : 'Chưa xác minh API';
    if (!profile.open) return profile.handle ? 'Phiên đã lưu trên máy' : 'Chưa đăng nhập';
    return instagramSessionLabels[profile.session] ?? 'Chưa xác nhận phiên';
  }

  return <div className="instagram-panel">
    <div className="instagram-section-heading"><div className="queue-filters" role="group" aria-label="Các phần của sản phẩm trên Instagram">
      <button type="button" aria-pressed={tab==='overview'} onClick={()=>setTab('overview')}>Tổng quan</button>
      <button type="button" aria-pressed={tab==='content'} onClick={()=>setTab('content')}>Nội dung <span>{plans.length}</span></button>
      <button type="button" aria-pressed={tab==='accounts'} onClick={()=>setTab('accounts')}>Tài khoản <span>{accounts.length}</span></button>
      <button type="button" aria-pressed={tab==='history'} onClick={()=>setTab('history')}>Lượt đăng <span>{jobs.length}</span></button>
    </div>{tab==='content'&&<Button tone="neutral" disabled={disabled||busy} onClick={()=>onPlan()}><Plus size={16}/>Thêm nội dung</Button>}</div>
    {tab==='overview'&&<><ProductMetrics productId={product.id} records={records} status={live.status}/>
      <InstagramContentTable records={records} productId={product.id} status={live.status} onOpenPlan={openContent}/>
    </>}
    {tab==='accounts'&&<section className="instagram-accounts" aria-label="Tài khoản Instagram của sản phẩm">
      <header className="instagram-section-heading"><h2>Tài khoản của sản phẩm</h2><Button disabled={disabled || busy} onClick={() => onAccount()}><Plus size={16}/>Thêm hồ sơ</Button></header>
      {accounts.map(account => {
        const profile = live.status?.profiles.find(profile => profile.id === account.id);
        return <article className="instagram-account-row" key={account.id}>
          <div className="instagram-account-identity"><strong>{account.data.name}</strong><span>{profile?.handle ? '@' + profile.handle : account.data.handle ? 'Username đã ghi · @' + account.data.handle : 'Đăng nhập để nhận diện tài khoản'}</span></div>
          <div><Badge tone={(profile?.open || profile?.apiMode !== 'browser' && live.status?.api?.enabled) && profile?.session === 'signed_in' ? 'success' : 'neutral'}>{account.data.archived ? 'Đã lưu trữ' : profileStatus(profile)}</Badge>
            <small>{profile?.apiMode !== 'browser' ? `Instagram API · ${live.status?.api?.enabled ? 'Đang bật' : 'Đang tắt'}` : !live.status?.browserEnabled ? 'Trình duyệt đang tắt' : profile?.proxy.server ? 'Proxy riêng' : profile?.vpnEnabled !== false ? 'Touch VPN' : 'Kết nối trực tiếp'}{profile?.open && profile.vpnEnabled ? ' · ' + (profile.vpn?.state === 'connected' ? 'Đã bật' : 'Cần kiểm tra VPN') : ''}</small>
            {profile?.checkedAt && <small>Kiểm tra {formatTime(profile.checkedAt)}</small>}</div>
          <div className="button-row">
            <Button tone="neutral" disabled={disabled || busy || demo || account.data.archived || profile?.apiMode === 'browser' && !live.status?.browserEnabled || profile?.apiMode !== 'browser' && !live.status?.api?.enabled} onClick={() => act('instagramOpen', {id: account.id})}>{profile?.apiMode !== 'browser' ? 'Kiểm tra kết nối' : profile?.open ? 'Mở trình duyệt' : 'Đăng nhập'}</Button>
            {profile?.open && <Button tone="neutral" disabled={busy || profile.busy || demo} onClick={() => act('instagramCheck', {id: account.id})}>Kiểm tra phiên</Button>}
            {profile?.open && <Button tone="ghost" disabled={busy || profile.busy || demo} onClick={() => act('instagramClose', {id: account.id})}>Đóng</Button>}
            <Button tone="ghost" aria-label={'Cấu hình kết nối ' + account.data.name} disabled={disabled || busy || !!profile?.busy || demo} onClick={() => {setConfig(account); setDirty(false);}}><Settings2 size={17}/></Button>
            <Button tone="ghost" disabled={disabled || busy} onClick={() => onAccount(account)}>Sửa hồ sơ</Button>
          </div>
          {profile?.error && <p className="instagram-account-error" role="status">{profile.error}</p>}
          {profile?.open && profile.vpnEnabled && profile.vpn?.state !== 'connected' && <Button tone="neutral" disabled={busy} onClick={() => act('instagramOpenVpn', {id: account.id})}>Mở Touch VPN</Button>}
        </article>;
      })}
      {!accounts.length && <Empty title="Thêm tài khoản cho sản phẩm này" text="Tạo hồ sơ rồi đăng nhập Instagram trong trình duyệt mở ra. Phiên đăng nhập được lưu để dùng cho các lượt đăng sau."/>}
    </section>}
    {(error || live.error) && <div className="inline-error" role="alert"><p>{error || live.error}</p><Button tone="neutral" onClick={live.refresh}><RefreshCw size={16}/>Kiểm tra lại</Button></div>}
    {demo && <p className="info-panel">Mở không gian làm việc desktop để đăng nhập và đăng video.</p>}
    {tab === 'content' && !plans.length && <Empty title="Chưa có nội dung cho sản phẩm này" text="Thêm nội dung, gắn dự án video và lưu chú thích trước khi đăng."/>}
    {tab === 'content' && plan && <div className="instagram-content-layout">
      <div className="instagram-content-list"><ul>{visiblePlans.map(item => {
        const job = jobs.find(job => job.snapshot.planId === item.id);
        return <li key={item.id}><button type="button" className="instagram-plan-button" aria-pressed={plan.id === item.id} onClick={() => setSelectedId(item.id)}>
          <strong>{item.data.name}</strong><span><Badge tone={jobTone(job)}>{job ? instagramStateLabels[job.state] : contentPlanLabels[item.data.status]}</Badge><small>{item.data.plannedDate || 'Chưa chọn ngày dự kiến'}</small></span>
        </button></li>;
      })}</ul><Pagination page={currentPage} total={plans.length} size={8} onPage={value => {setPage(value); setSelectedId('');}}/></div>
      <section className="instagram-publish-detail" aria-label={'Nội dung ' + plan.data.name}>
        <header className="instagram-section-heading"><h2>{plan.data.name}</h2><small>Nhà cung cấp: {plan.data.provider??'Chưa ghi nguồn'}</small><Button tone="neutral" disabled={disabled || busy} onClick={() => onPlan(plan)}>Sửa nội dung</Button></header>
        <div className="instagram-publish-columns"><div className="instagram-video-preview">{chosenMedia ? <MediaPlayer take={chosenMedia.take}/> : <Empty title="Chưa có video" text="Gắn dự án có video trong Sửa nội dung."/>}</div>
          <div className="instagram-publish-fields">
            <label className="field">Video sẽ đăng<select aria-label="Video sẽ đăng" value={chosenMedia?.take.assetId ?? ''} disabled={busy || !!pending || !!published || !media.length} onChange={event => choose('assetId', event.target.value)}>
              {!media.length && <option value="">Chưa có video</option>}{media.map(entry => <option key={entry.key} value={entry.take.assetId}>{entry.scene.name} · {reviewLabels[entry.take.review]} · {formatTime(entry.take.createdAt)}</option>)}
            </select></label>
            <label className="field">Tài khoản đăng<select aria-label="Tài khoản đăng" value={account?.id ?? ''} disabled={busy || !!pending || !!published || !activeAccounts.length} onChange={event => choose('accountId', event.target.value)}>
              {!account && <option value="">Chọn tài khoản</option>}{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.data.name}{live.status?.profiles.find(profile => profile.id === account.id)?.handle ? ' · @' + live.status.profiles.find(profile => profile.id === account.id)!.handle : ''}</option>)}
            </select></label>
            <div><h3>{published ? 'Chú thích đã đăng' : 'Chú thích sẽ đăng'}</h3><p className="muse-chat-text instagram-caption">{fixedSnapshot?.caption ?? (plan.data.caption || 'Thêm chú thích trong Sửa nội dung.')}</p></div>
            {!published && <small>Nhãn AI: {(fixedSnapshot ? fixedSnapshot.aiLabel : plan.data.aiLabel) === 'required' ? 'Bắt buộc bật trước Share' : 'Không gắn nhãn'}</small>}
            {chosenMedia && <small>{chosenMedia.scene.ratio} · {chosenMedia.take.metadata.duration}s · {reviewLabels[chosenMedia.take.review]}</small>}
            {!published && !pending && <><p>Video và chú thích bên trên sẽ được đăng lên tài khoản đã chọn.</p>
              <Button disabled={!canPublish || profile?.apiMode === 'browser' && !live.status?.browserEnabled || profile?.apiMode !== 'browser' && (!live.status?.api?.enabled || !live.status?.api?.videoUrlEnabled && !live.status?.api?.resumableEnabled)} onClick={publish}><Play size={16}/>{profile?.apiMode !== 'browser' ? 'Đăng qua API' : profile?.session === 'signed_in' ? 'Đăng video' : 'Đăng sau khi đăng nhập'}</Button></>}
            {published && plan.data.postUrl && <a className="lab-button neutral" href={plan.data.postUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Xem bài đã đăng</a>}
            {production && <a href={`?view=production&production=${encodeURIComponent(production.id)}`}>Mở dự án video</a>}
            {!production && <Button tone="neutral" disabled={disabled || demo || !(plan.data.hook || plan.data.script)} onClick={() => onCreateProduction(plan)}>Tạo dự án từ kịch bản</Button>}
          </div></div>
        {latest && <div className="instagram-job-status" aria-live="polite"><Badge tone={jobTone(latest)}>{instagramStateLabels[latest.state]}</Badge><p>{latest.error || latest.history.at(-1)?.note}</p>{latest.syncError && <p>{latest.syncError}</p>}{jobActions(latest)}</div>}
        <PlanUtmLink key={plan.id + ':' + plan.revision} plan={plan} records={records} disabled={disabled || busy || !!pending} onSave={onSavePlan}/>
        {published && <InstagramMetrics record={records.find(record=>record.kind==='social_metric'&&record.data.planId===plan.id)}
          state={live.status?.metrics?.rows.find(row=>row.planId===plan.id)} disabled={disabled||busy||demo||!live.status}
          foreground={!!profile?.open&&!profile.background}
          onRefresh={()=>act('instagramRefreshMetrics',{planId:plan.id},'Đã cập nhật số liệu từ Instagram.')}
          onLogin={account?()=>act('instagramOpen',{id:account.id}):undefined}/>}
        {published && commentPost && <InstagramKeywordComments key={plan.id} plan={plan} keyword={commentPost.plannedCtaKeyword??commentPost.ctaKeyword}
          measurements={commentPost.keywordMeasurements} disabled={disabled||busy||!['published_manual','published_browser'].includes(plan.data.status)} onSave={onSaveComments}/>}
      </section>
    </div>}
    {tab === 'history' && <div className="instagram-history">{jobs.slice((historyCurrentPage - 1) * 8, historyCurrentPage * 8).map(job => <article className="production-card production-card-body" key={job.id}>
      <header><h3>{job.snapshot.name}</h3><Badge tone={jobTone(job)}>{instagramStateLabels[job.state]}</Badge></header>
      <p>{job.handle ? '@' + job.handle : accounts.find(account => account.id === job.snapshot.accountId)?.data.name} · {formatTime(job.createdAt)}</p>
      {job.apiReceipt && <p>Receipt API · Container: {job.apiReceipt.containerId ?? 'Chưa nhận được mã'} · Media: {job.apiReceipt.mediaId ?? 'Chưa xác nhận'} · {job.apiReceipt.statusCode ?? 'Cần đối soát'}</p>}
      {(job.error || job.syncError) && <p role="status">{job.error || job.syncError}</p>}{jobActions(job)}
      <details><summary>Tiến trình và nội dung đã gửi</summary><p className="muse-chat-text">{job.snapshot.caption}</p><ol>{job.history.map((step, index) => <li key={index}><time>{formatTime(step.at)}</time> · {step.note}</li>)}</ol></details>
    </article>)}{!jobs.length && <Empty title="Chưa có lượt đăng" text="Chọn một nội dung và video để bắt đầu."/>}<Pagination page={historyCurrentPage} total={jobs.length} size={8} onPage={setHistoryPage}/></div>}
    <Modal open={!!config} title="Kết nối hồ sơ Instagram" description={config?.data.name} dirty={dirty} locked={busy} onClose={() => setConfig(null)}>
      {config && <RecordForm kind="social_account" validation={configSchema} initial={{apiAppId:configProfile?.apiAppId??'',apiMode:configProfile?.apiMode ?? 'api',apiUserId:configProfile?.apiUserId ?? '',apiToken:'',clearApiToken:false,vpnEnabled: configProfile?.vpnEnabled ?? true, server: configProfile?.proxy.server ?? '', username: configProfile?.proxy.username ?? '', password: '', clearPassword: false}}
        fields={[{name:'apiMode',label:'Cách kết nối',type:'select',options:[{value:'api',label:'Instagram API (mặc định)'},...(live.status?.browserEnabled?[{value:'browser',label:'Trình duyệt (đã chấp nhận cảnh báo)'}]:[])],help:'API cần tài khoản Business/Creator và quyền Meta. Trình duyệt chỉ chọn được sau khi bật tay trong Cài đặt → Instagram.',full:true},
          {name:'apiAppId',label:'Meta App ID'},
          {name:'apiUserId',label:'Mã tài khoản Instagram API',help:'Mã user_id từ Instagram Login; không dùng mã phiên trình duyệt.'},
          {name:'apiToken',label:'Token Instagram API',type:'password',help:configProfile?.hasApiToken ? 'Đã mã hóa token. Để trống để giữ token cũ.' : 'Token chỉ được lưu mã hóa trên máy.'},
          {name:'clearApiToken',label:'Xóa token API đã lưu',type:'checkbox'},
          {name: 'vpnEnabled', label: 'Tự bật Touch VPN khi mở hồ sơ', type: 'checkbox'}, {name: 'server', label: 'Proxy riêng', placeholder: 'http://host:port hoặc socks5://host:port', help: 'Tắt Touch VPN khi dùng proxy riêng. VPN/proxy này chỉ áp dụng cho trình duyệt.', full: true},
          {name: 'username', label: 'Tài khoản proxy'}, {name: 'password', label: 'Mật khẩu proxy', type: 'password', help: configProfile?.proxy.hasPassword ? 'Đã lưu mật khẩu. Để trống để giữ mật khẩu cũ.' : ''}, {name: 'clearPassword', label: 'Xóa mật khẩu proxy đã lưu', type: 'checkbox'}]}
        onDirty={setDirty} onCancel={() => setConfig(null)} onSave={async value => {await action('instagramSaveProfile', {id: config.id, apiAppId:value.apiAppId,apiMode:value.apiMode,apiUserId:value.apiUserId,apiToken:value.apiToken,clearApiToken:value.clearApiToken,vpnEnabled: value.vpnEnabled, proxy: {server: value.server, username: value.username, password: value.password, clearPassword: value.clearPassword}}, 'Đã lưu kết nối hồ sơ.'); setDirty(false); setConfig(null);}}/>}
      {configProfile?.open && <p className="info-panel">Đóng trình duyệt của hồ sơ trước khi lưu thay đổi kết nối.</p>}
    </Modal>
  </div>;
}
