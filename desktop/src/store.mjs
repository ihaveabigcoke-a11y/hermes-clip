import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {transitions} from './contracts.mjs';
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
  jobs(){return this.db.prepare('SELECT body FROM jobs ORDER BY rowid DESC LIMIT 500').all().map(r=>JSON.parse(r.body));}
  job(id){const r=this.db.prepare('SELECT body FROM jobs WHERE id=?').get(id);if(!r)throw Error('Không tìm thấy job.');return JSON.parse(r.body);}
  put(j){this.db.prepare('INSERT INTO jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(j.id,j.fingerprint,JSON.stringify(j));return j;}
  enqueue(body,fingerprint,legacyFingerprint=fingerprint){const old=this.db.prepare('SELECT body FROM jobs WHERE fingerprint IN (?,?) ORDER BY rowid DESC LIMIT 1').get(fingerprint,legacyFingerprint);if(old)return {job:JSON.parse(old.body),deduplicated:true};if(this.jobs().length>=500)throw Error('Đã chạm 500 job local; sao lưu trước khi mở rộng.');const now=Date.now();return {job:this.put({id:randomUUID(),fingerprint,request:body,provider:'muse',state:'queued',profileId:null,providerId:null,providerUrl:null,output:null,uploadedAssetId:null,createdAt:now,updatedAt:now,history:[{at:now,state:'queued',note:'Lưu nháp local; chưa gửi Muse.'}],usage:null}),deduplicated:false};}
  transition(id,next,patch={}){const j=this.job(id);if(!transitions[j.state]?.includes(next))throw Error(`Không thể chuyển ${j.state} → ${next}.`);const {note,...rest}=patch,now=Date.now();return this.put({...j,...rest,state:next,updatedAt:now,history:[...j.history,{at:now,state:next,profileId:rest.profileId??j.profileId,note:note||next}].slice(-100)});}
  recover(){for(const j of this.jobs()){if(['preflight','prepared'].includes(j.state))this.transition(j.id,'needs_attention',{note:'Gián đoạn trước gửi. Kiểm tra trang; không tự gửi lại.'});else if(['submitting','submitted','waiting','downloading','validating'].includes(j.state))this.transition(j.id,'needs_attention',{note:j.providerId?'Có mã kết quả cũ. Chọn Tiếp tục lấy kết quả; không gửi mới.':'Chưa rõ Muse đã nhận chưa. Kiểm tra thủ công trước; không retry mù.'});}}
  retry(id){const j=this.job(id);if(this.jobs().length>=500)throw Error("Đã chạm giới hạn 500 job local.");if(!['failed','cancelled'].includes(j.state))throw Error('Chỉ tạo lại job đã kết thúc rõ ràng. Job chưa rõ kết quả phải đối soát trước.');return this.put({...j,id:randomUUID(),state:'queued',output:null,failedFilePath:null,diagnosticPath:null,uploadedAssetId:null,profileId:null,providerId:null,providerUrl:null,providerResponse:null,submitBatchId:null,createdAt:Date.now(),updatedAt:Date.now(),retryOf:j.id,reconciled:false,reconciledAt:null,history:[{at:Date.now(),state:'queued',note:'Đã thêm lượt tạo nháp. Chọn Duyệt và chạy để gửi Muse.'}]});}
  close(){this.db.close();}
}

