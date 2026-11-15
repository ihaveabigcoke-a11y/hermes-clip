// Append-only byte provenance. A reservation closes the gap between SQLite and
// workspace import; after a crash only that same job/scene may finish importing.
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
export const clipHashes = output => [...new Set([output?.sha256, output?.compression?.sourceSha256]
  .filter(validHash).map(value => value.toLowerCase()))];

export function migrateMuseClips(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS muse_clip_hashes (
    id INTEGER PRIMARY KEY, sha256 TEXT NOT NULL, job_id TEXT NOT NULL,
    project_id TEXT NOT NULL, scene_id TEXT NOT NULL, queue_number INTEGER,
    asset_id TEXT, take_id TEXT, created_at INTEGER NOT NULL, imported_at INTEGER,
    UNIQUE(sha256, job_id, project_id, scene_id));
    CREATE INDEX IF NOT EXISTS muse_clip_hash_lookup ON muse_clip_hashes(sha256);`);
}

function append(db, source, output) {
  const insert = db.prepare(`INSERT INTO muse_clip_hashes
    (sha256,job_id,project_id,scene_id,queue_number,asset_id,take_id,created_at,imported_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(sha256,job_id,project_id,scene_id) DO UPDATE SET
    asset_id=COALESCE(muse_clip_hashes.asset_id,excluded.asset_id),
    take_id=COALESCE(muse_clip_hashes.take_id,excluded.take_id),
    imported_at=COALESCE(muse_clip_hashes.imported_at,excluded.imported_at)`);
  for (const hash of clipHashes(output)) insert.run(hash, source.jobId, source.projectId, source.sceneId,
    source.queueNumber ?? null, source.assetId ?? null, source.takeId ?? null, source.createdAt ?? Date.now(), source.importedAt ?? null);
}

function jobSource(db, job) {
  return {jobId:job.id, projectId:job.request.projectId, sceneId:job.request.sceneId,
    queueNumber:db.prepare('SELECT rowid FROM jobs WHERE id=?').get(job.id)?.rowid,
    assetId:job.uploadedAssetId, importedAt:job.importedAt ?? (job.uploadedAssetId ? job.updatedAt : null), createdAt:job.createdAt};
}

export function seedMuseClips(db, records = []) {
  // Do not use Store.jobs(): its UI limit must not truncate historical evidence.
  db.exec('BEGIN IMMEDIATE');
  try {
    const jobs = new Map(db.prepare('SELECT body FROM jobs ORDER BY rowid').all().map(row => {
      const job = JSON.parse(row.body); return [job.id, job];
    }));
    for (const job of jobs.values()) if ((job.provider ?? 'muse') === 'muse' && (job.importedAt || job.uploadedAssetId)) {
      append(db, jobSource(db,job), job.output);
    }
    for (const project of records) if (project.kind === 'production') for (const scene of project.data?.scenes ?? []) {
      for (const take of scene.takes ?? []) {
        const attempt = scene.attempts?.find(item => item.id === take.attemptId);
        const job = jobs.get(attempt?.requestId);
        if (take.provider === 'manual' || attempt?.provider === 'manual') continue;
        if (take.provider !== 'muse' && attempt?.provider !== 'muse' && !job && attempt?.status !== 'local_complete') continue;
        const jobId = job?.id ?? attempt?.requestId ?? `take:${project.id}:${scene.id}:${take.id}`;
        append(db, {jobId,projectId:project.id,sceneId:scene.id,queueNumber:job ? jobSource(db,job).queueNumber : null,
          assetId:take.assetId,takeId:take.id,createdAt:take.createdAt,importedAt:take.createdAt}, take);
      }
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function duplicateMuseClip(db, job, output) {
  for (const hash of clipHashes(output)) {
    const row = db.prepare(`SELECT * FROM muse_clip_hashes WHERE sha256=?
      AND NOT (job_id=? AND project_id=? AND scene_id=?) ORDER BY id LIMIT 1`)
      .get(hash,job.id,job.request.projectId,job.request.sceneId);
    if (row) return {jobId:row.job_id,projectId:row.project_id,sceneId:row.scene_id,
      queueNumber:row.queue_number,number:row.queue_number ?? row.id,assetId:row.asset_id,takeId:row.take_id,sha256:hash};
  }
  return null;
}

export function duplicateClipError(job, source) {
  return Object.assign(Error(`Trùng clip cũ #${source.number}. Giữ biên nhận; chọn tạo lại hoặc nhập tay.`),
    {code:'MUSE_OLD_CLIP',duplicateOf:source,jobId:job.id});
}

export function claimMuseClips(db, entries) {
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const {job,output} of entries) {
      if (!clipHashes(output).length) throw Error('Thiếu checksum của file Muse đã kiểm.');
      // Grandfather already imported history, including old duplicate takes.
      const owned=clipHashes(output).every(hash=>db.prepare(`SELECT 1 FROM muse_clip_hashes
        WHERE sha256=? AND job_id=? AND project_id=? AND scene_id=? AND imported_at IS NOT NULL`)
        .get(hash,job.id,job.request.projectId,job.request.sceneId));
      if(owned)continue;
      const duplicate = duplicateMuseClip(db,job,output);
      if (duplicate) throw duplicateClipError(job,duplicate);
      append(db,jobSource(db,job),output);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function recordMuseClip(db, job) { append(db,jobSource(db,job),job.output); }
