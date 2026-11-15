import {join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runMediaTool,probeMedia} from '../../src/compress.mjs';
import {newProduction,applyProduction} from '../../../lib/lab/production.ts';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export async function libraryFixture(root){
 await mkdir(root,{recursive:true});const records=[],media=[],paths=[],now=Date.now();
 let project=newProduction('Dự án kiểm ghép','product',1);
 const specs=[['red','720x1280',1.08,true,'9:16'],['blue','320x320',1.32,false,'1:1'],['green','640x360',.92,true,'16:9']];
 for(const [i,[color,size,duration,audio,ratio]] of specs.entries()){
  const path=join(root,`clip${i}.mp4`);paths.push(path);
  await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=${color}:s=${size}:r=25:d=${duration}`,...(audio?['-f','lavfi','-i',`sine=frequency=440:sample_rate=48000:duration=${duration}`]:[]),'-c:v','libx264','-threads','2','-pix_fmt','yuv420p',...(audio?['-c:a','aac']:[]),path]);
  const probe=await probeMedia(path),bytes=await readFile(path),sha256=digest(bytes),metadata={width:probe.width,height:probe.height,duration:probe.duration,verifiedBy:'container'};
  const asset={key:`local-owner/clip${i}.mp4`,name:`Clip ${i+1}.mp4`,type:'video/mp4',size:bytes.length,sha256,metadata};
  records.push({id:'clip'+i,kind:'asset',revision:1,updatedAt:now,data:asset});media.push({key:asset.key,base64:bytes.toString('base64')});
  project=applyProduction(project,'scene',{id:'scene'+i,name:['Clip dọc có tiếng','Clip vuông im lặng','Clip ngang có tiếng'][i],prompt:'A synthetic color clip.',duration:Math.max(1,duration),ratio,mediaType:'video',referenceIds:[]},'create'+i);
  const scene=project.scenes[i];scene.attempts=[{id:'attempt'+i,requestId:'job'+i,sceneRevision:scene.revision,status:'local_complete',provider:'muse',snapshot:'{}',providerJobId:'provider'+i,usageUsd:null,createdAt:now+i}];
  scene.takes=[{id:'take'+i,attemptId:'attempt'+i,assetId:'clip'+i,name:asset.name,type:asset.type,size:asset.size,sha256,metadata,provider:'muse',sceneRevision:scene.revision,review:'pending',notes:'Fixture',createdAt:now+i}];
 }
 records.push({id:'product',kind:'product',revision:1,updatedAt:now,data:{name:'Sản phẩm kiểm ghép',archived:false}},{id:'project',kind:'production',revision:1,updatedAt:now,data:project});
 const jobs=project.scenes.map((s,i)=>({id:'job'+i,...(i===1?{retryOf:'job0'}:{}),state:'ready',label:'Đã vào Thư viện',createdAt:now+i,profileId:'Duc',providerId:'provider'+i,uploadedAssetId:'clip'+i,importedAt:now,request:{projectId:'project',productId:'product',sceneId:s.id,sceneRevision:1,productRevision:1,name:s.name,prompt:'Synthetic fixture',mediaType:'video',ratio:s.ratio,duration:s.duration},output:null,history:[]}));
 const seedPath=join(root,'seed.json');await writeFile(seedPath,JSON.stringify({records,media}));
 return {records,media,paths,seedPath,jobs,input:{projectId:'project',requestId:'test-merge',name:'Bản ghép kiểm thử',clips:project.scenes.map(s=>({sceneId:s.id,takeId:s.takes[0].id}))}};
}
