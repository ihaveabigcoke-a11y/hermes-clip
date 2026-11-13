import {StatusMark} from './visual';
import {contentReadiness} from '@/lib/lab/product-profile';
export function Readiness({product}:{product:Record<string,any>}){return <div><h3>Sẵn sàng làm video</h3><ul className="profile-readiness">{contentReadiness(product).map(r=><li key={r.id}><StatusMark state={r.ready?'active':'waiting'}/><span>{r.label}</span><span className="sr-only">{r.ready?'Đã có':'Còn thiếu'}</span></li>)}</ul></div>;}
