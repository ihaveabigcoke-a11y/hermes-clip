"use client";
import {RefreshCw} from 'lucide-react';
import {type LabRecord,formatTime} from '@/lib/lab/domain';
import {type InstagramMetricState} from '@/lib/lab/instagram-client';
import {instagramMetricLabels,instagramMetricStates} from '@/desktop/src/ui-copy.mjs';
import {Badge,Button} from './primitives';

type Props={record?:LabRecord;state?:InstagramMetricState;disabled:boolean;onRefresh:()=>void;onLogin?:()=>void;foreground:boolean};
const primary=['views','likes','comments','saves','shares','follows'];
const secondary=['viewers','interactions','reelInteractions','accountsEngaged','profileActivity','profileVisits','linkClicks'];
export default function InstagramMetrics({record,state,disabled,onRefresh,onLogin,foreground}:Props){
  const data=record?.data;
  const running=state?.state==='running';
  const fallback=data?(primary.some(key=>data[key]==null)?'partial':'ready'):'idle';
  const label=instagramMetricStates[state?.state??fallback]??'Chờ cập nhật';
  function stats(keys:string[]){return <dl className="instagram-stat-grid">{keys.map(key=>{
    const value=data?.[key];const known=typeof value==='number'&&Number.isFinite(value);
    return <div key={key}><dt>{instagramMetricLabels[key]}</dt><dd className={known?'':'is-unavailable'}>{known?`${data?.approximate?.includes(key)?'≈ ':''}${value.toLocaleString('vi-VN')}`:data?'Chưa có dữ liệu':'Chưa đo'}</dd></div>;
  })}</dl>;}
  return <section className="instagram-insights" aria-label="Số liệu Instagram" aria-busy={running}>
    <header className="instagram-section-heading"><div><h3>Số liệu Instagram</h3>
      <p>{data?`${data.source==='api'?'Đo từ Instagram API':data.source==='instagram_browser'?'Đo từ Instagram':'Bản nhập trước đây'} · ${formatTime(Date.parse(data.observedAt))}`:'App sẽ tự lấy số liệu cho bài đã đăng.'}</p></div>
      <Button tone="neutral" disabled={disabled||running} onClick={onRefresh}><RefreshCw size={16}/>{running?'Đang cập nhật…':'Cập nhật ngay'}</Button>
    </header>
    <div aria-live="polite"><Badge tone={state?.state==='ready'?'success':state?.error?'warning':'neutral'}>{label}</Badge>
      {state?.error&&<p role="status">{state.error} {data?'Đang hiển thị bản đo gần nhất.':''}</p>}
      {state?.state==='login_required'&&onLogin&&<Button tone="neutral" disabled={disabled} onClick={onLogin}>Đăng nhập để cập nhật</Button>}
    </div>
    {stats(primary)}
    <details><summary>Chỉ số khác và nguồn đo</summary>{stats(data?.source === 'api' ? ['reach',...secondary] : secondary)}
      <p>Đây là số liệu cộng dồn của bài đăng. “Chưa có dữ liệu” nghĩa là Instagram chưa hiển thị chỉ số đó; không phải số 0. Dấu ≈ chỉ số được Instagram rút gọn.</p>
      {data?.sourceUrl&&<a href={data.sourceUrl} target="_blank" rel="noreferrer">Bài đăng được đo</a>}
    </details>
    <p className="instagram-metric-schedule">Tự cập nhật mỗi 30 phút khi Hermes đang mở.
      {foreground&&!running?' App chờ hồ sơ rảnh; bạn có thể bấm Cập nhật ngay.':''}
      {state?.nextAttemptAt&&state.nextAttemptAt>0?` Lần tiếp theo: ${formatTime(state.nextAttemptAt)}.`:''}
      {state?.nextAttemptAt===null?' Tự cập nhật đang tạm dừng. Khắc phục lỗi rồi bấm Cập nhật ngay.':''}
    </p>
  </section>;
}
