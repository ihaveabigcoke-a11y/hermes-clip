"use client";
import {useState} from 'react';
import type {LabRecord} from '@/lib/lab/domain';
import {todaySummary} from '@/lib/lab/today';
import type {productJourneyStep,JourneyMedia} from '@/lib/lab/product-next-step';
import {Button} from './primitives';
export function ProductThumbnail({product,records}:{product:LabRecord;records:LabRecord[]}) {
  const [failed,setFailed] = useState(false);
  const reference = records.filter(r=>r.kind==='production'&&r.data.productId===product.id).flatMap(r=>r.data.references??[]).find(r=>r.role==='product');
  const src = product.data.imageUrl || (reference?.assetId ? '/api/assets/'+reference.assetId : '');
  return <span className="product-thumbnail">{src&&!failed?<img src={src} alt="" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{product.data.name.trim().slice(0,1).toUpperCase()}</span>}</span>;
}
export const metricDisplay = (v:unknown) => typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('vi-VN'):'—';
export const measuredTime = (value:string) => new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'});
const labels = ['Sản phẩm đang làm','Clip đã nhận','MP4 đã xuất','Bài nháp','Bài đã đăng','Lượt xem 7 ngày','Comment đúng từ khoá 7 ngày','Click UTM 7 ngày'];
export default function Today({records,manual,jobs,onNavigate}:{records:LabRecord[];manual:JourneyMedia;jobs:Parameters<typeof productJourneyStep>[3];onNavigate:(href:string)=>void}) {
  const data=todaySummary(records,Date.now(),manual,jobs);
  const empty=!records.some(r=>!['settings'].includes(r.kind));
  if(empty)return <section className="today-empty"><span className="today-empty-mark" aria-hidden="true">H</span><h2>Bắt đầu từ một sản phẩm</h2><p>Chọn sản phẩm để có việc hôm nay và theo dõi kết quả.</p><Button onClick={()=>onNavigate('?view=research')}>Săn 10 sản phẩm</Button></section>;
  return <div className="today-view">
    <dl className="today-numbers">{labels.map((label,i)=><div key={label}><dt>{label}</dt><dd data-metric-index={i}>{metricDisplay(data.counts[i])}</dd>{i>=5&&<small>{data.counts[i]===null?'chưa nhập số':'từ bản đo đã lưu'}</small>}</div>)}</dl>
    <p className="today-period">7 ngày: bản đo mới nhất từng bài trong 7 ngày qua. Số lũy kế của bài, không phải mức tăng trong kỳ. Ô thiếu số giữ —.</p>
    <section className="today-section"><header><h2>Việc hôm nay</h2><span>{data.tasks.length} sản phẩm đang làm</span></header>
      <div className="today-tasks">{data.tasks.map(({product,next})=><article key={product.id} data-today-product={product.id}>
        <ProductThumbnail product={product} records={records}/><div className="today-task-name"><a href={'?view=products&product='+encodeURIComponent(product.id)}>{product.data.name}</a><small>Bước {next.step}/10 · {next.title}</small></div>
        <div className="journey-track" role="progressbar" aria-label={'Tiến độ '+product.data.name} aria-valuemin={0} aria-valuemax={10} aria-valuenow={next.step-1} aria-valuetext={'Đang ở bước '+next.step+' trên 10'}>{Array.from({length:10},(_,i)=><span key={i} className={i<next.step-1?'done':i===next.step-1?'current':''}/>)}</div>
        <Button title={next.detail} onClick={()=>onNavigate(next.href)}>{next.title}</Button>
      </article>)}</div>{!data.tasks.length&&<p>Không có sản phẩm đang làm.</p>}
    </section>
    <section className="today-section"><header><h2>Kết quả gần nhất</h2><span>Giờ Việt Nam</span></header>{data.results.length?<div className="profile-table" role="region" aria-label="Kết quả gần nhất" tabIndex={0}><table className="lab-table"><thead><tr>{['Sản phẩm / hook','Lượt xem','Comment từ khoá','Click UTM','Thời điểm đo'].map(x=><th key={x} scope="col">{x}</th>)}</tr></thead><tbody>{data.results.map(r=><tr key={r.plan.id}><th scope="row"><a href={'?view=results&product='+encodeURIComponent(r.product.id)}>{r.product.data.name}</a><small>{r.plan.data.hook||r.plan.data.name}</small></th>{['views','keywordComments','utmClicks'].map(k=><td key={k}>{metricDisplay(r.metric!.data[k])}</td>)}<td>{measuredTime(r.metric!.data.observedAt)}</td></tr>)}</tbody></table></div>:<div className="today-no-results"><p>Chưa có bài đăng được nhập số liệu.</p><Button tone="neutral" onClick={()=>onNavigate('?view=results&entry=manual')}>Nhập số liệu</Button></div>}</section>
  </div>;
}
