import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {probeMedia} from '../src/compress.mjs';
import {concatLibraryClips} from '../src/media.mjs';

const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function libraryMerger({db,root,filePath,bucket,productionSchema,render=concatLibraryClips}){
 const active=new Map();
 const get=(key,kind)=>db.prepare('SELECT * FROM lab_records WHERE owner_id=? AND id=? AND kind=?').get('local-owner',key,kind);
 async function merge(input){
  if(!input||!id(input.projectId)||!id(input.requestId)||!Array.isArray(input.clips)||input.clips.length<2||input.clips.length>30||input.clips.some(c=>!c||!id(c.sceneId)||!id(c.takeId))||new Set(input.clips.map(c=>c.sceneId+':'+c.takeId)).size!==input.clips.length)throw Error('Chọn 2–30 clip khác nhau trong cùng dự án.');
  const name=typeof input.name==='string'?input.name.trim().normalize('NFC'):'';
  if(!name||name.length>140||/[<>:"/\\|?*\u0000-\u001f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('Tên file không hợp lệ; dùng tối đa 140 ký tự, không dùng ký tự đường dẫn.');
  const filename=/\.mp4$/i.test(name)?name:name+'.mp4';
  const fingerprint=JSON.stringify([input.projectId,filename,input.clips.map(c=>[c.sceneId,c.takeId])]);
  const key=input.projectId+':'+input.requestId;
  if(active.has(key)){const current=active.get(key);if(current.fingerprint!==fingerprint)throw Error('Mã ghép đã dùng cho lựa chọn khác.');return current.promise;}
  // Keep one local render at a time; there is no Muse dispatch or retry here.
  if(active.size)throw Error('Đang ghép video. Chờ bản hiện tại hoàn tất.');
  const promise=perform(input,filename);active.set(key,{fingerprint,promise});
  try{return await promise;}finally{active.delete(key);}
 }
 async function perform(input,name){
  const row=get(input.projectId,'production');if(!row)throw Error('Không tìm thấy dự án.');
  const project=JSON.parse(row.data);productionSchema.parse(project);
  const existing=project.scenes.flatMap(s=>s.takes.map(t=>({s,t}))).find(({t})=>t.merge?.requestId===input.requestId);
  if(existing){
   if(existing.t.name!==name||JSON.stringify(existing.t.merge.sources.map(c=>[c.sceneId,c.takeId]))!==JSON.stringify(input.clips.map(c=>[c.sceneId,c.takeId])))throw Error('Mã ghép đã dùng cho lựa chọn khác.');
   return {assetId:existing.t.assetId,sceneId:existing.s.id,takeId:existing.t.id,reused:true};
  }
  if(project.scenes.length>=30)throw Error('Dự án đã đủ 30 cảnh; chưa thể thêm bản ghép.');
  const selected=input.clips.map(c=>{const scene=project.scenes.find(s=>s.id===c.sceneId),take=scene?.takes.find(t=>t.id===c.takeId),assetRow=take&&get(take.assetId,'asset'),asset=assetRow&&JSON.parse(assetRow.data);
   if(!scene||!take||!asset||!take.type.startsWith('video/')||asset.type!==take.type||asset.sha256!==take.sha256)throw Error('Clip nguồn không còn hợp lệ trong dự án này.');
   return {scene,take,asset};
  });
  const temp=await mkdtemp(join(root,'library-merge-'));
  let storedKey,committed=false;
  try{
   const clips=[],sources=[];
   for(const [index,{scene,take,asset}] of selected.entries()){
    const source=filePath(asset.key),size=(await stat(source)).size;
    if(size!==asset.size||size>256*1024**2)throw Error('Kích thước clip nguồn không hợp lệ.');
    const path=join(temp,'clip-'+index+(asset.type==='video/webm'?'.webm':'.mp4'));
    await copyFile(source,path);
    if(hash(await readFile(path))!==take.sha256)throw Error('Hash clip nguồn đã thay đổi; giữ bản gốc và dừng ghép.');
    const probe=await probeMedia(path);
    if(!Number.isFinite(probe.duration)||probe.duration<=0)throw Error('Không đọc được thời lượng clip nguồn.');
    clips.push({path,duration:probe.duration,audio:probe.audio.length>0,width:probe.width,height:probe.height});
    sources.push({sceneId:scene.id,takeId:take.id,assetId:take.assetId,sha256:take.sha256,duration:probe.duration,silent:!probe.audio.length});
   }
   const duration=clips.reduce((sum,c)=>sum+c.duration,0);if(duration>7200)throw Error('Tổng bản ghép tối đa 2 giờ.');
   const output=join(temp,'merged.mp4'),checked=await render(clips,output,clips[0]);
   if(!checked.fullDecode||checked.metadata.width!==clips[0].width||checked.metadata.height!==clips[0].height||Math.abs(checked.metadata.duration-duration)>.1)throw Error('Bản ghép chưa đạt kiểm tra media.');
   const assetId='merge_'+randomUUID(),sceneId='scene_'+randomUUID(),takeId='take_'+randomUUID(),now=Date.now();
   storedKey='local-owner/'+assetId+'.mp4';
   const asset={key:storedKey,name,type:'video/mp4',size:checked.size,sha256:checked.sha256,metadata:checked.metadata};
   const take={id:takeId,attemptId:null,assetId,name,type:asset.type,size:asset.size,sha256:asset.sha256,metadata:asset.metadata,provider:'manual',sceneRevision:1,review:'pending',notes:'Bản ghép · giữ nguyên các clip nguồn.',createdAt:now,merge:{requestId:input.requestId,sources}};
   const scene={id:sceneId,name:name.replace(/\.mp4$/i,''),role:'body',mediaType:'video',mediaProvider:'manual',prompt:'Local concatenation of saved library clips.',action:'',camera:'',voice:'',ratio:selected[0].scene.ratio,duration:checked.metadata.duration,revision:1,references:[],storyboardApproved:false,attempts:[],takes:[take],libraryMerge:true};
   project.scenes.push(scene);productionSchema.parse(project);
   const bytes=await readFile(output);if(hash(bytes)!==checked.sha256)throw Error('Bản ghép thay đổi sau kiểm tra.');
   await bucket.put(storedKey,bytes);
   db.exec('BEGIN IMMEDIATE');
   try{
    const changed=db.prepare('UPDATE lab_records SET data=?,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND kind=? AND revision=?').run(JSON.stringify(project),now,'local-owner',row.id,'production',row.revision);
    if(!changed.changes)throw Error('Dự án vừa thay đổi. Tải lại trước khi ghép.');
    db.prepare('INSERT INTO lab_records VALUES(?,?,?,?,1,?,?)').run('local-owner',assetId,'asset',JSON.stringify(asset),now,now);
    db.exec('COMMIT');committed=true;
   }catch(error){db.exec('ROLLBACK');throw error;}
   return {assetId,sceneId,takeId,metadata:checked.metadata,sha256:checked.sha256};
  }finally{
   if(storedKey&&!committed)await bucket.delete(storedKey);
   await rm(temp,{recursive:true,force:true});
  }
 }
 return {merge};
}
