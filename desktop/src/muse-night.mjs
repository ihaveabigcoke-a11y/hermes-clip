import {z} from 'zod';
const settings=z.object({intervalSeconds:z.number().int().min(60).max(3600)});
export function museNightKey(now=Date.now()) {
 const local=new Date(now+7*3600000);if(local.getUTCHours()>=10)local.setUTCDate(local.getUTCDate()+1);
 return local.toISOString().slice(0,10);
}
export const museFailureKind=error=>['MUSE_LOGIN_REQUIRED','MUSE_QUOTA_EXHAUSTED','MUSE_CAPTCHA','MUSE_ACCOUNT_WARNING','MUSE_NO_MEDIA','MUSE_REFUSED'].includes(error?.code)?'refused':'error';
const fail=(message,code)=>Object.assign(Error(message),{code});
export class MuseNight {
 constructor(store,{now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){Object.assign(this,{store,now,sleep});this.tail=Promise.resolve();}
 settings(){return this.store.get('muse_pacing',{intervalSeconds:60});}
 configure(input){this.store.set('muse_pacing',settings.parse(input));return this.status();}
 current(){return this.store.get('muse_nights',{})[museNightKey(this.now())]??null;}
 save(row){this.store.set('muse_nights',{...this.store.get('muse_nights',{}),[row.id]:row});}
 begin(){let row=this.current();if(!row){row={id:museNightKey(this.now()),startedAt:this.now(),limit:12,submissions:[],outcomes:{},consecutiveErrors:0,stopReason:null};this.save(row);}return this.status();}
 status(){const row=this.current(),submitted=row?.submissions.length??0;return {active:!!row,nightId:row?.id??null,intervalSeconds:this.settings().intervalSeconds,limit:12,submitted,remaining:12-submitted,successful:Object.values(row?.outcomes??{}).filter(v=>v==='success').length,errors:Object.values(row?.outcomes??{}).filter(v=>v!=='success').length,stopped:!!row?.stopReason,stopReason:row?.stopReason??null,nextSubmitAt:row?.submissions.length?row.submissions.at(-1).at+this.settings().intervalSeconds*1000:null};}
 assertRoom(count=1){const s=this.status();if(s.stopped)throw fail(s.stopReason,'MUSE_NIGHT_STOP');if(count>s.remaining)throw fail('Hết lượt Muse của đêm này. Chuyển cảnh còn lại sang manual.','MUSE_NIGHT_LIMIT');}
 async admit(jobId,allowed=()=>true){
  if(!this.current())return;
  const previous=this.tail;let release;this.tail=new Promise(r=>release=r);await previous;
  try {
   this.assertRoom();if(this.current().submissions.some(s=>s.jobId===jobId))throw fail('Lượt đã gửi; đối soát kết quả trước khi gửi lại.','MUSE_DELIVERY_UNCONFIRMED');
   while(true){if(!allowed())throw fail('Muse đã tạm dừng.','MUSE_NIGHT_STOP');this.assertRoom();const wait=(this.status().nextSubmitAt??this.now())-this.now();if(wait<=0)break;await this.sleep(Math.min(wait,1000));}
   const row=this.current();this.save({...row,submissions:[...row.submissions,{jobId,at:this.now()}]});
  }finally{release();}
 }
 outcome(jobId,error=null){const row=this.current();if(!row||row.outcomes[jobId])return this.status();
  if(['MUSE_NIGHT_STOP','MUSE_NIGHT_LIMIT'].includes(error?.code))return this.status();
  const kind=error?museFailureKind(error):'success',consecutiveErrors=error?row.consecutiveErrors+1:0;
  const stopReason=kind==='refused'?'Muse từ chối/giới hạn hoặc phiên không còn hợp lệ. Dừng hết đêm; dùng manual.':consecutiveErrors>=2?'Hai lượt lỗi Muse liên tiếp. Dừng hết đêm; dùng manual.':row.stopReason;
  this.save({...row,outcomes:{...row.outcomes,[jobId]:kind},consecutiveErrors,stopReason});return this.status();
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
