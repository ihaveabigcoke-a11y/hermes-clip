import {videoProfiles} from '../../desktop/src/video-profiles.mjs';
import type {DesktopStatus,DesktopProfile} from './desktop-client';
import type {LabRecord} from './domain';

export type VideoMeasurement = {measuredAt:number;elapsedMs:number;sceneCount:number;hookCount:number;profileIds:string[]};

/** Only a completed run whose new clips all arrived during this click is comparable. */
export function completedVideoMeasurement(startedAt:number, finishedAt:number, sceneIds:string[], jobs:any[]):VideoMeasurement|null {
  const completed=sceneIds.map(id=>jobs.find(j=>j.request.sceneId===id&&j.state==='ready'&&j.uploadedAssetId
    && !j.importError&&j.profileId&&j.timings?.preflightStartedAt>=startedAt&&j.importedAt>=startedAt));
  if(!sceneIds.length||completed.some(j=>!j)||!Number.isFinite(finishedAt-startedAt)||finishedAt<=startedAt)return null;
  return {measuredAt:finishedAt,elapsedMs:finishedAt-startedAt,sceneCount:sceneIds.length,hookCount:3,profileIds:[...new Set(completed.map(j=>j.profileId as string))].sort()};
}

export function videoPreview(status:DesktopStatus|null, project:LabRecord|null, measurement:VideoMeasurement|null) {
  const missing=(project?.data.scenes??[]).filter((s:any)=>s.mediaType==='video'&&!s.takes.some((t:any)=>t.sceneRevision===s.revision&&t.review!=='rejected'));
  const cardCount=project?.data.scenes?.length?missing.length:5;
  const jobs=(status?.jobs??[]).filter(j=>j.request.projectId===project?.id&&missing.some((s:any)=>s.id===j.request.sceneId));
  const blocked=jobs.some(j=>['unknown','needs_attention'].includes(j.state));
  const inProgress=jobs.some(j=>['preflight','prepared','submitting','submitted','waiting','downloading','validating'].includes(j.state));
  const available:DesktopProfile[]=status&&status.musePaused===false&&status.generationReady&&!status.storage?.blocked&&!status.museNight?.stopped&&status.museNight?.remaining!==0
    ?videoProfiles(status.profiles):[];
  const profiles=blocked||inProgress||!cardCount?[]:available.slice(0,Math.min(3,cardCount));
  const profileIds=profiles.map(p=>p.id).sort();
  const comparable=profiles.length>0&&measurement&&Number.isFinite(measurement.elapsedMs)&&measurement.elapsedMs>0
    && measurement.hookCount===3&&measurement.sceneCount===cardCount
    && JSON.stringify([...measurement.profileIds].sort())===JSON.stringify(profileIds);
  const estimateSeconds=comparable?Math.max(1,Math.round(measurement.elapsedMs/1000)):null;
  const target=!status?'Đang đọc hồ sơ':blocked?'Cần đối soát trước khi gửi':inProgress?'Đang lấy kết quả cũ':!cardCount?'Dùng clip đã có':profiles.length?profiles.map(p=>p.name).join(' / '):'Chưa có hồ sơ sẵn sàng';
  return {hookCount:3,cardCount,profiles,estimateSeconds,
    text:`3 hook · ${cardCount} thẻ cần tạo → ${target}${profiles.length?` · ${profiles.length} hồ sơ`:''}${estimateSeconds!==null?`, dự kiến ~${estimateSeconds} s`:''}`};
}
