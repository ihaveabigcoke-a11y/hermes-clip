import type {MediaEntry} from './media-catalog';
type LinkedJob={id:string;retryOf?:string;uploadedAssetId:string|null;request:{projectId:string;sceneId:string}};

/** Resolve the explicit retry edge, never guess from scene order or names. */
export function originalMedia(entry:MediaEntry,catalog:MediaEntry[],jobs:LinkedJob[]){
  if(!entry.take.type.startsWith('video/'))return null;
  const attempt=entry.scene.attempts.find(a=>a.id===entry.take.attemptId);
  const job=jobs.find(j=>j.request.projectId===entry.project.id&&j.request.sceneId===entry.scene.id&&
    (attempt?j.id===attempt.requestId:j.uploadedAssetId===entry.take.assetId));
  if(!job?.retryOf)return null;
  const source=jobs.find(j=>j.id===job.retryOf);
  const original=source&&catalog.find(item=>item.project.id===source.request.projectId&&item.scene.id===source.request.sceneId&&item.take.type.startsWith('video/')&&
    (source.uploadedAssetId?item.take.assetId===source.uploadedAssetId:item.scene.attempts.some(a=>a.id===item.take.attemptId&&a.requestId===source.id)));
  return {jobId:job.retryOf,entry:original??null};
}
