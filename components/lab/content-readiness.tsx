import {contentReadiness} from '@/lib/lab/product-profile';
export function Readiness({product}:{product:Record<string,any>}){return <div><h3>Sẵn sàng làm video</h3><ul className="profile-readiness">{contentReadiness(product).map(r=><li key={r.id}>{r.ready?'✓':'○'} {r.label} · {r.ready?'Đã có':'Còn thiếu'}</li>)}</ul></div>;}
