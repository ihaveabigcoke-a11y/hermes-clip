import {DatabaseSync} from 'node:sqlite';
import {randomUUID, createHash} from 'node:crypto';
import {transitions, jobFingerprint} from './contracts.mjs';
import {retryBlockedReason} from './job-retry.mjs';
import {museMediaPrompt, museVideoBody} from './muse-video-prompt.mjs';
export class Store {
  constructor(path){this.db=new DatabaseSync(path);this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS fingerprint_idx ON jobs(fingerprint);");}
  get(k,fallback=null){const r=this.db.prepare('SELECT v FROM kv WHERE k=?').get(k);return r?JSON.parse(r.v):fallback;}
  set(k,v){this.db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,JSON.stringify(v));return v;}
  batch() { const batch=this.get('generation_batch', null); return batch ? {...batch, perProfileLimit:null} : null; }
  newBatch() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const running = ['preflight', 'prepared', 'submitting', 'submitted', 'waiting', 'downloading', 'validating'];
      if (this.jobs().some(job => running.includes(job.state))) throw Error('Chờ tác vụ tạo media kết thúc trước khi mở đợt mới.');
      const batch = this.set('generation_batch', {id: randomUUID(), startedAt: Date.now(), perProfileLimit: null, submittedByProfile: {}});
      this.db.exec('COMMIT');
      return batch;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  beginSubmit(id, profileId, patch = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const batch = this.batch() ?? {id: randomUUID(), startedAt: Date.now(), perProfileLimit: null, submittedByProfile: {}};
      const count = Object.hasOwn(batch.submittedByProfile, profileId) ? batch.submittedByProfile[profileId] : 0;
      const job = this.transition(id, 'submitting', {...patch, profileId, submitBatchId: batch.id});
      this.set('generation_batch', {...batch, perProfileLimit: null, submittedByProfile: {...batch.submittedByProfile, [profileId]: count + 1}});
      this.db.exec('COMMIT');
      return job;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  jobs({withQueueNumber=false}={}){return this.db.prepare('SELECT rowid,body FROM jobs ORDER BY rowid DESC LIMIT 500').all().map(r=>({...JSON.parse(r.body),...(withQueueNumber?{queueNumber:Number(r.rowid)}:{})}));}
  job(id){const r=this.db.prepare('SELECT body FROM jobs WHERE id=?').get(id);if(!r)throw Error('Không tìm thấy job.');return JSON.parse(r.body);}
  put(j){this.db.prepare('INSERT INTO jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(j.id,j.fingerprint,JSON.stringify(j));return j;}
  recordEarlyRenderError(id,error){
    // Patch only this field inside SQLite. A stale JS snapshot must never put
    // validating/output/history back over a concurrent ready/import update.
    const result=this.db.prepare("UPDATE jobs SET body=json_set(body,'$.earlyRenderError',?) WHERE id=?").run(String(error?.message??error).slice(0,600),id);
    if(!result.changes)throw Error('Không tìm thấy job.');
  }
  enqueue(body,fingerprint,legacyFingerprint=fingerprint){const old=this.db.prepare('SELECT body FROM jobs WHERE fingerprint IN (?,?) ORDER BY rowid DESC LIMIT 1').get(fingerprint,legacyFingerprint);if(old)return {job:JSON.parse(old.body),deduplicated:true};if(this.jobs().length>=500)throw Error('Đã chạm 500 job local; sao lưu trước khi mở rộng.');const now=Date.now();return {job:this.put({id:randomUUID(),fingerprint,request:body,provider:'muse',state:'queued',profileId:null,providerId:null,providerUrl:null,output:null,uploadedAssetId:null,createdAt:now,updatedAt:now,history:[{at:now,state:'queued',note:'Lưu nháp local; chưa gửi Muse.'}],usage:null}),deduplicated:false};}
  transition(id,next,patch={}){const j=this.job(id);if(!transitions[j.state]?.includes(next))throw Error(`Không thể chuyển ${j.state} → ${next}.`);const {note,...rest}=patch,now=Date.now();return this.put({...j,...rest,state:next,updatedAt:now,history:[...j.history,{at:now,state:next,profileId:rest.profileId??j.profileId,note:note||next}].slice(-100)});}
  recover(){for(const j of this.jobs()){if(['preflight','prepared'].includes(j.state))this.transition(j.id,'needs_attention',{note:'Gián đoạn trước gửi. Kiểm tra trang; không tự gửi lại.'});else if(['submitting','submitted','waiting','downloading','validating'].includes(j.state))this.transition(j.id,'needs_attention',{note:j.providerId?'Có mã kết quả cũ. Chọn Tiếp tục lấy kết quả; không gửi mới.':'Chưa rõ Muse đã nhận chưa. Kiểm tra thủ công trước; không retry mù.'});}}
  retry(id){return this.retryMany([{id}])[0];}
  retryMany(items, requestId = randomUUID()) {
    const hash=createHash('sha256').update(JSON.stringify(items)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const operations=this.get('job_retry_operations',{}), prior=operations[requestId];
      if(prior){
        if(prior.hash!==hash)throw Error('Mã tạo lại đã dùng cho nội dung khác.');
        const jobs=prior.ids.map(id=>this.job(id));this.db.exec('COMMIT');return jobs;
      }
      if(!items.length||items.length>30||new Set(items.map(item=>item.id)).size!==items.length)throw Error('Chọn từ 1 đến 30 việc khác nhau.');
      if(this.jobs().length+items.length>500)throw Error('Đã chạm giới hạn 500 job local.');
      const sources=items.map(item=>this.job(item.id));
      for(const source of sources){
        const reason=retryBlockedReason(source);if(reason)throw Error(reason);
        // Bundle children share the parent's send, including legacy incomplete receipts.
        if(source.bundleParentId){const reason=retryBlockedReason(this.job(source.bundleParentId));if(reason)throw Error(reason);}
        const admitted=Object.values(this.get('muse_nights',{})).some(n=>n.submissions?.some(s=>s.jobId===source.id));
        if(admitted&&!source.reconciled)throw Error('Lượt cũ chưa đối soát. Kiểm tra kết quả Muse trước khi tạo lại.');
      }
      const jobs=sources.map((source,index)=>{
        const body=items[index].body;
        if(body!==undefined&&(typeof body!=='string'||!(source.request.mediaType==='video'?museVideoBody(body):body).trim()||body.length>10000))throw Error('Mô tả cảnh cần từ 1 đến 10.000 ký tự.');
        const prompt=body??source.request.prompt;
        const request={...source.request,...(typeof prompt==='string'?{prompt:museMediaPrompt(prompt,source.request.mediaType)}:{})};
        if(request.prompt?.length>10000)throw Error('Prompt vượt 10.000 ký tự, gồm câu lệnh cố định.');
        const now=Date.now();
        return this.put({id:randomUUID(),fingerprint:body===undefined?source.fingerprint:jobFingerprint(request),request,provider:source.provider??'muse',
          state:'queued',retryOf:source.id,retryRootId:source.retryRootId??source.id,retryRequestId:requestId,
          preferredProfileId:source.preferredProfileId??source.profileId??null,
          profileId:null,providerId:null,providerUrl:null,providerResponse:null,output:null,uploadedAssetId:null,
          failedFilePath:null,diagnosticPath:null,failureCode:null,errorKind:null,submitBatchId:null,
          bundleParentId:null,bundleJobIds:null,submittedViaParent:null,bundleProviderIds:null,submittedPrompt:null,
          timings:null,failureDetail:null,unmappedProviderIds:null,reconciled:false,reconciledAt:null,usage:null,
          createdAt:now,updatedAt:now,history:[{at:now,state:'queued',note:'Đã tạo việc mới từ '+source.id+'. Duyệt và chạy để gửi Muse.'}]});
      });
      this.set('job_retry_operations',{...operations,[requestId]:{hash,ids:jobs.map(j=>j.id)}});
      this.db.exec('COMMIT');return jobs;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close(){this.db.close();}
}

