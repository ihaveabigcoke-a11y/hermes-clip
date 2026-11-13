"use client";
import {useState} from 'react';
import {Package,Film,FileVideo,FileText,Send,Eye,MessageCircle,MousePointerClick,ArrowUpRight} from 'lucide-react';
import {ProgressRing,Hint,VisualEmpty} from './visual';
import {Funnel,ViewsLine} from './visual-dashboard';
import {productVisualRows} from '@/lib/lab/visual-dashboard';
import type {LabRecord} from '@/lib/lab/domain';
import {todaySummary} from '@/lib/lab/today';
import type {productJourneyStep,JourneyMedia} from '@/lib/lab/product-next-step';
import {Button} from './primitives';
export function ProductThumbnail({product,records}:{product:LabRecord;records:LabRecord[]}) {
  const [failed,setFailed] = useState(false);
  const reference = records.filter(r=>r.kind==='production'&&r.data.productId===product.id).flatMap(r=>r.data.references??[]).find(r=>r.role==='product');
  const src = product.data.imageUrl || (reference?.assetId ? '/api/assets/'+reference.assetId : '');
  return <span className="product-thumbnail">{src&&!failed?<img src={src} alt="" onError={()=>setFailed(true)}/>:<Package aria-hidden="true"/>}</span>;
}
export const metricDisplay = (v:unknown) => typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('vi-VN'):'—';
export const measuredTime = (value:string) => new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'});
const labels = ['Sản phẩm đang làm','Clip đã nhận','MP4 đã xuất','Bài nháp','Bài đã đăng','Lượt xem 7 ngày','Comment đúng từ khoá 7 ngày','Click UTM 7 ngày'];
const metricIcons=[Package,Film,FileVideo,FileText,Send,Eye,MessageCircle,MousePointerClick];
export default function Today({records,manual,jobs,onNavigate}:{records:LabRecord[];manual:JourneyMedia;jobs:Parameters<typeof productJourneyStep>[3];onNavigate:(href:string)=>void}) {
  const data=todaySummary(records,Date.now(),manual,jobs);
  const visual=productVisualRows(records,manual,jobs);
  const stations=[['Nghiên cứu',16.5,48,'research'],['Khung content',50,47,'content'],['Tạo media',83.5,48,'production'],['Duyệt & xuất',29,92,'library'],['Phát hành & đo',71,92,'social']] as const;
  const stationCount=(i:number)=>visual.filter(r=>i===0?r.next.step<=2:i===1?r.next.step===3:i===2?r.next.step===4:i===3?r.next.step>=5&&r.next.step<=7:r.next.step>=8).length;
  const empty=!records.some(r=>!['settings'].includes(r.kind));
  if(empty)return <section className="today-empty"><span className="today-empty-mark" aria-hidden="true">H</span><h2>Bắt đầu từ một sản phẩm</h2><p>Chọn sản phẩm để có việc hôm nay và theo dõi kết quả.</p><Button onClick={()=>onNavigate('?view=research')}>Săn 10 sản phẩm</Button><div className="today-empty-charts"><Funnel records={records}/><ViewsLine records={records}/></div></section>;
  return <div className="today-view">
    <dl className="today-numbers">{labels.map((label,i)=>{const Icon=metricIcons[i];return <div key={label}><Icon size={26}/><dt>{label}</dt><dd data-metric-index={i}>{metricDisplay(data.counts[i])}</dd></div>;})}</dl>
    <div className="today-period"><Hint label="Kỳ đo 7 ngày">Bản đo mới nhất mỗi bài trong 7 ngày. Số lũy kế của bài; ô thiếu số giữ —.</Hint></div>
    <div className="today-studio-layout"><section className="hermes-studio" aria-label="Bản đồ văn phòng"><header><h2>Năm trạm theo luồng việc</h2></header><div className="studio-map-react"><img src="/studio.webp" width="1536" height="1024" alt="Không gian studio với năm trạm sản xuất"/>{stations.map(([label,x,y,view],i)=><button key={view} className="studio-station" style={{left:x+'%',top:y+'%'}} onClick={()=>onNavigate('?view='+view)}><b>{label}</b><small>{stationCount(i)} cần xử lý</small></button>)}</div><footer><span>{data.tasks.length} sản phẩm</span></footer></section><section className="today-section"><header><h2>Cần xử lý</h2><span className="visual-chip">{data.tasks.length}</span></header>
      <div className="today-tasks">{data.tasks.map(({product,next})=><article key={product.id} data-today-product={product.id}>
        <ProductThumbnail product={product} records={records}/><div className="today-task-name"><a href={'?view=products&product='+encodeURIComponent(product.id)}>{product.data.name}</a><button className="today-task-action" title={next.detail} onClick={()=>onNavigate(next.href)}>{next.title}<ArrowUpRight size={15}/></button></div>
        <ProgressRing value={next.step-1} label={'Tiến độ '+product.data.name}/>
      </article>)}</div>{!data.tasks.length&&<p>Không có sản phẩm đang làm.</p>}
    </section>
    </div><div className="today-charts"><Funnel records={records}/><ViewsLine records={records}/></div><section className="today-section"><header><h2>Kết quả gần nhất</h2><span>Giờ Việt Nam</span></header>{data.results.length?<div className="profile-table" role="region" aria-label="Kết quả gần nhất" tabIndex={0}><table className="lab-table"><thead><tr>{['Sản phẩm / hook','Lượt xem','Comment từ khoá','Click UTM','Thời điểm đo'].map(x=><th key={x} scope="col">{x}</th>)}</tr></thead><tbody>{data.results.map(r=><tr key={r.plan.id}><th scope="row"><a href={'?view=results&product='+encodeURIComponent(r.product.id)}>{r.product.data.name}</a><small>{r.plan.data.hook||r.plan.data.name}</small></th>{['views','keywordComments','utmClicks'].map(k=><td key={k}>{metricDisplay(r.metric!.data[k])}</td>)}<td>{measuredTime(r.metric!.data.observedAt)}</td></tr>)}</tbody></table></div>:<div className="today-no-results"><p>Chưa có bài đăng được nhập số liệu.</p><Button tone="neutral" onClick={()=>onNavigate('?view=results&entry=manual')}>Nhập số liệu</Button></div>}</section>
  </div>;
}
