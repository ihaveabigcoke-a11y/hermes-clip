import {z} from 'zod';
import {InstagramInsights,metricKeys} from './instagram-insights.mjs';
import {apiMode,browserEnabled,assertBrowserEnabled} from './instagram-policy.mjs';

const input=z.object({planId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/)});
export const METRICS_INTERVAL=30*60*1000;

export class InstagramMetrics {
  constructor(publisher,{reader=new InstagramInsights(),now=()=>Date.now()}={}) {
    this.publisher=publisher;this.reader=reader;this.now=now;this.active=null;this.running=null;this.nextScan=0;
    for(const row of this.rows())if(row.state==='running')this.update(row.planId,{state:'error',error:'Lần cập nhật trước bị gián đoạn. App sẽ thử lại.',nextAttemptAt:now()+60000});
  }
  rows(){return this.publisher.store.get('instagram_metrics',[]);}
  status(){return {intervalMs:METRICS_INTERVAL,active:this.active,rows:this.rows()};}
  update(planId,patch){
    const rows=this.rows();const previous=rows.find(row=>row.planId===planId)??{planId,state:'idle',failures:0,lastAttemptAt:null,lastSuccessAt:null,nextAttemptAt:0,error:''};
    const row={...previous,...patch};
    this.publisher.store.set('instagram_metrics',[...rows.filter(row=>row.planId!==planId),row]);return row;
  }
  due(planId){this.update(planId,{nextAttemptAt:0,failures:0});this.nextScan=0;}
  async tick(){
    const p=this.publisher;
    if(p.stopped||p.active||this.active||this.now()<this.nextScan)return;
    this.nextScan=this.now()+60000;
    const plans=await p.workspace.metricPlans();
    if(p.stopped||p.active||this.active)return;
    for(const plan of plans){
      const row=this.rows().find(row=>row.planId===plan.id);
      const profile=p.browsers.profile(plan.data.accountId);
      if(!profile)continue;
      if(apiMode(profile)&&!profile.encryptedApiToken)continue;
      if(!apiMode(profile)&&(!browserEnabled(p.store)||p.browserBootHold))continue;
      // Once login is missing, only a newly verified session or an explicit click resumes it.
      if(row?.state==='login_required'){
        if(profile.session!=='signed_in'||profile.checkedAt<=row.lastAttemptAt)continue;
      }else if(row?.nextAttemptAt===null||row?.nextAttemptAt>this.now())continue;
      // Do not navigate a profile that the user is currently using in the foreground.
      if(p.browsers.contexts.has(profile.id)&&!p.browsers.background.has(profile.id))continue;
      await this.refresh({planId:plan.id}).catch(()=>{});break;
    }
  }
  refresh(payload){
    const {planId}=input.parse(payload);const p=this.publisher;
    if(this.active===planId)return this.running;
    if(p.stopped)throw Error('App đang đóng. Mở lại để cập nhật số liệu.');
    if(this.active||p.active)throw Error('Chờ thao tác Instagram hiện tại kết thúc rồi cập nhật số liệu.');
    this.active=planId;
    this.running=this.run(planId).finally(()=>{this.active=null;this.running=null;p.drain();});
    return this.running;
  }
  async run(planId){
    const p=this.publisher;let page,accountId,wasOpen=true,locked=false;
    this.update(planId,{state:'running',lastAttemptAt:this.now(),error:''});
    try{
      const target=await p.workspace.metricTarget(planId);
      accountId=target.accountId;
      await p.checks.get(accountId)?.catch(()=>{});
      if(p.stopped)throw Error('App đã đóng trong lúc cập nhật số liệu.');
      if(p.browsers.busy.has(accountId)||p.browsers.opening.has(accountId)||p.browsers.pageOpening.has(accountId))throw Error('Hồ sơ đang bận. Thử cập nhật khi thao tác trước kết thúc.');
      p.browsers.busy.add(accountId);locked=true;
      const profile=p.browsers.profile(accountId);
      if(!apiMode(profile))assertBrowserEnabled(p.store);
      if(!apiMode(profile)&&(!profile?.userId||!profile?.handle))throw Object.assign(Error('Đăng nhập hồ sơ Instagram của sản phẩm để đọc số liệu.'),{code:'login_required'});
      const published=p.jobs().find(job=>job.state==='published'&&job.snapshot.planId===planId);
      if(published&&(published.snapshot.accountId!==accountId||published.postUrl!==target.postUrl))throw Error('Bài đăng không khớp hồ sơ đã dùng để đăng.');
      let measurement;
      if(apiMode(profile)) measurement=await p.apiAdapter.read(profile,target,published);
      else {
        wasOpen=p.browsers.contexts.has(accountId);
        const context=await p.browsers.context(accountId,true);
        page=await context.newPage();page.setDefaultTimeout(20000);
        if(!wasOpen)await p.browsers.visibility(accountId,false);
        // Instagram Login and browser IDs may have different namespaces.
        const browserUserId=published?.snapshot.apiMode==='api'?profile.userId:published?.userId||profile.userId;
        measurement=await this.reader.read(page,{...target,handle:published?.handle||target.expectedHandle||profile.handle,userId:browserUserId});
      }
      if(p.stopped)throw Error('App đang đóng; số liệu sẽ được cập nhật lại sau.');
      const result=await p.workspace.saveMetrics(target,measurement);
      this.update(planId,{state:metricKeys.some(key=>measurement[key]==null)?'partial':'ready',failures:0,
        lastSuccessAt:Date.parse(measurement.observedAt),nextAttemptAt:this.now()+METRICS_INTERVAL,error:''});
      return result;
    }catch(error){
      const previous=this.rows().find(row=>row.planId===planId);const failures=(previous?.failures??0)+1;
      const state=['login_required','unavailable'].includes(error.code)?error.code:'error';
      this.update(planId,{state,failures,nextAttemptAt:state==='login_required'||state==='unavailable'||failures>=3?null:this.now()+[5,15,30][Math.min(failures-1,2)]*60000,
        error:/locator\.|page\.|browserType\.|Timeout/.test(error.message)?'Chưa đọc được bảng Insights. Số liệu đã lưu vẫn được giữ; thử cập nhật lại sau.':error.message});
      throw Error(this.rows().find(row=>row.planId===planId).error);
    }finally{
      await page?.close().catch(()=>{});
      if(!wasOpen&&accountId)await p.browsers.contexts.get(accountId)?.close().catch(()=>{});
      if(locked)p.browsers.busy.delete(accountId);
    }
  }
}
