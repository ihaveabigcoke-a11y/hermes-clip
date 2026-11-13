"use client";
import {useEffect,useMemo,useState} from 'react';
import {Activity,ArrowRight,CheckCircle2,Copy,Layers3,RefreshCw} from 'lucide-react';
import {type LabRecord,VIETNAM_TIME_ZONE} from '@/lib/lab/domain';
import {buildOfficeView,parseOfficeView,freshness,todayCount,activeProducts,officeGroups,type OfficeView,type OfficeGroup} from '@/lib/lab/office-view';
import {Badge,Button,Empty,Modal} from './primitives';
import './office.css';
import {SignalsDashboard} from './signals-dashboard';
import {productJourneyStep,type JourneyMedia} from '@/lib/lab/product-next-step';
import {ProductNextStepCard} from './product-next-step';

const clock=(value:string|null)=>value?new Date(value).toLocaleTimeString('vi-VN',{timeZone:VIETNAM_TIME_ZONE,hour12:false}):'Chưa biết';
const date=(value:string|null)=>value?value.split('-').reverse().join('/'):'Chưa biết';
const stageNames:Record<string,string>={research:'Nghiên cứu',script:'Chuẩn bị khung content',media:'Tạo media',review:'Duyệt phiên bản',publish:'Phát hành / đo',done:'Hoàn tất',dropped:'Đã lưu trữ'};
const providerNames:Record<string,string>={muse:'Muse',manual:'Nhập tay',codex:'Codex',openmontage:'OpenMontage','grok-cli':'Grok CLI',fal:'fal'};
const groupTone=(group:OfficeGroup)=>['failed','attention'].includes(group)?'error':group==='library'?'success':'neutral';

export default function OfficeViews({mode,records,demo,manual,jobs}:{jobs:Parameters<typeof productJourneyStep>[3];manual:JourneyMedia;mode:'signals'|'office';records:LabRecord[];demo:boolean}) {
  const [saved,setSaved]=useState<OfficeView|null>(null),[failed,setFailed]=useState(false),[tick,setTick]=useState(Date.now()),[retry,setRetry]=useState(0);
  const [productId,setProductId]=useState(''),[group,setGroup]=useState(''),[selected,setSelected]=useState(''),[copied,setCopied]=useState(false);
  const [scope,setScope]=useState<'today'|'active'>('today'),[query,setQuery]=useState(''),[day,setDay]=useState('');
  const demoView=useMemo(()=>demo?buildOfficeView(records,[],{},[],Date.now()):null,[demo,records]);
  const view=demo?demoView:saved;
  useEffect(()=>{
    if(demo)return;
    let disposed=false,busy=false;let controller:AbortController|null=null;
    async function read(){
      if(busy||disposed)return;busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),12000);
      try {
        const response=await fetch('/api/lab?view=office',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
        if(!response.ok)throw Error('Không đọc được dữ liệu.');
        const next=parseOfficeView((await response.json() as {view:unknown}).view);
        if(!disposed){setSaved(next);setFailed(false);setTick(Date.now());}
      }catch{if(!disposed)setFailed(true);}finally{clearTimeout(timeout);busy=false;}
    }
    void read();const timer=setInterval(()=>{setTick(Date.now());void read();},5000);
    const changed=()=>void read();window.addEventListener('product-lab:workspace-changed',changed);window.addEventListener('focus',changed);
    return()=>{disposed=true;controller?.abort();clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',changed);window.removeEventListener('focus',changed);};
  },[demo,retry]);
  useEffect(()=>{setSelected('');setCopied(false);},[mode]);
  const state=demo?'demo':failed?'disconnected':view?freshness(tick,view.generatedAt):'loading';
  const stateLabel={demo:'Dữ liệu mô phỏng',disconnected:'Mất kết nối',stale:'Dữ liệu cũ',live:'Trực tiếp',loading:'Đang đọc dữ liệu'}[state];
  const selectedRun=view?.runs.find(r=>r.id===selected);
  const selectedProduct=view?.products.find(p=>p.id===selectedRun?.productId);
  const productName=(id:string|null)=>view?.products.find(p=>p.id===id)?.name??'Chưa gắn sản phẩm';
  const runs=view?.runs.filter(r=>(!productId||r.productId===productId)&&(!group||r.group===group))??[];
  const sourceRuns=view?.runs.filter(r=>!productId||r.productId===productId)??[];
  const cards=(view?.products??[]).filter(p=>(scope==='today'?p.lastSelectedDay===view?.today:p.active)&&(!query||[p.name,p.key??''].join(' ').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))&&(!day||view?.selection.days.some(d=>d.day===day&&d.productIds.includes(p.id))))
    .sort((a,b)=>(a.priorityRank??4)-(b.priorityRank??4)||a.name.localeCompare(b.name,'vi'));
  return <section className="office-view" aria-label={mode==='signals'?'Tín hiệu & Phòng chờ':'Phòng sản xuất'}>
    <header className="office-heading"><div><div className="office-eyebrow">HERMES CLIP · THEO DÕI TIẾN ĐỘ</div><h1>{mode==='signals'?'Tín hiệu & Phòng chờ':'Phòng sản xuất'}</h1><p>{mode==='signals'?'Mỗi lượt chạy có một trạng thái. Xem lượt đang kẹt và việc cần xử lý.':'Ba lựa chọn hôm nay, cùng những sản phẩm từ trước còn việc.'}</p></div>
      <div className="office-freshness" role="status"><Badge tone={state==='live'?'success':state==='disconnected'?'error':'neutral'}>{stateLabel}</Badge><small>Cập nhật lúc {clock(view?.generatedAt??null)}{state==='stale'&&view?' · '+Math.floor((tick-Date.parse(view.generatedAt))/60000)+' phút trước':''}</small>{state==='disconnected'&&<Button tone="ghost" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>Thử lại</Button>}</div>
    </header>
    {view?<>
      {mode==='signals'&&<SignalsDashboard view={view} records={records} demo={demo} productId={productId} onSelect={setSelected}/>}<div className="office-summary"><div><span>ĐỢT CHỌN · {date(view.today)}</span><strong data-testid="office-counts">Hôm nay {todayCount(view)}/3 · Đang triển khai {activeProducts(view).length}</strong><small>{view.selection.totals.selectionsAllDays} lượt chọn qua các ngày · {view.selection.totals.distinctProducts} sản phẩm khác nhau</small></div><div className="office-unit-counts"><span><b>{view.runs.filter(r=>r.kind==='media').length}</b> lượt media</span><span><b>{view.runs.filter(r=>r.kind==='compose').length}</b> lượt ghép</span><span><b>{view.exports.length}</b> bản xuất</span><span><b>{view.posts.length}</b> bài đăng</span></div></div>
      {state==='disconnected'&&<p className="office-message" role="alert">Đang giữ dữ liệu lần đọc thành công gần nhất. Trạng thái có thể đã thay đổi.</p>}
      {mode==='signals'?<>
        <div className="office-filters"><label>Sản phẩm<select aria-label="Lọc lượt theo sản phẩm" value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Tất cả sản phẩm</option>{view.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Nhóm trạng thái<select aria-label="Lọc lượt theo trạng thái" value={group} onChange={e=>setGroup(e.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(officeGroups).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><span className="office-filter-total">{runs.length} lượt đang hiển thị</span></div>
        <div className="office-group-grid" role="group" aria-label="Các nhóm lượt chạy">{Object.entries(officeGroups).map(([key,label])=><button key={key} type="button" aria-pressed={group===key} className={'office-group '+key} onClick={()=>setGroup(group===key?'':key)}><span>{label}</span><strong>{sourceRuns.filter(r=>r.group===key).length}</strong></button>)}</div>
        <div className="office-section-title"><h2><Activity size={18}/>Lượt chạy</h2><span>Sản phẩm · nguồn thực thi · sự kiện cuối</span></div>
        <div className="office-run-list">{runs.map(run=><button type="button" className="office-run" key={run.id} data-run-id={run.id} data-group={run.group} onClick={()=>{setSelected(run.id);setCopied(false);}}>
          <div className="office-run-main"><Badge tone={groupTone(run.group)}>{officeGroups[run.group as OfficeGroup]}</Badge><strong>{productName(run.productId)}</strong><small>{run.provider?providerNames[run.provider]??run.provider:'Chưa biết'} · {run.kind==='compose'?'Lượt ghép':'Lượt media'}</small></div>
          <div className="office-run-event"><span>{run.lastEvent.note}</span><small>{clock(run.lastEvent.at)} · {officeGroups[run.group as OfficeGroup]}</small>{run.needsAction&&<p>{run.needsAction.reason}</p>}</div><ArrowRight className="office-run-arrow" size={17}/>
        </button>)}{!runs.length&&<Empty title="Không có lượt trong bộ lọc này" text="Chọn sản phẩm hoặc nhóm trạng thái khác để xem các lượt đã lưu."/>}</div>
      </>:<>
        <div className="office-product-tools"><div className="queue-filters" role="group" aria-label="Góc nhìn sản phẩm"><button type="button" aria-pressed={scope==='today'} onClick={()=>setScope('today')}>Đợt hôm nay <span>{todayCount(view)}</span></button><button type="button" aria-pressed={scope==='active'} onClick={()=>setScope('active')}>Đang triển khai <span>{activeProducts(view).length}</span></button></div>
          <div className="office-filters"><label>Tìm sản phẩm<input aria-label="Tìm sản phẩm theo tên hoặc mã" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên hoặc mã sản phẩm"/></label><label>Ngày chọn<input aria-label="Lọc sản phẩm theo ngày chọn" type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>{(query||day)&&<Button tone="ghost" onClick={()=>{setQuery('');setDay('');}}>Xóa lọc</Button>}</div></div>
        <div className="office-stage-strip" aria-label="Giai đoạn sản phẩm">{['research','script','media','review','publish'].map((stage,i)=><div key={stage}><span>0{i+1}</span><strong>{stageNames[stage]}</strong><small>{cards.filter(p=>p.stage===stage).length} sản phẩm</small></div>)}</div>
        <div className="office-section-title"><h2><Layers3 size={18}/>{scope==='today'?'Đợt hôm nay':'Sản phẩm đang triển khai'}</h2><span>{cards.length} sản phẩm · xếp theo hạng đã chọn</span></div>
        <div className="office-product-grid">{cards.map(product=>{
          const original=records.find(r=>r.id===product.id&&r.kind==='product');
          const renders=view.exports.filter(e=>e.productId===product.id&&e.kind==='render'&&e.verified),posts=view.posts.filter(p=>p.productId===product.id&&p.status.startsWith('published'));
          return <article className="office-product" key={product.id} data-product-id={product.id}><div className="office-product-top"><span className="office-rank">{product.priorityRank?'Ưu tiên '+product.priorityRank:'Chưa xếp hạng'}</span><Badge>{stageNames[product.stage]??'Chưa phân loại'}</Badge></div><small className="office-product-key">{product.key??'Chưa gán mã'}</small><h3>{product.name}</h3><dl><div><dt>Chọn lần đầu</dt><dd>{date(product.firstSelectedDay)}</dd></div><div><dt>Chọn gần nhất</dt><dd>{date(product.lastSelectedDay)}</dd></div><div><dt>Lượt được chọn</dt><dd>{product.selectionCount}</dd></div><div><dt>Cần xử lý</dt><dd>{product.openActions} việc</dd></div></dl>{original&&<ProductNextStepCard next={productJourneyStep(original,records,manual,jobs)}/>}<footer><span><CheckCircle2 size={14}/>{renders.length} MP4 đã kiểm</span><span>{posts.length} bài đã đăng</span></footer><button type="button" className="office-text-button" onClick={()=>{setProductId(product.id);setGroup('');window.history.pushState({},'', '?view=signals');window.dispatchEvent(new PopStateEvent('popstate'));}}>Xem các lượt của sản phẩm <ArrowRight size={14}/></button></article>;
        })}</div>{!cards.length&&<Empty title="Chưa có sản phẩm phù hợp" text="Đổi góc nhìn hoặc bộ lọc; lựa chọn sản phẩm được thực hiện ở Nghiên cứu."/>}
        <p className="office-footnote">Hạng do bạn xếp khi chọn sản phẩm. Gói prompt và MP4 đã kiểm là hai loại bản xuất khác nhau.</p>
      </>}
      <details className="office-measurements"><summary>Phát hành & đo · {view.exports.length} bản xuất · {view.posts.length} bài đăng · {view.measurements.length} lần đo</summary><p>Các đơn vị được đếm riêng. Số chưa có dữ liệu luôn hiện “Chưa biết”.</p>{view.measurements.length?<div className="office-measurement-list">{view.measurements.map(m=><div key={m.id}><strong>{m.postId??'Chưa gắn bài'}</strong><span>Comment từ khóa: {m.keywordComments??'Chưa biết'}</span><span>DM: {m.dms??'Chưa biết'}</span><span>Share: {m.shares??'Chưa biết'}</span><span>Click UTM: {m.utmClicks??'Chưa biết'}</span><span>Đơn hàng: {m.orders??'Chưa biết'}</span><small>Nguồn: {m.source} · Kỳ: {m.period??'Chưa biết'} · {clock(m.observedAt)}</small></div>)}</div>:<p>Chưa có lần đo nào.</p>}</details>
    </>:<Empty title={failed?'Chưa đọc được tiến độ':'Đang đọc tiến độ'} text="Dữ liệu lấy từ workspace local của Hermes Clip."/>}
    <Modal open={!!selectedRun} title={selectedProduct?.name??'Chi tiết lượt chạy'} description="Lịch sử chỉ đọc · thao tác xử lý ở màn tác vụ hiện có." onClose={()=>setSelected('')}>
      {selectedRun&&<div className="modal-body office-run-detail"><Badge tone={groupTone(selectedRun.group)}>{officeGroups[selectedRun.group as OfficeGroup]}</Badge><dl><div><dt>ID lượt</dt><dd><code>{selectedRun.id}</code></dd></div><div><dt>Nhà cung cấp</dt><dd>{selectedRun.provider?providerNames[selectedRun.provider]??selectedRun.provider:'Chưa biết'}</dd></div><div><dt>Trạng thái gốc</dt><dd>{selectedRun.state}</dd></div><div><dt>Cập nhật lúc</dt><dd>{clock(selectedRun.updatedAt)}</dd></div><div><dt>Tài sản</dt><dd>{selectedRun.outputs.assetId??'Chưa biết'}</dd></div><div><dt>Take</dt><dd>{selectedRun.outputs.takeId??'Chưa biết'}</dd></div></dl>{selectedRun.needsAction&&<p className="office-message">{selectedRun.needsAction.reason}</p>}<Button tone="neutral" onClick={()=>{void navigator.clipboard.writeText(selectedRun.id).then(()=>setCopied(true)).catch(()=>setCopied(false));}}><Copy size={14}/>{copied?'Đã sao chép':'Sao chép ID'}</Button><h3>Lịch sử gần nhất</h3><ol className="office-timeline">{selectedRun.history.map((event:any,index:number)=><li key={index}><time>{clock(event.at)}</time><div><strong>{event.note}</strong><small>{event.state}</small></div></li>)}</ol></div>}
    </Modal>
  </section>;
}
