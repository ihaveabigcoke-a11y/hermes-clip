import {z} from 'zod';
const settings=z.object({intervalSeconds:z.number().int().min(60).max(3600),sessionLimit:z.number().int().min(1).max(1000).nullable().default(12)});
export function museNightKey(now=Date.now()) {
 const local=new Date(now+7*3600000);if(local.getUTCHours()>=10)local.setUTCDate(local.getUTCDate()+1);
 return local.toISOString().slice(0,10);
}
export const museFailureKind=error=>['MUSE_LOGIN_REQUIRED','MUSE_QUOTA_EXHAUSTED','MUSE_CAPTCHA','MUSE_ACCOUNT_WARNING','MUSE_NO_MEDIA','MUSE_REFUSED'].includes(error?.code)?'refused':'error';
const fail=(message,code)=>Object.assign(Error(message),{code});
export class MuseNight {
 constructor(store,{now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){Object.assign(this,{store,now,sleep});this.tails=new Map();}
 settings(){return {sessionLimit:12,...this.store.get('muse_pacing',{intervalSeconds:60})};}
 configure(input){this.store.set('muse_pacing',settings.parse(input));return this.status();}
 current(){return this.store.get('muse_nights',{})[museNightKey(this.now())]??null;}
 save(row){this.store.set('muse_nights',{...this.store.get('muse_nights',{}),[row.id]:row});}
 begin(){let row=this.current();if(!row){row={id:museNightKey(this.now()),startedAt:this.now(),limit:this.settings().sessionLimit,submissions:[],outcomes:{},consecutiveErrors:0,stopReason:null};this.save(row);}return this.status();}
 profileStatus(profileId){const row=this.current(),state=row?.profiles?.[profileId]??{};
  // Legacy receipts have no profile ID. Conservatively apply their last send to every profile.
  const submissions=Object.values(this.store.get('muse_nights',{})).flatMap(n=>n.submissions??[]).filter(s=>!profileId||!s.profileId||s.profileId===profileId);
  const last=submissions.reduce((at,s)=>Math.max(at,s.at),0);
  return {...state,stopped:!!(row?.stopReason||state.stopReason),stopReason:row?.stopReason||state.stopReason||null,nextSubmitAt:last?last+this.settings().intervalSeconds*1000:null};
 }
 status(){const row=this.current(),submitted=row?.submissions.length??0,enabled=this.store.get('profiles',[]).filter(p=>p.enabled);
  const allStopped=enabled.length>0&&enabled.every(p=>this.profileStatus(p.id).stopped),reason=row?.stopReason||(allStopped?this.profileStatus(enabled[0].id).stopReason:null);
  return {active:!!row,nightId:row?.id??null,intervalSeconds:this.settings().intervalSeconds,limit:this.settings().sessionLimit,submitted,remaining:this.settings().sessionLimit===null?null:Math.max(0,this.settings().sessionLimit-submitted),successful:Object.values(row?.outcomes??{}).filter(v=>v==='success').length,errors:Object.values(row?.outcomes??{}).filter(v=>v!=='success').length,stopped:!!reason,stopReason:reason?.replace('Dừng hết đêm; dùng manual.','Kiểm tra Muse trước khi bật lại.')??null,nextSubmitAt:this.profileStatus().nextSubmitAt,profiles:Object.fromEntries(enabled.map(p=>[p.id,this.profileStatus(p.id)]))};}
 assertRoom(count=1,profileId){const s=this.status(),state=profileId?this.profileStatus(profileId):s;if(state.stopped)throw fail(state.stopReason,'MUSE_NIGHT_STOP');if(s.remaining!==null&&count>s.remaining)throw fail('Hết lượt Muse của phiên này. Kiểm tra giới hạn trong Cài đặt.','MUSE_NIGHT_LIMIT');}
 // Called only by the explicit enable confirmation; never by begin/configure/start.
 resume(){const row=this.current();if(!row||!this.status().stopped)return this.status();
  this.save({...row,consecutiveErrors:0,stopReason:null,profiles:{},resumptions:[...(row.resumptions??[]),{at:this.now(),stopReason:row.stopReason,profiles:row.profiles,consecutiveErrors:row.consecutiveErrors,submitted:row.submissions.length}]});
  return this.status();
 }
 async admit(jobId,allowed=()=>true,profileId){
  if(!this.current())return;
  const key=profileId??'legacy',previous=this.tails.get(key);let release;const tail=new Promise(r=>release=r);this.tails.set(key,tail);await previous;
  try {
   this.assertRoom(1,profileId);if(this.current().submissions.some(s=>s.jobId===jobId))throw fail('Lượt đã gửi; đối soát kết quả trước khi gửi lại.','MUSE_DELIVERY_UNCONFIRMED');
   while(true){if(!allowed())throw fail('Đã dừng gửi thêm trên hồ sơ.','MUSE_NIGHT_STOP');this.assertRoom(1,profileId);const wait=(this.profileStatus(profileId).nextSubmitAt??this.now())-this.now();if(wait<=0)break;await this.sleep(Math.min(wait,1000));}
   const row=this.current();if(row.submissions.some(s=>s.jobId===jobId))throw fail('Lượt đã gửi; đối soát trước khi gửi lại.','MUSE_DELIVERY_UNCONFIRMED');this.save({...row,submissions:[...row.submissions,{jobId,...(profileId?{profileId}:{}),at:this.now()}]});
  }finally{release();if(this.tails.get(key)===tail)this.tails.delete(key);}
 }
 outcome(jobId,error=null,profileId){const row=this.current();if(!row||row.outcomes[jobId])return this.status();
  if(['MUSE_NIGHT_STOP','MUSE_NIGHT_LIMIT'].includes(error?.code))return this.status();
  profileId??=row.submissions.find(s=>s.jobId===jobId)?.profileId;
  const previous=profileId?(row.profiles?.[profileId]??{consecutiveErrors:0,stopReason:null}):row;
  const kind=error?museFailureKind(error):'success',consecutiveErrors=error?previous.consecutiveErrors+1:0;
  const stopReason=previous.stopReason||(kind==='refused'?'Muse từ chối/giới hạn hoặc phiên không còn hợp lệ. Dừng hết đêm; dùng manual.':consecutiveErrors>=2?'Hai lượt lỗi Muse liên tiếp. Dừng hết đêm; dùng manual.':null);
  const state={consecutiveErrors,stopReason,...(error?{lastCode:error.code??null,lastReason:String(error.providerResponse||error.message||stopReason).slice(0,2000),at:this.now()}:{} )};
  this.save({...row,outcomes:{...row.outcomes,[jobId]:kind},...(profileId?{profiles:{...row.profiles,[profileId]:state}}:state)});return this.status();
 }
}
// Read only visible account/system notices; never match text in the user's prompt.
export async function assertMusePage(page) {
 if(!page?.locator)return;
 if(typeof page.url==='function'&&/\/(?:login|signin|sign-in)(?:[/?#]|$)/i.test(page.url()))throw fail('Phiên Muse đã đăng xuất.','MUSE_LOGIN_REQUIRED');
 const captcha=page.locator('iframe[src*="captcha"], [data-sitekey], input[name="captcha"]');
 if(await captcha.first().isVisible().catch(()=>false))throw fail('Muse yêu cầu captcha.','MUSE_CAPTCHA');
 const notices=await page.locator('[role="alert"], [data-testid="account-warning"]').allTextContents().catch(()=>[]);
 if(notices.some(s=>/suspend|account.{0,30}(restrict|warn|block)|unusual activity|verify.{0,20}(account|human)|captcha|usage limit|quota exceeded|access denied/i.test(s)))throw fail('Muse cảnh báo tài khoản hoặc giới hạn.','MUSE_ACCOUNT_WARNING');
}
