import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {accessBlocked,boundedText,extractListing,listingWarnings,pageText,publicUrl,youtubeObservation,webObservation} from './listing-check.mjs';

export const sourceCheckInput=z.object({batchId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/)}).strict();
const failedStatus=error=>error.unavailable?'unavailable':accessBlocked(error.message)?'blocked':'failed';
const queryFor=candidate=>candidate.name.replace(/[\r\n\0]/g,' ').replace(/^[\s-]+/,'').slice(0,120)||'product';

/** A durable integration job, with an in-memory callback only for this app session.
 * Restart interrupts both queued/running jobs; saved intents suppress automatic replay.
 */
export class ResearchSources {
 constructor({integrations,records,save,changed=()=>{}}){Object.assign(this,{integrations,records,save,changed});}
 async checkBatch(payload,{manual=false}={}){
  const {batchId}=sourceCheckInput.parse(payload);
  const record=(await this.records()).find(row=>row.id===batchId&&row.kind==='research_batch');
  if(!record)throw Error('Không tìm thấy đợt nghiên cứu.');
  return this.enqueue(record,{manual});
 }
 recheck(payload){return this.checkBatch(payload,{manual:true});}
 enqueue(record,{manual=false}={}){
  const i=this.integrations;
  if(!manual&&!i.autoSourceCheck())return null;
  if(!i.config())throw Error('Chưa cấu hình Agent Reach.');
  const jobs=i.jobs().filter(job=>job.kind==='source-check'&&job.projectId===record.id);
  if(manual&&jobs.some(job=>['queued','running'].includes(job.state)))throw Error('Đợt này đang chờ hoặc đang kiểm nguồn.');
  const seen=new Set(jobs.flatMap(job=>(job.request.candidates??[]).map(candidate=>candidate.id)));
  const candidates=record.data.candidates.slice(0,10).filter(candidate=>manual||!seen.has(candidate.id)).slice(0,manual?10:Math.max(0,10-seen.size));
  if(!candidates.length)return null;
  // Never accept arbitrary CLI argv from IPC or from a record.
  const request={manual,candidates:candidates.map(({id,name,supplierUrl})=>({id,name,supplierUrl}))};
  const job=i.enqueue('source-check',record.id,request,(dir,job)=>this.run(dir,job));
  this.changed();return job;
 }
 async persist(job,candidate,patch){
  for(let retry=0;retry<4;retry++){
   const record=(await this.records()).find(row=>row.id===job.projectId&&row.kind==='research_batch');
   const current=record?.data.candidates.find(row=>row.id===candidate.id);
   if(!current||current.supplierUrl!==candidate.supplierUrl||current.name!==candidate.name)throw Error('Ứng viên đã đổi tên/nguồn hoặc bị xóa; giữ receipt, không gắn kết quả cũ.');
   const listingCheck={...patch.listingCheck,warnings:listingWarnings(current,patch.listingCheck)};
   const next={...current,listingCheck,competition:{...current.competition,...patch.competition}};
   try{
    await this.save({...record,data:{...record.data,candidates:record.data.candidates.map(row=>row.id===candidate.id?next:row)}});
    this.changed();return;
   }catch(error){if(error.status!==409||retry===3)throw error;}
  }
 }
 async run(dir,job){
  const i=this.integrations,results=[];
  for(const [index,candidate] of job.request.candidates.entries()){
   if(i.stopped)break;
   const observedAt=new Date().toISOString(),query=queryFor(candidate);
   const rawPath=join(dir,`${index}-listing.txt`);
   let listingCheck={status:'failed',fetchedAt:observedAt,title:null,priceText:null,currencyDetected:null,moqText:null,shippingText:null,productCountOnPage:null,sourceUrl:candidate.supplierUrl,rawPath};
   const read=i.store.get('integration-health',null)?.reach?.listingRead;
   try{
    if(!publicUrl(candidate.supplierUrl))throw Error('URL nguồn không hợp lệ.');
    this.requireReady();
    if(!read?.command||!['read','web read'].includes(read.command.join(' ')))throw Object.assign(Error(read?.error||'Chưa xác nhận lệnh đọc trong --help; bấm Kiểm tra công cụ trước.'),{unavailable:true});
    const args=[...read.command,candidate.supplierUrl];
    if(read.timeoutFlag)args.push('--timeout','45');
    const response=await i.reach(args,{timeout:45000});
    const raw=pageText(response);await writeFile(rawPath,raw,'utf8');
    listingCheck=extractListing(raw,{fetchedAt:new Date().toISOString(),rawPath,sourceUrl:candidate.supplierUrl});
   }catch(error){
    listingCheck={...listingCheck,status:failedStatus(error),error:boundedText(error.message,1000)};
    await writeFile(rawPath,boundedText(error.message),'utf8');
   }
   if(i.stopped)break;
   const shortsQuery=query+' shorts',webQuery=query+' tiktok OR reels';
   const youtubeShorts=await this.search(['youtube','search',shortsQuery,'--limit','10','--timeout','45','--backend','public-web'],join(dir,`${index}-youtube.txt`),
    (items,at,path)=>youtubeObservation(items,shortsQuery,at,path));
   if(i.stopped)break;
   const webReferences=await this.search(['web','search',webQuery,'--limit','5','--timeout','45'],join(dir,`${index}-web.txt`),
    (items,at,path)=>webObservation(items,webQuery,at,path));
   if(i.stopped)break;
   const patch={listingCheck,competition:{youtubeShorts,webReferences}};
   let error=null;
   try{await this.persist(job,candidate,patch);}catch(failure){error=boundedText(failure.message,1000);}
   const states=[listingCheck.status,youtubeShorts.status,webReferences.status];
   const status=error?'failed':states.every(s=>s==='ok')?'ok':states.includes('ok')?'partial':states.includes('blocked')?'blocked':states.includes('failed')?'failed':'unavailable';
   results.push({candidateId:candidate.id,status,error,...patch});
   i.update({...i.job(job.id),result:{candidates:results},completed:results.length});this.changed();
  }
  return {result:{candidates:results},completed:results.length};
 }
 requireReady(){
  const health=this.integrations.store.get('integration-health',null)?.reach;
  if(health?.ready===false)throw Object.assign(Error(health.error||'Agent Reach chưa sẵn sàng; bấm Kiểm tra công cụ trước.'),{unavailable:true});
 }
 async search(args,rawPath,observation){
  const observedAt=new Date().toISOString();
  try{
   this.requireReady();
   const response=await this.integrations.reach(args,{timeout:45000});
   await writeFile(rawPath,boundedText(JSON.stringify(response,null,2)),'utf8');
   return observation(response.items,observedAt,rawPath);
  }catch(error){
   await writeFile(rawPath,boundedText(error.message),'utf8');
   return {...observation([],observedAt,rawPath),status:failedStatus(error),error:boundedText(error.message,1000)};
  }
 }
}
