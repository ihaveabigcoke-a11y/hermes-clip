import {DatabaseSync} from 'node:sqlite';
import {randomUUID, createHash} from 'node:crypto';
import {transitions, jobFingerprint} from './contracts.mjs';
import {retryBlockedReason} from './job-retry.mjs';
import {isRunningJob, isLostJob, jobHeartbeatTimeout, runningJobStates} from './job-status.mjs';
import {openSync, readSync, fstatSync, closeSync} from 'node:fs';
import {museMediaPrompt, museVideoBody} from './muse-video-prompt.mjs';
import {migrateMuseClips,seedMuseClips,claimMuseClips,duplicateMuseClip,recordMuseClip} from './muse-clip-ledger.mjs';
export class Store {
  failedOutputChecks = new Map();
  get closed(){return !this.db.isOpen;}
  constructor(path){this.db=new DatabaseSync(path);this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS fingerprint_idx ON jobs(fingerprint);");migrateMuseClips(this.db);}
  seedMuseClips(records){seedMuseClips(this.db,records);}
  claimMuseClips(entries){claimMuseClips(this.db,entries);}
  duplicateMuseClip(job,output){return duplicateMuseClip(this.db,job,output);}
  recordMuseClip(job){recordMuseClip(this.db,job);}
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
  transition(id,next,patch={}){const j=this.job(id);if(!transitions[j.state]?.includes(next))throw Error(`Không thể chuyển ${j.state} → ${next}.`);const {note,...rest}=patch,now=Date.now();return this.put({...j,...rest,state:next,updatedAt:now,...(runningJobStates.has(next)?{heartbeatAt:now}:{}),history:[...j.history,{at:now,state:next,profileId:rest.profileId??j.profileId,note:note||next}].slice(-100)});}
  heartbeat(ids, now=Date.now()) {
    // Evaluate state in the same UPDATE, including across SQLite connections.
    const states=[...runningJobStates],statement=this.db.prepare("UPDATE jobs SET body=json_set(body,'$.heartbeatAt',?) WHERE id=? AND json_extract(body,'$.state') IN ("+states.map(()=>'?').join(',')+")");
    for(const id of ids)statement.run(now,id,...states);
  }
  completeOutputs(entries) {
    // All validated bundle outputs and their terminal states commit together.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for(const {id,patch} of entries)this.transition(id,'ready',patch);
      this.db.exec('COMMIT');
    } catch(error) {this.db.exec('ROLLBACK');throw error;}
  }
  recover({restart=true,now=Date.now(),timeoutMs=jobHeartbeatTimeout(this.get('adapter'))}={}) {
    const jobs=this.jobs(), handled=new Set();
    for(const job of jobs) {
      const interrupted=job.state==='needs_attention'&&job.failureCode==='WORKER_INTERRUPTED';
      if(job.reconciliation==='skipped'||handled.has(job.id)||(!isRunningJob(job)&&!interrupted&&!(isLostJob(job)&&job.output)))continue;
      const last=job.heartbeatAt??job.updatedAt??job.createdAt;
      const overdue=!Number.isFinite(last)||now-last>=timeoutMs;
      if(!restart&&!overdue)continue;
      const parent=job.bundleParentId?jobs.find(j=>j.id===job.bundleParentId):job;
      const bundle=parent?.bundleMapping==='appearance-v1';
      const members=bundle?(parent.bundleJobIds??[]).map(id=>jobs.find(j=>j.id===id)):[job];
      // A partial appearance bundle must never bypass cardinality/visual checks.
      const verified=members.length>0&&(!bundle||(members.length===3&&new Set(parent.bundleJobIds).size===3))&&members.every(j=>j&&j.reconciliation!=='skipped'&&['ready','needs_attention',...runningJobStates].includes(j.state)
        &&(!bundle||j.output?.bundleVisualCheck)&&this.verifiedSavedOutput(j));
      if(verified) {
        let claimed=false;
        try {this.seedMuseClips();this.claimMuseClips(members.map(j=>({job:j,output:j.output})));claimed=true;}
        catch { /* Keep the original receipt and require reconciliation. */ }
        // A ledger conflict must not turn an old clip into a successful result.
        if(claimed) {
          this.db.exec('BEGIN IMMEDIATE');
          try {
            const currentMembers=members.map(member=>this.job(member.id));
            if(currentMembers.some((j,i)=>j.reconciliation==='skipped'||!['ready','needs_attention',...runningJobStates].includes(j.state)||JSON.stringify(j.output)!==JSON.stringify(members[i].output))){
              this.db.exec('ROLLBACK');continue;
            }
            for(const member of members) {
              handled.add(member.id);
              const current=this.job(member.id);
              if(current.state==='ready')continue;
              this.put({...current,state:'ready',updatedAt:now,failedFilePath:null,
                history:[...current.history,{at:now,state:'ready',profileId:current.profileId,note:'Đã đối chiếu SHA-256 với file đã kiểm trên máy; hoàn tất, không gửi lại Muse.'}].slice(-100)});
            }
            this.db.exec('COMMIT');continue;
          } catch(error) {this.db.exec('ROLLBACK');throw error;}
        }
      }
      if(!isRunningJob(job)&&!(interrupted&&overdue))continue;
      const note=overdue?'Lỗi: mất dấu. Quá thời gian chờ không có nhịp báo; kiểm tra kết quả cũ trước khi tạo lại.'
        :'Tác vụ gián đoạn khi đóng app. Kiểm tra kết quả cũ; không tự gửi lại.';
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const current=this.job(job.id);
        // Do not overwrite progress/ready committed through another connection
        // while hashing a saved file. The next sweep will read the new snapshot.
        if(JSON.stringify(current)===JSON.stringify(job))this.put({...current,state:'needs_attention',updatedAt:now,heartbeatAt:last,reconciled:false,
          failureCode:overdue?'WORKER_LOST':'WORKER_INTERRUPTED',failureDetail:note,
          history:[...current.history,{at:now,state:'needs_attention',profileId:current.profileId,note}].slice(-100)});
        this.db.exec('COMMIT');
      } catch(error) {this.db.exec('ROLLBACK');throw error;}
    }
  }
  verifiedSavedOutput(job) {
    const output=job.output;
    if(!output?.path||!/^[a-f0-9]{64}$/i.test(output.sha256??'')||output.fullDecode!==true||output.metadata?.verifiedBy!=='container')return false;
    let fd;
    try {
      fd=openSync(output.path,'r');const before=fstatSync(fd);
      if(!before.isFile()||before.size<=0||before.size>64*1024**2||(output.size!=null&&output.size!==before.size))return false;
      const key=JSON.stringify([job.updatedAt,output,before.size,before.mtimeMs,before.ctimeMs,before.dev,before.ino]);
      if(this.failedOutputChecks.get(job.id)===key)return false;
      this.failedOutputChecks.delete(job.id);
      const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let size=0,n;
      while((n=readSync(fd,buffer,0,buffer.length,null))>0){size+=n;if(size>64*1024**2)return false;hash.update(buffer.subarray(0,n));}
      const after=fstatSync(fd);
      const stable=size===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ctimeMs===before.ctimeMs;
      const verified=stable&&hash.digest('hex')===output.sha256.toLowerCase();
      // Only memoize a stable failure. Recovery still rehashes every success
      // before publishing ready; replacing/editing a file invalidates a miss.
      if(stable&&!verified){
        if(this.failedOutputChecks.size>=500)this.failedOutputChecks.delete(this.failedOutputChecks.keys().next().value);
        this.failedOutputChecks.set(job.id,key);
      }
      return verified;
    } catch {return false;} finally {if(fd!==undefined)closeSync(fd);}
  }
  continueJob(source, request, requestId, signature) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const operations=this.get('muse_continuations',{}),prior=operations[requestId];
      if(prior){if(prior.signature!==signature)throw Error('Mã gửi tiếp đã dùng cho nội dung khác.');this.db.exec('COMMIT');return this.job(prior.id);}
      const {job}=this.enqueue(request,'continue:'+requestId);
      const linked=this.put({...job,continueOf:source.id,retryRootId:source.retryRootId??source.id,
        continueThreadUrl:source.providerUrl,preferredProfileId:source.profileId,
        history:[{at:job.createdAt,state:'queued',note:'Tiếp tục đúng hội thoại và hồ sơ của việc gốc.'}]});
      this.set('muse_continuations',{...operations,[requestId]:{id:linked.id,signature}});
      this.db.exec('COMMIT');return linked;
    } catch(error){this.db.exec('ROLLBACK');throw error;}
  }
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
  close(){if(!this.closed)this.db.close();this.failedOutputChecks.clear();}
}

