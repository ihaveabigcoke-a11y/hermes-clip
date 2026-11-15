import type {DesktopStatus} from './desktop-client.ts';
export const NO_MEASURE='chưa có số đo';
const DAY=24*60*60*1000;
export type MuseHealth={total:number|null;enabled:number|null;goodSession:number|null;running:number|null;errors24h:number|null;expired:string[]};
export function museHealth(status:DesktopStatus|null|undefined,now:number):MuseHealth{
 const profiles=Array.isArray(status?.profiles)?status!.profiles:null;
 const jobs=Array.isArray(status?.jobs)?status!.jobs:null;
 const enabled=profiles?profiles.filter(p=>p.enabled):null;
 const errors=jobs?jobs.filter(j=>{if(j.state!=='failed'&&j.state!=='error')return false;const at=j.history?.length?j.history[j.history.length-1].at:j.createdAt;return typeof at==='number'&&Number.isFinite(at)&&now-at>=0&&now-at<=DAY;}).length:null;
 return {
  total:profiles?profiles.length:null,
  enabled:enabled?enabled.length:null,
  goodSession:enabled?enabled.filter(p=>p.session==='signed_in'&&p.health==='ready').length:null,
  running:typeof status?.active==='number'?status.active:null,
  errors24h:errors,
  expired:enabled?enabled.filter(p=>p.session==='login_required'||p.health==='login_required').map(p=>p.name):[]
 };
}
export const museExpiredMessage=(name:string)=>'Hồ sơ '+name+' hết phiên đăng nhập';
