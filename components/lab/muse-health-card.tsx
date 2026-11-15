import type {DesktopStatus} from '@/lib/lab/desktop-client';
import {museHealth,museExpiredMessage,NO_MEASURE} from '@/lib/lab/muse-health';
const show=(n:number|null)=>n===null?NO_MEASURE:String(n);
export default function MuseHealthCard({status}:{status:DesktopStatus|null|undefined}){
 const h=museHealth(status,Date.now());
 return <section className="muse-health" aria-label="Sức khoẻ hồ sơ Muse">
  <h3>Sức khoẻ hồ sơ Muse</h3>
  <dl>
   <div><dt>Hồ sơ đang bật</dt><dd>{show(h.enabled)}</dd></div>
   <div><dt>Hồ sơ phiên tốt, sẵn sàng</dt><dd>{show(h.goodSession)}</dd></div>
   <div><dt>Việc đang chạy</dt><dd>{show(h.running)}</dd></div>
   <div><dt>Lỗi trong 24 giờ qua</dt><dd>{show(h.errors24h)}</dd></div>
  </dl>
  {h.expired.map(name=><p key={name} role="status" className="muse-health-warn">{museExpiredMessage(name)}</p>)}
 </section>;
}
