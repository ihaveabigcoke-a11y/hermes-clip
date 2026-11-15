import {lstat, realpath, rm} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';

function explicitlySkipped(worker, job) {
  if ((job.provider ?? 'muse') !== 'muse' || !['needs_attention','unknown'].includes(job.state)) return false;
  // Read the authoritative scene, not a cached UI label or a job-history note.
  // A missing/unreadable record or timestamp must continue to block deletion.
  try {
    const record=worker.readProductionForProfileRemoval?.(job.request?.projectId);
    if(record?.kind!=='production'||record.id!==job.request?.projectId)return false;
    const scene=record.data.scenes.find(row=>row.id===job.request.sceneId);
    return Number.isFinite(job.createdAt)&&Number.isFinite(scene?.museReconciledAt)
      &&job.createdAt<=scene.museReconciledAt;
  } catch {return false;}
}

function removalPlan(worker, id) {
  const blocked=reason=>({reason,canSkip:false});
  if (typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(id))
    return blocked('Mã hồ sơ không hợp lệ. Tải lại danh sách hồ sơ trước khi xóa.');
  if(process.platform==='win32'&&worker.store.get('profiles',[]).some(p=>p.id!==id&&p.id.toLowerCase()===id.toLowerCase()))
    return blocked('Hai hồ sơ đang dùng chung tên thư mục trên Windows. Không xóa; kiểm tra mã hồ sơ để giữ phiên của hồ sơ khác.');
  for(const [lock,reason] of [
    [worker.active,'Hồ sơ đang gửi hoặc lấy kết quả Muse. Chờ tác vụ kết thúc rồi xóa; xem Hàng đợi để đối soát kết quả.'],
    [worker.chatting,'Hội thoại Muse đang xử lý. Chờ hội thoại kết thúc rồi xóa.'],
    [worker.checking,'Hồ sơ đang kiểm tra phiên và hạn mức. Chờ kiểm tra xong rồi xóa.'],
    [worker.connectingVpn,'Hồ sơ đang kết nối VPN. Chờ kết nối xong, đóng trình duyệt rồi xóa.'],
    [worker.opening,'Trình duyệt hồ sơ đang mở. Chờ mở xong, bấm Đóng trình duyệt rồi xóa.'],
    [worker.closing,'Trình duyệt hồ sơ đang đóng. Chờ đóng xong rồi xóa.'],
    [worker.deleting,'Hồ sơ đang được xóa. Chờ thao tác hoàn tất.'],
    [worker.contexts,'Đóng trình duyệt bằng nút Đóng trình duyệt của hồ sơ rồi xóa. Không cần tắt Muse.'],
  ])if(lock?.has(id))return blocked(reason);
  if([...worker.profileRunners??[]].some(r=>r.running&&r.rows().some(row=>row.id===r.running.id&&row.profileId===id)))
    return blocked('Đợt nghiên cứu hoặc triển khai của hồ sơ vẫn đang xử lý. Chờ đợt dừng hẳn rồi xóa.');
  const jobs=worker.store.jobs().filter(j=>j.profileId===id||j.preferredProfileId===id);
  if(jobs.some(j=>j.state==='queued'))return blocked('Hồ sơ còn tác vụ đang chờ. Mở Hàng đợi, hủy tác vụ chưa gửi và đối soát lượt cũ trước khi xóa.');
  if(jobs.some(j=>['preflight','prepared','submitting','submitted','waiting','downloading','validating'].includes(j.state)))
    return blocked('Hồ sơ còn tác vụ đang gửi hoặc lấy kết quả. Chờ tác vụ kết thúc; mở Hàng đợi để đối soát trước khi xóa.');
  const pendingJobs=jobs.filter(j=>['needs_attention','unknown'].includes(j.state)&&!explicitlySkipped(worker,j));
  if(pendingJobs.some(j=>(j.provider??'muse')!=='muse'||(j.profileId&&j.profileId!==id)))
    return blocked('Tác vụ liên quan thuộc hồ sơ hoặc nhà cung cấp khác. Mở Hàng đợi để đối soát đúng tác vụ trước khi xóa.');
  let pendingChats=[];
  const db=worker.store.db;
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='muse_chats'").get()) {
    const rows=db.prepare('SELECT body FROM muse_chats').all().map(r=>JSON.parse(r.body)).filter(r=>r.profileId===id);
    if(rows.some(r=>['preparing','waiting'].includes(r.state)))return blocked('Hội thoại Muse đang gửi hoặc chờ kết quả. Chờ hội thoại kết thúc rồi xóa.');
    pendingChats=rows.filter(r=>!r.reconciled&&['unknown','needs_attention'].includes(r.state));
  }
  const runs=[];
  for(const key of ['research_runs','product_deployments']){
    const rows=worker.store.get(key,[]).filter(r=>r.profileId===id);
    if(rows.some(r=>['queued','running'].includes(r.state)))return blocked('Hồ sơ còn đợt nghiên cứu hoặc triển khai đang chờ/chạy. Chờ đợt kết thúc hoặc tạm dừng đợt triển khai rồi xóa.');
    const pending=rows.filter(r=>!r.reconciled&&!['done','cancelled','failed','ready_for_review'].includes(r.state));
    if(pending.some(r=>!['unknown','needs_attention','paused','partial'].includes(r.state)))return blocked('Đợt nghiên cứu hoặc triển khai có trạng thái chưa xác định. Mở đợt để kiểm tra trước khi xóa.');
    runs.push(...pending.map(row=>({key,row})));
  }
  const count=pendingJobs.length+pendingChats.length+runs.length;
  return {reason:count?`Hồ sơ còn ${count} tác vụ/hội thoại/đợt chưa đối soát hoặc chưa hoàn tất. Kiểm tra kết quả cũ, hoặc chọn Bỏ qua và xóa nếu không cần lấy tiếp.`:'',canSkip:count>0,jobs:pendingJobs,chats:pendingChats,runs};
}

export function profileRemovalStatus(worker,id){const {reason,canSkip}=removalPlan(worker,id);return {deleteBlockedReason:reason,deleteCanSkip:canSkip};}
export function profileRemovalBlocker(worker,id){return removalPlan(worker,id).reason;}

async function checkedDirectory(worker,id) {
  const parent=resolve(worker.root,'profiles'),target=join(parent,id);
  if(dirname(target)!==parent)throw Error('Đường dẫn hồ sơ nằm ngoài thư mục cho phép. Không xóa; kiểm tra thư mục hồ sơ.');
  // Reject a redirected profiles parent too, including Windows junctions.
  let parentEntry;
  try{parentEntry=await lstat(parent);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!parentEntry)return {target,entry:null};
  if(parentEntry.isSymbolicLink()||!parentEntry.isDirectory())throw Error('Thư mục profiles là liên kết hoặc file không hợp lệ. Không xóa; kiểm tra đường dẫn hồ sơ.');
  const [actualRoot,actualParent]=await Promise.all([realpath(worker.root),realpath(parent)]);
  if(dirname(actualParent).toLowerCase()!==actualRoot.toLowerCase())throw Error('Thư mục profiles nằm ngoài thư mục dữ liệu cho phép. Không xóa; kiểm tra đường dẫn hồ sơ.');
  let entry;
  try{entry=await lstat(target);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(entry){
    if(entry.isSymbolicLink()||!entry.isDirectory())throw Error('Không xóa thư mục hồ sơ là liên kết hoặc file không xác định. Kiểm tra đường dẫn hồ sơ.');
    if(dirname(await realpath(target)).toLowerCase()!==actualParent.toLowerCase())throw Error('Đường dẫn thật của hồ sơ không hợp lệ. Không xóa; kiểm tra thư mục hồ sơ.');
  }
  return {target,entry};
}

export async function removeProfile(worker, {id, confirmName, skipUnreconciled=false}) {
  const profile=worker.store.get('profiles',[]).find(p=>p.id===id);
  if(!profile)throw Error('Hồ sơ không còn trong danh sách.');
  if(confirmName!==profile.name)throw Error('Nhập đúng tên hồ sơ để xác nhận xóa.');
  if(typeof skipUnreconciled!=='boolean')throw Error('Xác nhận Bỏ qua và xóa không hợp lệ. Mở lại hộp xác nhận.');
  const check=()=>{const plan=removalPlan(worker,id);if(plan.reason&&!(skipUnreconciled&&plan.canSkip))throw Error(plan.reason);return plan;};
  check();
  // Reserve the same lock used by context/open/save. Check again after asynchronous path checks.
  worker.deleting.add(id);
  try {
    const {target,entry}=await checkedDirectory(worker,id);
    worker.deleting.delete(id);
    const plan=check();
    worker.deleting.add(id);
    // This synchronous transaction makes the profile unavailable before removing its browser files.
    worker.store.db.exec('BEGIN IMMEDIATE');
    try{
      const at=Date.now(),skipped={jobs:[],chats:[],runs:[]};
      const patch={reconciled:true,reconciliation:'skipped',reconciledAt:at,profileRemovedAt:at};
      if(skipUnreconciled){
        for(const job of plan.jobs){
          worker.store.put({...job,...patch,history:[...job.history,{at,state:job.state,profileId:id,note:'Người dùng chọn Bỏ qua và xóa hồ sơ; không lấy tiếp kết quả, không gửi lại lượt này.'}]});
          skipped.jobs.push(job.id);
        }
        for(const chat of plan.chats){worker.store.db.prepare('UPDATE muse_chats SET body=? WHERE id=?').run(JSON.stringify({...chat,...patch}),chat.requestId);skipped.chats.push(chat.requestId);}
        for(const {key,row} of plan.runs){worker.store.set(key,worker.store.get(key,[]).map(r=>r.id===row.id?{...r,...patch}:r));skipped.runs.push({key,id:row.id});}
      }
      worker.store.set('deleted_profiles',[...worker.store.get('deleted_profiles',[]),{id,name:profile.name,deletedAt:at,...(skipUnreconciled?{skipped}:{})}]);
      worker.store.set('profiles',worker.store.get('profiles',[]).filter(p=>p.id!==id));
      worker.store.db.exec('COMMIT');
    }catch(e){worker.store.db.exec('ROLLBACK');throw e;}
    if(entry)await rm(target,{recursive:true,force:false});
    return {deleted:true,cleanupPending:false};
  } catch(error) {
    if(!worker.store.get('profiles',[]).some(p=>p.id===id))return {deleted:true,cleanupPending:true,message:'Đã bỏ hồ sơ khỏi danh sách. Windows chưa cho xóa hết file trình duyệt; lịch sử và video vẫn giữ. Đóng cửa sổ trình duyệt còn sót; không xóa thư mục dữ liệu chung.'};
    if(['EACCES','EPERM','EBUSY','ENOTDIR','ELOOP'].includes(error.code))throw Error('Windows chưa cho truy cập thư mục hồ sơ. Đóng trình duyệt, kiểm tra quyền và đường dẫn rồi thử lại; chưa xóa hồ sơ.');
    throw error;
  } finally {worker.deleting.delete(id);}
}
