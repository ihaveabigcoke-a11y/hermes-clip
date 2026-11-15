import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {characterKey, characterSelection} from '../src/characters.mjs';

export function characterLibrary(db, filePath) {
  // Additive, idempotent migration. Existing records, media and receipts stay intact.
  db.exec(`CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL, kind TEXT NOT NULL,
    notes TEXT NOT NULL, asset_ids TEXT NOT NULL, revision INTEGER NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS characters_live_name ON characters(name_key) WHERE deleted_at IS NULL;`);
  const decode = row => ({id:row.id,name:row.name,kind:row.kind,notes:row.notes,assetIds:JSON.parse(row.asset_ids),revision:row.revision});
  const list = () => db.prepare('SELECT * FROM characters WHERE deleted_at IS NULL ORDER BY created_at,id').all().map(decode);
  function asset(id) {
    const row = db.prepare("SELECT data FROM lab_records WHERE owner_id='local-owner' AND kind='asset' AND id=?").get(id);
    const value = row && JSON.parse(row.data);
    if (!value || !['image/png','image/jpeg','image/webp'].includes(value.type) || !/^[a-f0-9]{64}$/.test(value.sha256) || !value.metadata || !(value.size > 0 && value.size <= 8*1024*1024)) throw Error('Chọn ảnh PNG, JPG hoặc WebP đã lưu, tối đa 8 MB.');
    return value;
  }
  function save(input) {
    const name = String(input.name ?? '').trim().normalize('NFKC'), notes = String(input.notes ?? '').trim();
    if (!/^[\p{L}][\p{L}\p{M}\p{N}_-]{0,39}$/u.test(name)) throw Error('Tên bắt đầu bằng chữ, tối đa 40 ký tự; dùng dấu gạch dưới thay khoảng trắng.');
    if (!['product','mascot','illustration'].includes(input.kind)) throw Error('Chỉ dùng sản phẩm, linh vật hoặc nhân vật minh hoạ.');
    if (notes.length > 2000) throw Error('Ghi chú tối đa 2.000 ký tự.');
    if (!Array.isArray(input.assetIds) || input.assetIds.length < 1 || input.assetIds.length > 3 || new Set(input.assetIds).size !== input.assetIds.length || input.assetIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(id))) throw Error('Chọn từ 1 đến 3 ảnh khác nhau.');
    input.assetIds.forEach(asset);
    const old = input.id ? list().find(row => row.id === input.id) : null;
    if (input.id && (!old || input.revision !== old.revision)) throw Error('Nhân vật đã thay đổi. Tải lại trước khi lưu.');
    if (list().some(row => row.id !== old?.id && characterKey(row.name) === characterKey(name))) throw Error('Tên nhân vật đã tồn tại.');
    const id = old?.id ?? 'character_' + randomUUID(), now = Date.now();
    if (old) db.prepare('UPDATE characters SET name=?,name_key=?,kind=?,notes=?,asset_ids=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL').run(name,characterKey(name),input.kind,notes,JSON.stringify(input.assetIds),now,id,old.revision);
    else db.prepare('INSERT INTO characters VALUES(?,?,?,?,?,?,1,?,?,NULL)').run(id,name,characterKey(name),input.kind,notes,JSON.stringify(input.assetIds),now,now);
    return list().find(row => row.id === id);
  }
  function remove(input) {
    if (!input.id || !Number.isInteger(input.revision)) throw Error('Chọn nhân vật cần xoá.');
    const changed = db.prepare('UPDATE characters SET deleted_at=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL').run(Date.now(),input.id,input.revision);
    if (!changed.changes) throw Error('Nhân vật đã thay đổi. Tải lại trước khi xoá.');
  }
  async function references(prompt, existing = []) {
    const selected = characterSelection(prompt,true,list(),existing.length), refs = [];
    for (const row of selected) for (const [index,id] of row.assetIds.entries()) {
      const value = asset(id);
      refs.push({id:row.id+'_'+index,version:row.revision,role:'product',type:value.type,sha256:value.sha256,bytes:new Uint8Array(await readFile(filePath(value.key)))});
    }
    return [...existing,...refs];
  }
  return {list,save,remove,references};
}
