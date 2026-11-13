"use client";
import {Hint,VisualEmpty} from './visual';
import {Search as SearchArt} from 'lucide-react';

import { useEffect, useRef, useState, type ReactNode, type ComponentProps } from "react";
import { z } from "zod";
import { Plus, Search, Download, Eye, ArrowLeft } from "lucide-react";
import { Button, Badge, Empty, Modal, RecordForm, ClientError, api, type FieldDef } from "./primitives";
import { type Kind, type LabRecord, formatTime, schemas } from "@/lib/lab/domain";
import { currencyFields } from "./currency-fields";
import { candidateSchema, landingHtml, landingPageSchema, type Candidate, type ResearchBatch } from "@/lib/lab/operations";
import {saveResearchSelection, completeResearchProfiles, researchSelection, deployResearchProducts, researchFailure} from '@/lib/lab/research-selection';
import {newProduction} from '@/lib/lab/production';
import {candidateProductId,planDailySelection,suggestProductKey,selectionEntries} from '@/lib/lab/daily-selection';
import {vietnamDay} from '@/lib/lab/domain';
import { desktopBridge, fetchAssetBytes } from "@/lib/lab/desktop-client";
import InstagramPanel from './instagram-panel';
import InstagramOverview from './instagram-overview';
import ResearchCandidates from './research-candidates';
import ProductDeploymentPanel from './product-deployment';
import ResearchLauncher from './research-launcher';
import {ProductCheckFields} from './product-check-fields';
import ViralFormulas from './viral-formulas';
import {instagramProductSummary} from '@/lib/lab/instagram-summary';
import {sampleCheckWarning} from '@/lib/lab/sample-check';
import TextExchange from './text-exchange';
import {parseTextExchange, importTextResearch} from '@/lib/lab/codex-exchange';
import {researchBatchSchema} from '@/lib/lab/operations';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';

type Props = {
  view: "research" | "social" | "landing";
  records: LabRecord[];
  demo: boolean;
  offline: boolean;
  persist: (kind: Kind, id: string, data: Record<string, any>, revision?: number, action?: string) => Promise<LabRecord>;
  notify: (message: string, tone?: string) => void;
  reload: () => void;
  onRecords: (records: LabRecord[]) => void;
};
type FormSpec = {
  title: string;
  kind: Kind;
  initial: Record<string, any>;
  fields: FieldDef[];
  validation?: {safeParse: (value: any) => any};
  extra?: ComponentProps<typeof RecordForm>['extra'];
  save: (value: any) => Promise<unknown>;
};
const newId = () => crypto.randomUUID().replaceAll("-", "");
const options = (records: LabRecord[]) => records.map(record => ({value: record.id, label: record.data.name}));
import MuseChatPanel, {type Chat} from './muse-chat';
import {museTaskPrompt, mergeMuseResearch, parseMuseResponse, type MuseTaskKind} from '@/lib/lab/muse-workflows';

const candidateFormSchema = candidateSchema.extend(Object.fromEntries(["price", "cost", "shipping"].map(key => [key,
  z.preprocess(value => value === "" || Number.isNaN(value) ? null : value, z.number().finite().min(0).max(1e9).nullable()),
])));

export default function OperationsPanel({view, records, demo, offline, persist, notify, reload, onRecords}: Props) {
  const {status: desktopStatus} = useDesktopStatus();
  const [deploymentProfileId,setDeploymentProfileId]=useState('');
  const activeDeploymentProfile=desktopStatus?.profiles.find(p=>p.enabled&&p.id===deploymentProfileId)?.id??desktopStatus?.profiles.find(p=>p.enabled)?.id??'';
  const musePaused = desktopStatus?.musePaused !== false;
  const [selected, setSelected] = useState(() => new URL(location.href).searchParams.get("ops_id") ?? "");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, Record<string, string>>>({});
  const [preview, setPreview] = useState("");
  const [museTask, setMuseTask] = useState<{kind: MuseTaskKind; recordId: string; prompt: string} | null>(null);
  const lock = useRef(false);
  const products = records.filter(record => record.kind === "product" && (view === 'social' || !record.data.archived));
  const batches = records.filter(record => record.kind === "research_batch").sort((a,b)=>b.updatedAt-a.updatedAt);
  const choices = view === "research" ? batches : products;
  const chosen = choices.find(record => record.id === selected) ?? (view === 'social' ? undefined : choices[0]);
  const accounts = records.filter(record => record.kind === "social_account" && record.data.productId === chosen?.id);
  const plans = records.filter(record => record.kind === "content_plan" && record.data.productId === chosen?.id);
  const landing = records.find(record => record.kind === "landing_page" && record.data.productId === chosen?.id);
  const sampleWarning = chosen && sampleCheckWarning(chosen.data);
  const disabled = busy || (!demo && offline);
  useEffect(()=>{const restore=()=>setSelected(new URL(location.href).searchParams.get('ops_id')??'');window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);

  function select(id: string) {
    setSelected(id);
    setPage(1);
    const url = new URL(location.href);
    if(id)url.searchParams.set("ops_id", id);else url.searchParams.delete('ops_id');
    url.searchParams.delete('ig_tab');url.searchParams.delete('ig_plan');
    if(view==='social')history.pushState({}, "", url);else history.replaceState({}, "", url);
  }
  function show(spec: FormSpec) { setDirty(false); setError(""); setForm(spec); }
  async function execute(task: () => Promise<unknown>) {
    if (lock.current) throw new ClientError("Chờ thao tác đang lưu hoàn tất.");
    lock.current = true;
    setBusy(true);
    setError("");
    try { await task(); }
    catch (failure) { setError((failure as Error).message); throw failure; }
    finally { lock.current = false; setBusy(false); }
  }
  function act(task: () => Promise<unknown>) { void execute(task).catch(() => {}); }
  async function save(kind: Kind, id: string, data: Record<string, any>, revision = 0, action?: string) {
    const record = await persist(kind, id, data, revision, action);
    notify(demo ? "Đã lưu trong phiên mẫu." : "Đã lưu vào không gian làm việc.");
    return record;
  }
  function batchForm() {
    const id = newId();
    show({title: "Tạo đợt nhập tay", kind: "research_batch", initial: {name: "", market: "United States", locale: "en-US", candidates: [], selectedIds: [], notes: ""},
      fields: [{name: "name", label: "Tên đợt"}, {name: "market", label: "Thị trường"}, {name: "locale", label: "Ngôn ngữ nội dung"}],
      save: async value => { await save("research_batch", id, value); select(id); }});
  }
  function candidateForm(candidate?: Candidate) {
    if (!chosen) return;
    const batch = chosen.data as ResearchBatch;
    show({title: candidate ? "Sửa ứng viên" : "Thêm ứng viên có nguồn", kind: "research_batch", validation: candidateFormSchema,
      extra: (values, change, errors) => <ProductCheckFields values={values} change={change} errors={errors}/>,
      initial: candidate ?? {id: newId(), name: "", supplierUrl: "", supplierCountry: "", evidenceUrl: "", evidenceNotes: "", contentAngle: "", risks: "", cost: null, shipping: null, price: null, currency: "USD"},
      fields: [
        {name: "name", label: "Tên sản phẩm"}, {name: "supplierCountry", label: "Quốc gia nhà cung cấp", help: "Điền theo nguồn đã đọc."},
        {name: "supplierUrl", label: "URL nguồn hàng", type: "url", full: true}, {name: "evidenceUrl", label: "URL bằng chứng bổ sung", type: "url", full: true},
        {name: "evidenceNotes", label: "Thông tin đã kiểm tra tại nguồn", type: "textarea", full: true},
        {name: "cost", label: "Giá vốn dự kiến", type: "number", help: "Để trống nếu chưa biết."},
        {name: "shipping", label: "Phí ship dự kiến", type: "number", help: "Để trống nếu chưa biết."},
        {name: "price", label: "Giá bán giả định", type: "number", help: "Dùng để so sánh ứng viên."},
        ...currencyFields,
        {name: "contentAngle", label: "Hướng thử AI content", type: "textarea", full: true},
        {name: "risks", label: "Điều còn thiếu hoặc cần kiểm chứng", type: "textarea", full: true},
      ],
      save: value => save("research_batch", chosen.id, {...batch, candidates: candidate ? batch.candidates.map(row => row.id === candidate.id ? value : row) : [...batch.candidates, value]}, chosen.revision),
    });
  }
  function openMuseTask(kind: MuseTaskKind) {
    if (!chosen) return;
    const context = view === 'research'
      ? {query: chosen.data.name, market: chosen.data.market, locale: chosen.data.locale, maxLandedCostUsd: chosen.data.maxLandedCostUsd ?? 20,
        remainingSlots: 10 - chosen.data.candidates.length, existing: chosen.data.candidates.map((candidate: Candidate) => candidate.name),
        sourcing:'Ưu tiên nguồn Trung Quốc giá vốn thấp, sản phẩm không thương hiệu phù hợp video thử cho Mỹ. Đọc listing cụ thể; ghi giá theo tier, MOQ, điều kiện dropship một chiếc. Không lấy giá bán lẻ thương hiệu làm giá vốn. Giữ ship chưa rõ là null. Giá bán chỉ là giả thuyết. Giải thích bằng tiếng Việt, hook bằng tiếng Anh.'}
      : {product: chosen.data, metrics: instagramProductSummary(records,chosen.id)};
    setMuseTask({kind, recordId: chosen.id, prompt: museTaskPrompt(kind, context)});
  }
  async function applyMuseTask(text: string, chat: Chat) {
    if (!museTask) return;
    const current = records.find(record => record.id === museTask.recordId);
    if (!current) throw new ClientError('Bản ghi đã thay đổi. Tải lại dữ liệu rồi mở hội thoại.');
    if (museTask.kind === 'research') {
      const updated = mergeMuseResearch(current.data as ResearchBatch, chat);
      if (updated !== current.data) await execute(() => save('research_batch', current.id, updated, current.revision));
      if (!demo && desktopBridge()?.researchQueueSources) {
        try { await desktopBridge()!.researchQueueSources({batchId: current.id}); }
        catch (error) { notify('Kết quả Muse đã lưu; chưa xếp được tác vụ kiểm nguồn: ' + (error as Error).message); }
      }
      return;
    }
    if (museTask.kind === 'analysis') return;
    const draft = {...parseMuseResponse(museTask.kind, text),provider:'muse'} as Record<string, any>;
    if (museTask.kind === 'content') planForm(undefined, draft);
    else landingForm(draft);
    setMuseTask(null);
    setDirty(true);
  }
  async function selectCandidate(candidate: Candidate, checked: boolean) {
    if(!chosen)return;
    const batch=chosen,product=records.find(r=>r.kind==='product'&&r.id===candidateProductId(batch,candidate.id));
    const selection=selectionEntries(records).find(s=>s.selectionDay===vietnamDay()&&s.productId===product?.id);
    const apply=async(value:Record<string,any>)=>{
      const input={batchId:batch.id,candidateId:candidate.id,revision:batch.revision,checked,...value};
      try {
        const rows=demo?planDailySelection(records,input):(await api('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'select_daily',input})})).records;
        onRecords(rows);notify(checked?'Đã lưu lựa chọn hôm nay và giữ hồ sơ sản phẩm.':'Đã bỏ lựa chọn hôm nay. Hồ sơ và lịch sử vẫn giữ.');
      }catch(error){reload();throw error;}
    };
    if(!checked){await apply({});return;}
    show({title:'Chọn sản phẩm hôm nay · '+candidate.name,kind:'product',
      initial:{productKey:product?.data.productKey??'',rank:selection?.rank??null,reason:selection?.reason??''},
      validation:z.object({productKey:z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/, 'Nhập mã 2–64 chữ in hoa, số, gạch ngang hoặc gạch dưới.'),rank:z.number().int().min(1,'Chọn hạng 1–3.').max(3),reason:z.string().max(1000)}),
      fields:[{name:'productKey',label:'Mã sản phẩm',placeholder:suggestProductKey(candidate.name),help:product?.data.productKey?'Mã đã gán là bất biến. Giữ đúng mã để dùng lại hồ sơ.':'Gợi ý: '+suggestProductKey(candidate.name)+'. Tự nhập hoặc dùng mã hồ sơ đã có; gợi ý chưa được lưu.'},
        {name:'rank',label:'Thứ hạng hôm nay',type:'number',nullable:true,help:'Tự xếp 1–3. Mỗi hạng chỉ có một sản phẩm.'},
        {name:'reason',label:'Lý do lựa chọn',type:'textarea',full:true}],save:apply});
  }
  async function completeProfiles(candidateIds?: string[]) {
    if (!chosen) return;
    const errors = await completeResearchProfiles(chosen, records, persist, candidateIds);
    setProfileErrors(previous => ({...previous, [chosen.id]: errors}));
    if (Object.keys(errors).length) reload();
  }
  async function deployProducts() {
    if (!chosen) return;
    const products = researchSelection(chosen, records).ready;
    if(!demo&&desktopStatus?.musePaused===false){
      const bridge=desktopBridge();
      if(!bridge?.deploymentStart)throw new ClientError('Khởi động lại Hermes Clip bản mới để triển khai tự động.');
      const run=await bridge.deploymentStart({batchId:chosen.id,productIds:products.map(p=>p.id),profileId:activeDeploymentProfile||undefined});
      notify(run.state==='ready_for_review'?'Video của đợt này đã sẵn sàng; mở bảng tiến độ để duyệt.':run.state==='needs_attention'||run.state==='paused'?'Đợt đã lưu đang cần kiểm tra. Xem lý do và bấm Tiếp tục cùng đợt.':'Đã giao đợt cho Muse. Theo dõi từng sản phẩm bên dưới; bạn chỉ cần duyệt video cuối.');
      window.dispatchEvent(new Event('product-lab:workspace-changed'));reload();return;
    }
    const result = await deployResearchProducts(products, async envelope => {
      if (!demo) return api('/api/production', {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(envelope)});
      const existing = records.find(row => row.kind === 'production' && row.data.productId === envelope.input.productId);
      if (existing) return {record: existing, deduplicated: true};
      const product = products.find(row => row.id === envelope.input.productId)!;
      return {record: {id: envelope.id, kind: 'production', revision: 1, updatedAt: Date.now(),
        data: newProduction(envelope.input.name, product.id, product.revision, envelope.input.locale)}};
    });
    onRecords(result.projects);
    if (result.errors.length) {
      reload();
      throw new ClientError(`Đã tạo ${result.created} dự án video. Chưa hoàn tất: ${result.errors.join(' · ')}. Bấm Triển khai để đối soát; dự án đã có sẽ được giữ.`);
    }
    if (!result.projects.length) return;
    notify(`Đã tạo ${result.created} dự án video.${result.projects.length > result.created ? ` Dùng lại ${result.projects.length-result.created} dự án đã có.` : ''} Bước tiếp: viết cảnh → duyệt → Xuất gói prompt cho Flow/Gemini`);
    const url = new URL(location.href);
    for (const key of ['ops_id','new_product','p_q','p_page','desk_scene','desk_take']) url.searchParams.delete(key);
    url.searchParams.set('view','production');url.searchParams.set('production',result.projects[0].id);url.searchParams.set('stage','scenes');
    history.pushState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'));
  }
  function accountForm(account?: LabRecord) {
    if (!chosen) return;
    const id = account?.id ?? newId();
    show({title: account ? "Sửa hồ sơ Instagram" : "Thêm hồ sơ Instagram", kind: "social_account",
      initial: account?.data ?? {name: `Instagram · ${chosen.data.name}`.slice(0,120), productId: chosen.id, handle: "", contentAngle: "", bio: "", notes: "", archived: false},
      fields: [{name: "name", label: "Tên hồ sơ"}, {name: "handle", label: "Tên người dùng dự kiến (không bắt buộc)", help: "Để trống để nhận diện sau khi đăng nhập. Nếu điền, bỏ ký tự @."},
        {name: "contentAngle", label: "Hướng nội dung cho tài khoản này", type: "textarea", full: true},
        {name: "bio", label: "Bio dự kiến", type: "textarea", full: true}, {name: "notes", label: "Ghi chú", type: "textarea", full: true},
        {name: "archived", label: "Lưu trữ hồ sơ", type: "checkbox"}],
      save: async value => {
        await save("social_account", id, value, account?.revision ?? 0);
        if (!account && !demo) {
          try { await desktopBridge()?.instagramOpen({id}); }
          catch (reason) { notify('Đã lưu hồ sơ. Chưa mở được trình duyệt: ' + (reason as Error).message, 'warning'); }
        }
      }});
  }
  function planForm(plan?: LabRecord, draft: Record<string, any> = {}) {
    if (!chosen) return;
    const id = plan?.id ?? newId();
    show({title: plan ? "Sửa kế hoạch nội dung" : "Thêm kế hoạch nội dung", kind: "content_plan",
      initial: plan ? {...plan.data, aiLabel: plan.data.aiLabel ?? 'off'} : {provider:"manual",name: "", productId: chosen.id, accountId: accounts.find(account => !account.data.archived)?.id ?? "", productionId: "", hook: "", script: "", caption: "", plannedDate: "", status: "draft", postUrl: "", notes: "", aiLabel: 'off', ...draft},
      fields: [{name: "name", label: "Tên nội dung"},
        {name: "accountId", label: "Tài khoản", type: "select", options: [{value: "", label: "Gắn tài khoản sau"}, ...options(accounts.filter(account => !account.data.archived))]},
        {name: "productionId", label: "Dự án video", type: "select", options: [{value: "", label: "Chưa gắn dự án"}, ...options(records.filter(record => record.kind === "production" && record.data.productId === chosen.id))]},
        {name: "plannedDate", label: "Ngày dự kiến", placeholder: "YYYY-MM-DD", help: "Lưu lịch dự kiến trong app."},
        {name: "hook", label: "Mở đầu bằng tiếng Anh", type: "textarea", full: true}, {name: "script", label: "Khung khung content tiếng Anh", type: "textarea", full: true},
        {name: "caption", label: "Chú thích tiếng Anh", type: "textarea", full: true},
        {name:'apiVideoUrl',label:'URL video công khai cho Instagram API',help:'HTTPS của đúng file đã chọn và duyệt. Meta tải từ URL này; không dùng localhost hoặc URL chứa token. App không tự tải video lên dịch vụ khác.',full:true},
        {name: "ctaKeyword", label: "Từ khóa CTA", placeholder: "LED / RUN / HELP", help: "Một từ tiếng Anh. Để trống để dùng từ khóa từ biến thể video đã gắn."},
        ...(plan?.data.status === 'published_browser' ? [] : [{name: "status", label: "Trạng thái", type: "select" as const, options: [{value: "draft", label: "Nháp"}, {value: "planned", label: "Đã lên kế hoạch"}, {value: "published_manual", label: "Đã đăng · ghi nhận thủ công"}]}]),
        {name: "postUrl", label: "URL bài Instagram", type: "url"}, {name: "notes", label: "Ghi chú", type: "textarea", full: true}],
      save: value => save("content_plan", id, value, plan?.revision ?? 0)});
  }
  async function createProduction(plan: LabRecord) {
    const id = `content_${plan.id}_r${plan.revision}`;
    await api('/api/production', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      id, revision: 0, commandId: id, action: 'create', input: {name: plan.data.name, productId: plan.data.productId,
        locale: chosen?.data.locale || 'en-US', contentPlanId: plan.id, contentPlanRevision: plan.revision},
    })});
    reload();
    notify("Đã tạo dự án và cảnh nháp. Mở dự án để gắn tham chiếu và duyệt khung content.");
  }
  function landingForm(draft: Record<string, any> = {}) {
    if (!chosen) return;
    show({title: "Nội dung landing page tiếng Anh", kind: "landing_page",
      extra: () => sampleWarning ? <div className="advice-banner warning" role="status">{sampleWarning}</div> : null,
      initial: {...(landing?.data ?? {provider:"manual",productId: chosen.id, headline: chosen.data.name, description: "", benefits: "", limitations: "", imageAssetId: "", ctaLabel: "Learn more", ctaUrl: ""}), ...draft},
      fields: [{name: "headline", label: "Tiêu đề chính", full: true}, {name: "description", label: "Mô tả tiếng Anh", type: "textarea", full: true},
        {name: "benefits", label: "Điểm nổi bật có bằng chứng · mỗi dòng một ý", type: "textarea", full: true},
        {name: "limitations", label: "Giới hạn và thông tin cần biết", type: "textarea", full: true},
        {name: "imageAssetId", label: "Ảnh trong không gian làm việc", type: "select", options: [{value: "", label: "Chưa chọn ảnh"}, ...records.filter(record => record.kind === "asset" && ["image/png", "image/jpeg", "image/webp"].includes(record.data.type)).map(record => ({value: record.id, label: record.data.name}))], full: true},
        {name: "ctaLabel", label: "Nhãn nút"}, {name: "ctaUrl", label: "URL đích do bạn chọn", type: "url", help: "Để trống để ẩn nút."}],
      save: value => save("landing_page", `landing_${chosen.id}`, value, landing?.revision ?? 0)});
  }
  async function makeLanding(exportFile: boolean) {
    if (!landing) return;
    const data = landingPageSchema.parse(landing.data);
    let image = "";
    if (data.imageAssetId) {
      const asset = records.find(record => record.id === data.imageAssetId && record.kind === "asset");
      if (!asset) throw new ClientError("Ảnh đã chọn chưa có trong không gian làm việc. Tải lại dữ liệu.");
      const bytes = await fetchAssetBytes(asset.id, AbortSignal.timeout(30000));
      image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Không đọc được ảnh landing page."));
        reader.readAsDataURL(new Blob([new Uint8Array(bytes)], {type: asset.data.type}));
      });
    }
    const html = landingHtml(data, image);
    if (!exportFile) { setPreview(html); return; }
    const url = URL.createObjectURL(new Blob([html], {type: "text/html;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `landing-${chosen!.id}.html`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    notify("Đã xuất HTML kèm ảnh để xem trên máy.");
  }

  function researchView(): ReactNode {
    if (!chosen) return <VisualEmpty text="Bắt đầu với sản phẩm bạn muốn kiểm chứng." icon={<SearchArt size={56}/>} action={<Button onClick={()=>{const panel=document.querySelector<HTMLDetailsElement>('.research-config');if(panel){panel.open=true;panel.scrollIntoView({block:'start'});}}}>Bắt đầu nghiên cứu</Button>}/>;
    const batch = chosen.data as ResearchBatch;
    return <>
      <div className="operations-toolbar"><Badge>{batch.candidates.length}/10 ứng viên</Badge><Badge>{batch.selectedIds.length}/3 đã chọn</Badge>
        <Button tone="neutral" disabled={disabled || batch.candidates.length >= 10} onClick={() => candidateForm()}><Plus size={16}/>Thêm ứng viên</Button>
        <Button tone="neutral" disabled={musePaused || disabled || demo || !desktopBridge() || batch.candidates.length >= 10} onClick={() => openMuseTask("research")}><Search size={16}/>{batch.candidates.length>=10?'Đã đủ 10 ứng viên':'Nghiên cứu bằng Muse'}</Button>
      </div>
      <ResearchCandidates key={chosen.id} record={chosen} records={records} disabled={disabled} onEdit={candidateForm}
        promotionErrors={profileErrors[chosen.id]} onComplete={ids=>act(()=>completeProfiles(ids))} onDeploy={()=>act(deployProducts)}
        onSelect={(candidate,checked)=>act(()=>selectCandidate(candidate,checked))}/>
      {!demo&&desktopBridge()&&<ProductDeploymentPanel batchId={chosen.id} profiles={desktopStatus?.profiles??[]} profileId={activeDeploymentProfile} onProfile={setDeploymentProfileId} batch={desktopStatus?.batch} selectedCount={researchSelection(chosen,records).ready.length}/>}
      {batch.notes && <details className="operations-evidence"><summary>Kết quả tìm nguồn đã lưu</summary><pre>{batch.notes}</pre></details>}
    </>;
  }
  function socialView(): ReactNode {
    if (!chosen) return <InstagramOverview products={products} records={records} demo={demo} onOpen={select}/>;
    return <InstagramPanel key={chosen.id} product={chosen} accounts={accounts} plans={plans} records={records}
      demo={demo} disabled={disabled} onAccount={accountForm} onPlan={planForm}
      onSaveComments={(id,data)=>save('keyword_comment_measurement',id,data)}
      onSavePlan={(plan,data)=>save('content_plan',plan.id,data,plan.revision)}
      onCreateProduction={plan => act(() => createProduction(plan))} notify={notify}/>;
  }

  const titles = {research: "Nghiên cứu sản phẩm", social: chosen?chosen.data.name:"Instagram · Tổng quan sản phẩm", landing: "Trang giới thiệu"};
  return <section className="operations-panel">
    {view==='social'&&chosen&&<div><Button tone="ghost" onClick={()=>select('')}><ArrowLeft size={16}/>Tất cả sản phẩm</Button></div>}
    <header className="operations-heading"><div><h1>{titles[view]}</h1><Hint>{view === "research" ? "So sánh ứng viên có nguồn, chọn tối đa 3 sản phẩm." : "Theo dõi theo sản phẩm."}</Hint></div>{view === "research" && <Button tone="neutral" disabled={disabled} onClick={batchForm}>Tạo đợt nhập tay</Button>}</header>
    {view==='research'&&<details className="research-config"><summary><SearchArt size={20}/> Nhập / nghiên cứu sản phẩm</summary><ResearchLauncher scope={chosen?.id} disabled={disabled||demo} onOpen={id=>{select(id);reload();}}
      actions={(context,invalid,onMuse,previous)=><TextExchange scope={chosen?.id} onMuse={onMuse} previous={previous} key={chosen?.id ?? 'new'} kind="research" demo={demo} disabled={disabled || invalid}
        target={chosen ? 'Nhập vào đợt: '+chosen.data.name : 'Nhập vào đợt mới'}
        context={{...context, remainingSlots:10-(chosen?.data.candidates.length ?? 0), existing:chosen?.data.candidates.map((candidate:Candidate)=>candidate.name) ?? []}}
        onApply={async (text,tool,importId,provider)=>{
          const result=parseTextExchange('research',text,tool), id=chosen?.id ?? 'import_'+importId;
          const batch=chosen?.data as ResearchBatch | undefined ?? researchBatchSchema.parse({name:'Research · '+tool,maxLandedCostUsd:context.maxLandedCostUsd});
          const imported=importTextResearch(batch,{...result,candidates:result.candidates.map(candidate=>({...candidate,provider}))},importId);
          if(imported.data!==batch){await execute(()=>save('research_batch',id,imported.data,chosen?.revision ?? 0));select(id);}
          notify(imported.notice);return imported.notice;
        }}/>} /></details>}
    {view === 'research' && <ViralFormulas records={records} disabled={disabled||demo} onSaveDraft={(draft,revision)=>persist('reference_video_draft','reference_video_draft_'+draft.id,draft,revision)} onSaveFormula={formula=>persist('viral_formula',`viral_formula_${formula.id}_v${formula.version}`,formula,0)}/>}
    {choices.length > 0 && view!=='social' && <div className="field operations-selector"><label htmlFor="operations-selection">{view === "research" ? "Đợt nghiên cứu" : "Sản phẩm"}</label><select id="operations-selection" value={chosen?.id ?? ""} disabled={busy} onChange={event => select(event.target.value)}>{choices.map(record => <option key={record.id} value={record.id}>{record.data.name}</option>)}</select></div>}
    {chosen && view !== 'research' && <div className="operations-toolbar">
      <TextExchange scope={'task_'+(view==='social'?'content':'landing')+'_'+chosen.id} onMuse={()=>openMuseTask(view==='social'?'content':'landing')} key={view+chosen.id} kind={view==='social'?'content':'landing'} context={{product:chosen.data, metrics:instagramProductSummary(records,chosen.id)}}
        target={'Sản phẩm: '+chosen.data.name} disabled={disabled} demo={demo} onApply={async (text,tool,_importId,provider)=>{
          if(view==='social') planForm(undefined,{...parseTextExchange('content',text,tool),provider,notes:'Nguồn: '+provider});
          else landingForm({...parseTextExchange('landing',text,tool),provider});
          setDirty(true);
        }}/>

      <Button tone="neutral" disabled={musePaused || disabled || demo || !desktopBridge()} onClick={() => openMuseTask('analysis')}>Phân tích bằng Muse</Button>
    </div>}
    {error && <div className="inline-error" role="alert"><p>{error}</p><Button tone="ghost" onClick={reload}>Tải lại dữ liệu</Button></div>}
    {view === "research" ? researchView() : view === "social" ? socialView() : !chosen ? <Empty title="Cần hồ sơ sản phẩm" text="Thêm sản phẩm trước khi soạn landing page."/> : <>
      {sampleWarning && <div className="advice-banner warning" role="status">{sampleWarning}</div>}
      <div className="info-panel">Soạn trang tiếng Anh, xem trước và xuất HTML trên máy. Xuất bản, thu lead và nhận tiền đang chờ quyết định thương mại.</div>
      <div className="operations-toolbar"><Button disabled={disabled} onClick={() => landingForm()}>{landing ? "Sửa nội dung trang" : "Soạn landing page"}</Button><Button tone="neutral" disabled={disabled || !landing || demo} onClick={() => act(() => makeLanding(false))}><Eye size={16}/>Xem trước</Button><Button tone="neutral" disabled={disabled || !landing || demo} onClick={() => act(() => makeLanding(true))}><Download size={16}/>Xuất HTML trên máy</Button></div>
      {landing && <article className="production-card production-card-body"><h2>{landing.data.headline}</h2><p>{landing.data.description}</p><Badge>Bản nháp trên máy · {landing.data.provider??'Chưa ghi nguồn'}</Badge><small>Cập nhật {formatTime(landing.updatedAt)}</small></article>}
    </>}
    <Modal open={!!form} title={form?.title ?? ""} dirty={dirty} locked={busy} onClose={() => { setForm(null); setDirty(false); }}>
      {form && <RecordForm key={form.title + String(form.initial.id ?? "")} kind={form.kind} initial={form.initial} fields={form.fields} extra={form.extra} validation={form.validation ?? schemas[form.kind]} demo={demo} onDirty={setDirty} onCancel={() => setForm(null)} onSave={async value => { await execute(() => form.save(value)); setDirty(false); setForm(null); }}/>}</Modal>
    <Modal open={!!museTask} title={museTask?.kind === 'research' ? 'Nghiên cứu bằng Muse' : 'Trợ lý Muse'} locked={busy} onClose={() => setMuseTask(null)}
      description={museTask?.kind === 'research' ? 'Muse tìm nguồn và tự lưu ứng viên vào đợt. Bạn kiểm tra nguồn và chọn tối đa 3 sản phẩm.' : 'Muse dùng hồ sơ sản phẩm và số liệu đã lưu để soạn nội dung.'}>
      {museTask && <div className="modal-body"><MuseChatPanel key={museTask.kind + museTask.recordId}
        projectId={'task_' + museTask.kind + '_' + museTask.recordId} demo={demo} initialPrompt={museTask.prompt}
        autoApply={museTask.kind === 'research'} onResponse={museTask.kind === 'analysis' ? undefined : applyMuseTask}
        responseLabel={museTask.kind === 'research' ? 'Lưu ứng viên vào đợt' : 'Mở bản nháp để duyệt'}/></div>}
    </Modal>
    <Modal open={!!preview} title="Landing page · xem trước trên máy" description="Bản HTML dùng ảnh và nội dung đã lưu." onClose={() => setPreview("")}><iframe className="landing-preview" title="Landing page tiếng Anh" sandbox="" srcDoc={preview}/></Modal>
  </section>;
}
