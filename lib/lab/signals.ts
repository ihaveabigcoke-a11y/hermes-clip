import {type OfficeView,officeGroups,groupOf} from './office-view.ts';
export type SignalTone='active'|'waiting'|'error'|'unconfigured';
export const signalToneLabels:Record<SignalTone,string>={active:'Hoạt động',waiting:'Tạm dừng / chờ',error:'Lỗi',unconfigured:'Chưa cấu hình'};
const time=(value:any)=>{const n=typeof value==='number'?value:Date.parse(value);return Number.isFinite(n)?n:null;};
const latest=(values:any[])=>values.map(time).filter((v):v is number=>v!==null).sort((a,b)=>b-a)[0]??null;
export function serviceSignals(data:{worker?:any;manual?:any;render?:any;instagram?:any;errors?:Record<string,boolean>},view:OfficeView|null) {
 const {worker:w,manual:m,render:r,instagram:ig}=data;
 const runs=view?.runs??[],profiles=w?.profiles??[],apiProfiles=(ig?.profiles??[]).filter((p:any)=>p.apiMode==='api');
 const card=(id:string,name:string,tone:SignalTone,reason:string,at:number|null)=>({id,name,tone:data.errors?.[id]?'error' as SignalTone:tone,reason:data.errors?.[id]?'Không đọc được tín hiệu; đang giữ lần đọc gần nhất.':reason,at});
 const museLast=latest([...runs.filter(j=>j.provider==='muse').map(j=>j.updatedAt),...profiles.map((p:any)=>p.checkedAt)]);
 const museError=profiles.some((p:any)=>['error','failed'].includes(p.health));
 const museActive=w?.active>0||profiles.some((p:any)=>p.health==='ready'&&p.session==='signed_in'&&p.checkedAt);
 const mt:SignalTone=!w?'unconfigured':w.musePaused!==false?'waiting':museError?'error':museActive?'active':profiles.length?'waiting':'unconfigured';
 const manualAt=latest(runs.filter(j=>j.provider==='manual').map(j=>j.updatedAt));
 const rt:SignalTone=!r?.config?'unconfigured':r.health?.montage?.ready===false?'error':r.busy||r.health?.montage?.ready===true?'active':'waiting';
 const it:SignalTone=!ig?.api?.enabled||!apiProfiles.some((p:any)=>p.hasApiToken)?'unconfigured':apiProfiles.some((p:any)=>(p.error||['login_required','challenge'].includes(p.session)))?'error':apiProfiles.some((p:any)=>p.session==='signed_in'&&p.checkedAt&&!p.error)?'active':'waiting';
 return [card('muse','Muse',mt,mt==='waiting'?(w?.musePaused!==false?'Muse đang tạm dừng.':'Chờ kiểm tra phiên hoặc lượt chạy.'):mt==='active'?'Có phiên đã kiểm hoặc lượt đang chạy.':mt==='error'?'Lỗi kỹ thuật trong lần kiểm gần nhất.':'Chưa có hồ sơ Muse.',museLast),
  card('manual','Hộp nhận media',!m?.inbox?'unconfigured':m.errors?.length?'error':m.unmatched?.length?'waiting':'active',!m?.inbox?'Chưa đặt thư mục nhận media.':m.errors?.length?'Có file lỗi khi đọc hoặc nhập.':m.unmatched?.length?'Có file cần gắn vào cảnh.':'Hộp nhận đã sẵn sàng; chưa có lỗi đọc.',manualAt),
  card('render','Render',rt,rt==='unconfigured'?'Chưa cấu hình công cụ dựng.':rt==='error'?'Công cụ dựng chưa qua kiểm tra.':rt==='active'?(r.busy?'Đang xử lý tác vụ dựng.':'Công cụ dựng đã qua kiểm tra local.'):'Chờ kiểm tra công cụ dựng.',latest([r?.health?.checkedAt,...runs.filter(j=>j.kind==='compose').map(j=>j.updatedAt)])),
  card('instagram','Instagram API',it,it==='unconfigured'?'Chưa cấu hình API và tài khoản.':it==='active'?'Tài khoản API đã được kiểm tra.':it==='error'?'Lần kiểm API gần nhất báo lỗi.':'Có cấu hình, chưa xác minh kết nối.',latest(apiProfiles.map((p:any)=>p.checkedAt)))];
}
export const eventTypes={job:'Tác vụ',import:'Nhập file',render:'Render',refused:'Muse từ chối / giới hạn vùng',error:'Lỗi kỹ thuật'};
export function signalTimeline(view:OfficeView) {
 return view.runs.flatMap(run=>run.history.map((event:{at:string|null;state:string;note:string},index:number)=>{
  const final=index===run.history.length-1;
  const refused=run.group==='refused'&&final||event.note===officeGroups.refused;
  const type:keyof typeof eventTypes=refused?'refused':event.state==='failed'?'error':run.kind==='compose'?'render':run.provider==='manual'||event.state==='received'?'import':'job';
  const group=refused?'refused':groupOf({state:event.state,assetId:final?run.outputs.assetId:null});
  return {id:run.id+':'+index,runId:run.id,productId:run.productId,type,at:time(event.at),text:refused?eventTypes.refused:event.state==='failed'?eventTypes.error:officeGroups[group],tone:type==='error'?'error':type==='refused'?'waiting':group==='library'?'active':'waiting'};
 })).sort((a,b)=>(b.at??-Infinity)-(a.at??-Infinity)||a.id.localeCompare(b.id)).slice(0,50);
}
export function relativeSignalTime(at:number|null,now=Date.now()) {if(at===null)return 'Chưa có thời điểm';const seconds=Math.max(0,Math.floor((now-at)/1000));return seconds<60?'Vừa xong':seconds<3600?Math.floor(seconds/60)+' phút trước':seconds<86400?Math.floor(seconds/3600)+' giờ trước':Math.floor(seconds/86400)+' ngày trước';}
