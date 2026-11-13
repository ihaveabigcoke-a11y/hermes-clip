"use client";
import {useState} from 'react';
import type {LabRecord} from '@/lib/lab/domain';
import {measuredPosts} from '@/lib/lab/today';
import {metricDisplay,measuredTime} from './today';
const columns=[['product','Sản phẩm'],['hook','Hook'],['account','Tài khoản'],['views','Lượt xem'],['likes','Like'],['comments','Comment'],['keywordComments','Comment từ khoá'],['dms','DM'],['utmClicks','Click UTM'],['orders','Đơn'],['observedAt','Thời điểm đo']] as const;
export default function MetricsTable({records}:{records:LabRecord[]}) {
  const [sort,setSort]=useState<{key:string;direction:number}>({key:'observedAt',direction:-1});
  const rows=measuredPosts(records);
  type Row=typeof rows[number];
  const value=(r:Row,key:string):string|number|null=>key==='product'?r.product.data.name:key==='hook'?r.plan.data.hook||r.plan.data.name:key==='account'?r.account?.data.handle||null:key==='observedAt'?Date.parse(r.metric!.data.observedAt):r.metric!.data[key]??null;
  rows.sort((a,b)=>{const av=value(a,sort.key),bv=value(b,sort.key);if(av===null)return bv===null?0:1;if(bv===null)return -1;return sort.direction*(typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi'));});
  return <section className="metrics-saved"><h2>Số liệu đã lưu</h2><p>Mỗi bài lấy bản đo mới nhất; số chưa nhập giữ —. Bấm tên cột để sắp xếp.</p><div className="profile-table" tabIndex={0} role="region" aria-label="Bảng số liệu bài đăng"><table className="lab-table"><thead><tr>{columns.map(([key,label])=><th key={key} scope="col" aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):'none'}><button onClick={()=>setSort({key,direction:sort.key===key?-sort.direction:1})}>{label}{sort.key===key?(sort.direction===1?' ↑':' ↓'):''}</button></th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.plan.id}>{columns.map(([key])=><td key={key}>{key==='product'?<a href={'?view=products&product='+encodeURIComponent(r.product.id)}>{value(r,key)}</a>:key==='observedAt'?<time dateTime={r.metric!.data.observedAt} title={(r.metric!.data.sourceLabel||r.metric!.data.source)+' · '+r.metric!.data.sourceUrl}>{measuredTime(r.metric!.data.observedAt)}</time>:['hook','account'].includes(key)?value(r,key)??'—':metricDisplay(value(r,key))}</td>)}</tr>)}</tbody></table></div>{!rows.length&&<p>Chưa có bài đăng được nhập số liệu.</p>}</section>;
}
