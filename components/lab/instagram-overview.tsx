"use client";
import {useEffect,useState} from 'react';
import {ArrowRight,RefreshCw} from 'lucide-react';
import {type LabRecord,formatTime} from '@/lib/lab/domain';
import {instagramProductSummary,type MetricTotal,type SummaryMetric} from '@/lib/lab/instagram-summary';
import {useInstagramStatus,type InstagramStatus} from '@/lib/lab/instagram-client';
import {instagramMetricLabels} from '@/desktop/src/ui-copy.mjs';
import {Button,Badge,Empty,Pagination,SearchBox} from './primitives';

export function MetricValue({metric}:{metric:MetricTotal}){
  const description=metric.value===null?(!metric.total?'Chưa có bài đăng':metric.known?`${metric.known}/${metric.total} bài có dữ liệu`:'Chưa có dữ liệu'):undefined;
  return <span className="instagram-total" aria-label={description} title={description}><span>{metric.value===null?'—':`${metric.approximate?'≈ ':''}${metric.value.toLocaleString('vi-VN')}`}</span>
    {metric.value===null&&metric.known>0&&<small>{metric.known}/{metric.total} bài đã có số</small>}</span>;
}
export function ProductMetrics({records,productId,status}:{records:LabRecord[];productId:string;status?:InstagramStatus|null}){
  const summary=instagramProductSummary(records,productId,status?.jobs);
  return <section className="instagram-product-metrics" aria-label="Tổng số liệu sản phẩm">
    <header><h2>Tổng quan sản phẩm</h2><span>{summary.publishedPosts} bài đã đăng · {summary.measuredPosts} bài đã đo · {summary.accounts} hồ sơ</span></header>
    <dl>{(['views','likes','comments','saves','shares','follows'] as SummaryMetric[]).map(key=><div key={key}><dt>{instagramMetricLabels[key]}</dt><dd><MetricValue metric={summary.totals[key]}/></dd></div>)}</dl>
    <p className="instagram-data-note">Cộng các bài đăng của sản phẩm trên mọi hồ sơ. Dấu — là chưa đủ dữ liệu; mỗi bài chỉ lấy bản đo mới nhất.</p>
  </section>;
}
const initialFilters=()=>{
  const p=new URL(location.href).searchParams;
  return {query:p.get('ig_q')??'',filter:p.get('ig_filter')??'all',sort:p.get('ig_sort')??'published',page:Math.max(1,Number(p.get('ig_page'))||1)};
};
export default function InstagramOverview({products,records,demo,onOpen}:{products:LabRecord[];records:LabRecord[];demo:boolean;onOpen:(id:string)=>void}){
  const live=useInstagramStatus(!demo);
  const [state,setState]=useState(initialFilters);
  useEffect(()=>{const restore=()=>setState(initialFilters());window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
  function change(patch:Partial<typeof state>){
    const next={...state,...patch,...(!('page'in patch)?{page:1}:{})};setState(next);
    const url=new URL(location.href);for(const [key,value]of Object.entries(next))url.searchParams.set('ig_'+(key==='query'?'q':key),String(value));
    history.replaceState({},'',url);
  }
  const rows=products.map(product=>({product,...instagramProductSummary(records,product.id,live.status?.jobs)}));
  function issue(row:typeof rows[number]){
    const ids=new Set(row.posts.flatMap(p=>p.planIds));
    const states=live.status?.metrics?.rows.filter(s=>ids.has(s.planId))??[];
    if(states.some(s=>s.state==='running'))return {text:'Đang đo',tone:'neutral'};
    if(states.some(s=>s.state==='login_required'))return {text:'Cần đăng nhập',tone:'warning'};
    if(states.some(s=>['error','unavailable'].includes(s.state)))return {text:'Cần kiểm tra',tone:'warning'};
    if(!row.publishedPosts)return {text:row.accounts?'Chưa đăng bài':'Chưa có hồ sơ',tone:'neutral'};
    if(!row.measuredPosts)return {text:'Chờ đo',tone:'neutral'};
    if(row.totals.views.value===null)return {text:'Thiếu chỉ số',tone:'neutral'};
    return {text:'Đã đo',tone:'success'};
  }
  const filtered=rows.filter(row=>row.product.data.name.toLocaleLowerCase('vi').includes(state.query.trim().toLocaleLowerCase('vi'))
    &&(state.filter==='all'||state.filter==='published'&&row.publishedPosts>0||state.filter==='unpublished'&&!row.publishedPosts||state.filter==='attention'&&issue(row).tone==='warning'))
    .sort((a,b)=>state.sort==='name'?a.product.data.name.localeCompare(b.product.data.name,'vi'):state.sort==='views'?(b.totals.views.value??-1)-(a.totals.views.value??-1):b.publishedPosts-a.publishedPosts||b.product.updatedAt-a.product.updatedAt);
  const page=Math.min(state.page,Math.max(1,Math.ceil(filtered.length/10)));
  return <div className="instagram-overview">
    <div className="instagram-overview-summary" aria-label="Tình hình Instagram"><span><strong>{products.length}</strong> sản phẩm</span><span><strong>{rows.reduce((sum,r)=>sum+r.publishedPosts,0)}</strong> bài đã đăng</span><span><strong>{rows.reduce((sum,r)=>sum+r.measuredPosts,0)}</strong> bài đã đo</span><span>Tự đo mỗi 30 phút khi app mở</span></div>
    <div className="instagram-overview-toolbar"><SearchBox value={state.query} onChange={query=>change({query})} placeholder="Tìm sản phẩm trên Instagram…"/>
      <label className="field">Hiển thị<select value={state.filter} onChange={e=>change({filter:e.target.value})}><option value="all">Tất cả sản phẩm</option><option value="published">Đã có bài đăng</option><option value="unpublished">Chưa đăng bài</option><option value="attention">Cần kiểm tra</option></select></label>
      <label className="field">Sắp xếp<select value={state.sort} onChange={e=>change({sort:e.target.value})}><option value="published">Bài đã đăng nhiều nhất</option><option value="views">Lượt xem cao nhất</option><option value="name">Tên sản phẩm A–Z</option></select></label>
    </div>
    {live.error&&<div role="alert" className="inline-error"><p>{live.error} Số liệu đã lưu vẫn được giữ.</p><Button tone="neutral" onClick={live.refresh}><RefreshCw size={16}/>Kiểm tra kết nối</Button></div>}
    {!products.length?<Empty title="Chưa có sản phẩm" text="Vào Nghiên cứu, chọn ứng viên rồi tạo hồ sơ sản phẩm."/>:!filtered.length?<Empty title="Không có sản phẩm phù hợp" text="Đổi từ khóa hoặc bộ lọc để xem lại danh sách." action={<Button tone="neutral" onClick={()=>change({query:'',filter:'all'})}>Xóa bộ lọc</Button>}/>:<>
    <div className="operations-table-scroll" role="region" aria-label="Bảng tổng quan Instagram theo sản phẩm" tabIndex={0}>
      <table className="operations-comparison instagram-overview-table"><caption className="sr-only">Số liệu cộng dồn theo sản phẩm, gộp mọi hồ sơ và không tính trùng bài đăng.</caption>
        <thead><tr><th scope="col">Sản phẩm</th><th scope="col">Bài đăng</th>{(['views','likes','comments','saves','shares'] as SummaryMetric[]).map(key=><th scope="col" key={key}>{instagramMetricLabels[key]}</th>)}<th scope="col">Cập nhật</th><th scope="col">Chi tiết</th></tr></thead>
        <tbody>{filtered.slice((page-1)*10,page*10).map(row=><tr key={row.product.id}>
          <th scope="row"><button className="comparison-name" type="button" onClick={()=>onOpen(row.product.id)}>{row.product.data.name}</button><small>{row.drafts} nội dung chưa đăng · {row.accounts} hồ sơ</small></th>
          <td><span className="instagram-total">{row.publishedPosts}</span><small>{row.measuredPosts} đã đo</small></td>
          {(['views','likes','comments','saves','shares'] as SummaryMetric[]).map(key=><td key={key}><MetricValue metric={row.totals[key]}/></td>)}
          <td><Badge tone={issue(row).tone}>{issue(row).text}</Badge><small>{row.oldestMeasuredAt?formatTime(row.oldestMeasuredAt):'Chưa đo'}{row.measuredPosts>1?' · bản cũ nhất':''}</small></td>
          <td><Button tone="ghost" onClick={()=>onOpen(row.product.id)} aria-label={'Xem sản phẩm '+row.product.data.name}>Xem <ArrowRight size={16}/></Button></td>
        </tr>)}</tbody></table>
    </div><Pagination page={page} total={filtered.length} size={10} onPage={page=>change({page})}/></>}
    <p className="instagram-data-note">Mỗi dòng là một sản phẩm, gộp tất cả tài khoản. Dấu — là chưa đủ dữ liệu, không phải số 0. Mở sản phẩm để xem từng bài hoặc quản lý tài khoản.</p>
  </div>;
}
