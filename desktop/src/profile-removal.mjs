import {lstat, realpath, rm} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';

export function profileRemovalBlocker(worker, id) {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id ?? '')) return 'Mã hồ sơ không hợp lệ.';
  if ([worker.contexts,worker.opening,worker.active,worker.checking,worker.closing,worker.chatting,worker.connectingVpn,worker.deleting].some(lock=>lock?.has(id)))
    return 'Đóng trình duyệt và chờ tác vụ của hồ sơ kết thúc trước khi xóa.';
  const pending = new Set(['queued','preflight','prepared','submitting','submitted','waiting','downloading','validating','needs_attention','unknown']);
  if (worker.store.jobs().some(j=>(j.profileId===id||j.preferredProfileId===id)&&pending.has(j.state)))
    return 'Hồ sơ còn tác vụ đang chờ, đang chạy hoặc cần đối soát. Giữ hồ sơ để lấy đúng kết quả.';
  const db=worker.store.db;
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='muse_chats'").get()) {
    const rows=db.prepare('SELECT body FROM muse_chats').all().map(r=>JSON.parse(r.body));
    if(rows.some(r=>r.profileId===id&&!r.reconciled&&['preparing','waiting','unknown','needs_attention'].includes(r.state)))
      return 'Hội thoại Muse của hồ sơ còn đang chạy hoặc cần đối soát.';
  }
  for(const key of ['research_runs','product_deployments'])if(worker.store.get(key,[]).some(r=>r.profileId===id&&!r.reconciled&& !['done','cancelled','failed','ready_for_review'].includes(r.state)))
    return 'Hồ sơ còn đợt nghiên cứu hoặc triển khai chưa kết thúc.';
  return '';
}

export async function removeProfile(worker, {id, confirmName}) {
  const profile=worker.store.get('profiles',[]).find(p=>p.id===id);
  if(!profile)throw Error('Hồ sơ không còn trong danh sách.');
  if(confirmName!==profile.name)throw Error('Nhập đúng tên hồ sơ để xác nhận xóa.');
  const reason=profileRemovalBlocker(worker,id);if(reason)throw Error(reason);
  // Reserve the same lock used by context/open/save. Check again after asynchronous path checks.
  worker.deleting.add(id);
  let target;
  try {
    const parent=resolve(worker.root,'profiles');target=join(parent,id);
    if(dirname(target)!==parent)throw Error('Đường dẫn hồ sơ nằm ngoài thư mục cho phép.');
    let entry;
    try{entry=await lstat(target);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(entry){
      if(entry.isSymbolicLink()||!entry.isDirectory())throw Error('Không xóa thư mục hồ sơ là liên kết hoặc file không xác định.');
      const [actualParent,actualTarget]=await Promise.all([realpath(parent),realpath(target)]);
      if(dirname(actualTarget).toLowerCase()!==actualParent.toLowerCase())throw Error('Đường dẫn thật của hồ sơ không hợp lệ.');
    }
    worker.deleting.delete(id);
    const changed=profileRemovalBlocker(worker,id);if(changed)throw Error(changed);
    worker.deleting.add(id);
    // This synchronous transaction makes the profile unavailable before removing its browser files.
    worker.store.db.exec('BEGIN IMMEDIATE');
    try{
      worker.store.set('deleted_profiles',[...worker.store.get('deleted_profiles',[]),{id,name:profile.name,deletedAt:Date.now()}]);
      worker.store.set('profiles',worker.store.get('profiles',[]).filter(p=>p.id!==id));
      worker.store.db.exec('COMMIT');
    }catch(e){worker.store.db.exec('ROLLBACK');throw e;}
    if(entry)await rm(target,{recursive:true,force:false});
    return {deleted:true,cleanupPending:false};
  } catch(error) {
    if(!worker.store.get('profiles',[]).some(p=>p.id===id))return {deleted:true,cleanupPending:true,message:'Đã bỏ hồ sơ khỏi danh sách. Windows chưa cho xóa hết file trình duyệt; lịch sử và video vẫn giữ.'};
    throw error;
  } finally {worker.deleting.delete(id);}
}
