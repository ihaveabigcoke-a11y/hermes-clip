import {sessionCookie} from './server.mjs';

export async function importWorkerOutput(local, worker, id) {
  const job = worker.store.job(id);
  const headers = {Cookie: `${sessionCookie}=${local.session}`, Origin: local.origin};
  const request = async (path, options = {}) => {
    const response = await fetch(local.origin + path, {
      ...options,
      headers: {...headers, ...options.headers},
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Chưa nhập được kết quả vào dự án.');
      error.status = response.status;
      throw error;
    }
    return data;
  };
  const commandId = `desktop_${id}`;
  const projectState = async () => {
    const {records} = await request('/api/lab');
    const project = records.find(record => record.id === job.request.projectId && record.kind === 'production');
    const product = records.find(record => record.id === job.request.productId && record.kind === 'product');
    if (project?.data.receipts.includes(commandId)) return {project, received: true};
    const scene = project?.data.scenes.find(scene => scene.id === job.request.sceneId);
    if (!project || !product || product.data.archived || product.revision !== job.request.productRevision
        || project.data.productId !== product.id || project.data.productRevision !== job.request.productRevision
        || scene?.revision !== job.request.sceneRevision) {
      throw Error('Cảnh hoặc sản phẩm đã đổi. File đã tải được giữ để đối chiếu phiên bản.');
    }
    return {project, received: false};
  };
  let state = await projectState();
  if (state.received) {await local.reuseWorkerOutput?.(job,job.uploadedAssetId);return state.project;}
  let assetId = job.uploadedAssetId;
  if (!assetId) {
    const output = await worker.output(id);
    const form = new FormData();
    form.append('file', new File([output.bytes], output.name, {type: output.type}));
    form.append('commandId', commandId);
    const uploaded = await request('/api/assets', {method: 'POST', body: form});
    if (uploaded.sha256 !== output.sha256) throw Error('Checksum của file nhập không khớp bản tải.');
    assetId = uploaded.id;
    worker.acknowledge(id, assetId);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await request('/api/production', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          id: state.project.id, revision: state.project.revision, commandId, action: 'worker_result',
          input: {sceneId: job.request.sceneId, sceneRevision: job.request.sceneRevision,
            productRevision: job.request.productRevision, jobId: id, providerId: job.providerId, assetId},
        }),
      });
      await local.reuseWorkerOutput?.(worker.store.job(id),assetId);
      return result.record;
    } catch (error) {
      if (error.status !== 409 || attempt === 3) throw error;
      state = await projectState();
      if (state.received) {await local.reuseWorkerOutput?.(worker.store.job(id),assetId);return state.project;}
    }
  }
}
