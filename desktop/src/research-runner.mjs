import {museIsPaused,assertMuseNewTask} from './muse-pause.mjs';
import {z} from 'zod';
import {sessionCookie} from '../local/server.mjs';
import {mergeMuseResearch,museTaskPrompt} from '../local-dist/server/lib/lab/muse-workflows.mjs';
import {assertDiskSpace,storagePolicy} from './storage-policy.mjs';
import {ResearchSources} from './research-sources.mjs';

const input=z.object({requestId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),profileId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional(),maxLandedCostUsd:z.number().finite().positive().max(1e9).nullable().optional(),query:z.string().trim().min(2).max(1500).default('Sản phẩm nguồn Trung Quốc phù hợp video ngắn cho thị trường Mỹ; ưu tiên sản phẩm không thương hiệu, nhẹ, dễ trình diễn.')});
const activeStates=['queued','running'];
export class ResearchRunner{
  constructor({worker,chat,local,integrations,changed=()=>{}}){this.worker=worker;this.store=worker.store;this.chat=chat;this.local=local;this.changed=changed;this.running=null;this.stopped=false;this.sources=integrations?new ResearchSources({integrations,records:()=>this.records(),save:r=>this.save(r),changed}):null;}
  rows(){return this.store.get('research_runs',[]);}
  status(){return {runs:this.rows(),active:this.running?.id??null};}
  skipReconciliation({id}){
    const row=this.rows().find(run=>run.id===id);
    if(!row||!['unknown','needs_attention'].includes(row.state))throw Error('Chọn đợt Muse có kết quả chưa rõ.');
    if(this.running?.id===id)throw Error('Chờ đợt đang chạy kết thúc.');
    if(row.reconciled)return this.status();
    this.store.db.exec('BEGIN IMMEDIATE');
    try{
      for(const requestId of row.requestIds??[]){
        const chat=this.chat.get(requestId);
        if(chat?.projectId===row.batchId&&['unknown','needs_attention'].includes(chat.state))this.chat.skipReconciliation({requestId});
      }
      this.update(id,{reconciled:true,reconciliation:'skipped',reconciledAt:Date.now()});
      this.store.db.exec('COMMIT');
    }catch(error){this.store.db.exec('ROLLBACK');throw error;}
    return this.status();
  }
  update(id,patch){const rows=this.rows();const row={...rows.find(r=>r.id===id),...patch,provider:'muse',updatedAt:Date.now()};this.store.set('research_runs',[row,...rows.filter(r=>r.id!==id)]);this.changed();return row;}
  async request(path,options={}){
    const response=await fetch(this.local.origin+path,{...options,headers:{Cookie:sessionCookie+'='+this.local.session,Origin:this.local.origin,...options.headers},signal:AbortSignal.timeout(30000)});
    const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Chưa lưu được nghiên cứu.'),{status:response.status});return data;
  }
  async records(){return (await this.request('/api/lab')).records;}
  async save(record){return (await this.request('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)})).record;}
  start(payload){assertMuseNewTask(this.store);
    const value=input.parse(payload);const existing=this.rows().find(r=>r.id===value.requestId);if(existing)return existing;
    if(this.stopped)throw Error('App đang đóng.');if(this.running||this.rows().some(r=>activeStates.includes(r.state)))throw Error('Một đợt đang nghiên cứu. Chờ kết quả trước khi bắt đầu đợt mới.');
    if(this.rows().length>=100)throw Error('Đã có 100 đợt. Sao lưu trước khi mở rộng lịch sử nghiên cứu.');
    assertDiskSpace(this.worker.root,16*1024**2,storagePolicy(this.store));
    const usage=this.store.batch()?.submittedByProfile??{};
    const profiles=this.worker.profiles().filter(p=>p.enabled&&!p.busy&&(!value.profileId||p.id===value.profileId))
      .sort((a,b)=>(usage[a.id]??0)-(usage[b.id]??0));
    if(!profiles.length)throw Error('Chưa có hồ sơ Muse đang bật và rảnh. Kiểm tra Tài khoản Muse.');
    const row=this.update(value.requestId,{id:value.requestId,batchId:'research_'+value.requestId,profileId:profiles[0].id,query:value.query,maxLandedCostUsd:value.maxLandedCostUsd??null,state:'queued',createdAt:Date.now(),step:0,count:0,requestIds:[],error:'',target:10});
    this.launch(row.id);return row;
  }
  launch(id){if(this.running||this.stopped||museIsPaused(this.store))return;const promise=this.run(id).catch(error=>this.update(id,{state:'needs_attention',error:error.message})).finally(()=>{this.running=null;});this.running={id,promise};}
  boot(){if(museIsPaused(this.store))return;const row=this.rows().find(r=>activeStates.includes(r.state));if(row)this.launch(row.id);}
  resume({id}){assertMuseNewTask(this.store);const row=this.rows().find(r=>r.id===id);if(row?.reconciled)throw Error('Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.');if(!row||!['needs_attention','partial'].includes(row.state))throw Error('Chọn đợt cần kiểm tra.');if(this.running)throw Error('Chờ đợt hiện tại kết thúc.');this.update(id,{state:'queued',error:''});this.launch(id);return this.status();}
  checkSources(id,record){
    try{this.sources?.enqueue(record);}catch(error){this.update(id,{sourceCheckError:error.message});}
    return record;
  }
  recheckSources(payload){if(!this.sources)throw Error('Kiểm nguồn chỉ có trong bản desktop local.');return this.sources.recheck(payload);}
  queueSources(payload){if(!this.sources)throw Error('Kiểm nguồn chỉ có trong bản desktop local.');return this.sources.checkBatch(payload);}
  async apply(id,chat){
    for(let retry=0;retry<4;retry++){
      const row=this.rows().find(r=>r.id===id),record=(await this.records()).find(r=>r.id===row.batchId);
      if(!record)throw Error('Đợt nghiên cứu không còn trong dữ liệu.');
      const data=mergeMuseResearch(record.data,chat);if(data===record.data)return this.checkSources(id,record);
      try{return this.checkSources(id,await this.save({...record,data}));}catch(error){if(error.status!==409||retry===3)throw error;}
    }
  }
  async run(id){assertMuseNewTask(this.store);
    let row=this.rows().find(r=>r.id===id);const wasOpen=this.worker.contexts.has(row.profileId);
    if(row.reconciled)throw Error('Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.');
    try{
      this.update(id,{state:'running',error:''});
      let record=(await this.records()).find(r=>r.id===row.batchId);
      if(!record)record=await this.save({id:row.batchId,kind:'research_batch',revision:0,data:{name:'10 sản phẩm · '+new Date(row.createdAt).toLocaleString('vi-VN'),market:'United States',locale:'en-US',maxLandedCostUsd:row.maxLandedCostUsd??null,candidates:[],selectedIds:[],notes:''}});
      // Replay durable completed receipts before spending another Muse turn.
      // This also recovers products omitted by older import versions.
      for(const requestId of row.requestIds){
        if(record.data.candidates.length>=10)break;
        const receipt=this.chat.get(requestId);
        if(receipt?.state==='done')record=await this.apply(id,receipt);
      }
      row=this.update(id,{count:record.data.candidates.length});
      for(let step=row.step;step<3;step++){
        if(record.data.candidates.length>=10)break;
        if(this.stopped||museIsPaused(this.store)){
          this.update(id,{state:'partial',error:'Muse đang tạm dừng. Kết quả lượt vừa chạy đã được lưu; chưa gửi lượt tiếp theo.'});return;
        }
        const requestId=row.requestIds[step]??('research_'+id+'_'+step);
        // Save intent before touching Muse. On restart, only the same receipt is
        // read/reconciled; an uncertain submission never gets a new request ID.
        const requestIds=[...row.requestIds];requestIds[step]=requestId;
        row=this.update(id,{state:'running',step,requestIds,count:record.data.candidates.length});
        let result=this.chat.get(requestId);
        if(result?.state==='needs_attention'){
          if((row.recoveries??0)>=3)throw Error('Đã đọc lại kết quả 3 lần. Mở hội thoại Muse để kiểm tra; app không gửi thêm yêu cầu.');
          row=this.update(id,{recoveries:(row.recoveries??0)+1});result=await this.chat.recover({requestId});
        }
        if(!result){
          const remaining=10-record.data.candidates.length;
          const prompt=museTaskPrompt('research',{query:row.query,maxLandedCostUsd:record.data.maxLandedCostUsd??20,market:'United States',locale:'en-US',remainingSlots:remaining,desiredCount:remaining,
            existing:record.data.candidates.map(c=>({name:c.name,url:c.supplierUrl})),
            priority:'Ưu tiên kết quả thấy trong một khung hình (visual payoff), hợp Problem → Vs → Result → CTA: phát sáng ban đêm, thú cưng, chạy bộ hoặc đạp xe trong tình huống cụ thể. Hàng nhẹ, không thương hiệu; tránh phụ thuộc size/đời xe, cồng kềnh và claim y tế/an toàn chưa chứng minh. Mục tiêu giá vốn + ship Mỹ ≤ 20 USD; cần báo giá đúng SKU/MOQ, thiếu thì null, không đoán hay quy đổi. Tối đa 10 ứng viên, mỗi ứng viên có listing riêng và ảnh nguồn; không dùng chung showroom hoặc gán số liệu một bài review cho nhiều sản phẩm. Điền verdict, lý do, matchType, rủi ro AI/vận chuyển. Số cạnh tranh chỉ lấy từ trang đã quan sát, có nguồn, ngày và kỳ đo; chưa biết để null. Tách quan sát, suy luận và chưa biết; không bịa để đủ số lượng. Người dùng chọn tối đa 3 sản phẩm từ kết quả nghiên cứu.'});
          const parentId=step?row.requestIds[step-1]:null;
          result=await this.chat.send({requestId,profileId:row.profileId,projectId:row.batchId,prompt,parentId});
        }
        while(result.state==='needs_attention'&&result.errorCode==='MUSE_CHAT_TIMEOUT'&&(row.recoveries??0)<3&&!this.stopped&&!museIsPaused(this.store)){
          row=this.update(id,{recoveries:(row.recoveries??0)+1});result=await this.chat.recover({requestId});
        }
        if(result.state!=='done')throw Error(result.error||'Muse chưa xác nhận kết quả. Đọc lại đợt để đối soát.');
        record=await this.apply(id,result);
        row=this.update(id,{step:step+1,count:record.data.candidates.length,recoveries:0});
      }
      const count=record.data.candidates.length;
      this.update(id,{state:count===10?'done':'partial',count,finishedAt:Date.now(),error:count===10?'':'Chưa đủ 10 ứng viên có nguồn sau các bước bổ sung. Kết quả đã tìm được vẫn được giữ để kiểm tra nguồn.'});
    }finally{
      if(!wasOpen&&!this.worker.active.has(row.profileId)&&!this.worker.chatting.has(row.profileId)&&this.worker.contexts.has(row.profileId))await this.worker.closeProfile(row.profileId).catch(()=>{});
    }
  }
  shutdown(){this.stopped=true;}
}
