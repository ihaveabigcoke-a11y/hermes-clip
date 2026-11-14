// Encoding is speculative; library records and the final render plan remain the
// authority. A cached render is usable only when every byte/cut/overlay matches.
export const compositionSignature = input => JSON.stringify({ratio:input.ratio,
  clips:input.clips.map(c=>({sha256:c.sha256,duration:c.duration,inSec:c.inSec??0,outSec:c.outSec??c.duration})),overlays:input.overlays});

export class EarlyVideoRender {
  constructor({records,readAsset,readOutput,compose,onTiming=()=>{}}){Object.assign(this,{records,readAsset,readOutput,compose,onTiming});this.scopes=new Map();this.tasks=new Map();this.preparing=new Map();this.encoding=0;this.encodeQueue=[];}
  async arm(projectId){
    const records=await this.records(),project=records.find(r=>r.kind==='production'&&r.id===projectId);
    const product=records.find(r=>r.kind==='product'&&r.id===project?.data.productId);
    if(!project||!product||product.data.archived||product.revision!==project.data.productRevision)throw Error('Hồ sơ đã đổi trước khi chuẩn bị dựng.');
    this.scopes.set(projectId,{productRevision:product.revision,scenes:Object.fromEntries(project.data.scenes.map(s=>[s.id,s.revision]))});
    return true;
  }
  start(job,readOutput){
    const key=job.request.projectId+'/'+job.request.sceneId;
    if(this.preparing.has(key))return this.preparing.get(key);
    const pending=this.prepare(job,readOutput);this.preparing.set(key,pending);
    return pending.finally(()=>this.preparing.delete(key));
  }
  async prepared(input){await this.preparing.get(input.projectId+'/auto_'+input.variantId.split('_v').at(-1));}
  discard(projectId){this.scopes.delete(projectId);for(const key of this.tasks.keys())if(key.startsWith(projectId+'/'))this.tasks.delete(key);}
  async prepare(job,readOutput){
    const scope=this.scopes.get(job.request.projectId),index=Number(/^auto_([0-2])$/.exec(job.request.sceneId)?.[1]);
    if(!scope||!Number.isInteger(index)||job.state!=='ready'||!job.output||job.request.productRevision!==scope.productRevision||job.request.sceneRevision!==scope.scenes[job.request.sceneId])return;
    const records=await this.records(),project=records.find(r=>r.id===job.request.projectId&&r.kind==='production'),p=project?.data;
    const product=records.find(r=>r.id===p?.productId&&r.kind==='product'),hook=p?.scenes.find(s=>s.id===job.request.sceneId);
    if(!p||p.paused||!product||product.data.archived||product.revision!==scope.productRevision||p.productRevision!==scope.productRevision||hook?.revision!==job.request.sceneRevision||!hook.storyboardApproved)return;
    const reuse=p.reuseBodyPlan;
    const body=reuse?.segments.slice(1)??['auto_3','auto_4'].map((id,i)=>{
      const scene=p.scenes.find(s=>s.id===id),take=[...(scene?.takes??[])].reverse().find(t=>t.sceneRevision===scene.revision&&t.review!=='rejected');
      return take?{sceneId:id,takeId:take.id,assetId:take.assetId,sha256:take.sha256,inSec:0,outSec:[4,7][i]}:null;
    });
    if(body.some(s=>!s))return;
    const hookDuration=reuse?reuse.segments[0].outSec-reuse.segments[0].inSec:4;
    if(hookDuration>8||hookDuration>job.output.metadata.duration)return;
    const clips=[{...await (readOutput?readOutput():this.readOutput(job.id)),duration:job.output.metadata.duration,inSec:0,outSec:hookDuration}];
    for(const segment of body){
      const scene=p.scenes.find(s=>s.id===segment.sceneId),take=scene?.takes.find(t=>t.id===segment.takeId);
      const asset=records.find(r=>r.id===segment.assetId&&r.kind==='asset');
      if(!take||take.review==='rejected'||take.sceneRevision!==scene.revision||!asset||asset.data.sha256!==segment.sha256)return;
      clips.push({bytes:await this.readAsset(asset.id),sha256:segment.sha256,duration:asset.data.metadata.duration,inSec:segment.inSec,outSec:segment.outSec});
    }
    const overlays=reuse?structuredClone(reuse.overlays):[{text:'Vs…',fromSec:4,toSec:8,role:'label',style:'white-outline-top'},{text:`Comment ${product.data.ctaKeyword||'HELP'}`,fromSec:12,toSec:15,role:'cta',style:'white-outline-top'}];
    const input={planVersion:1,projectId:project.id,variantId:project.id+'_v'+index,ratio:'9:16',clips,overlays};
    const signature=compositionSignature(input),key=input.projectId+'/'+input.variantId;
    if(this.tasks.get(key)?.signature===signature)return;
    const promise=this.encode(input,job,scope);
    // Handle failure immediately even if the flow never reaches this variant.
    promise.catch(()=>{});this.tasks.set(key,{signature,promise});
    return;
  }
  async encode(input,job,scope){
    if(this.encoding>=3)await new Promise(resolve=>this.encodeQueue.push(resolve));else this.encoding++;
    try{
      if(this.scopes.get(job.request.projectId)!==scope)throw Error('Gói đã dừng hoặc phạm vi dựng đã đổi.');
      this.onTiming(job.id,'earlyRenderStartedAt');
      const result=await this.compose(input);this.onTiming(job.id,'earlyRenderFinishedAt');return result;
    }finally{const next=this.encodeQueue.shift();if(next)next();else this.encoding--;}
  }
  get(input){const task=this.tasks.get(input.projectId+'/'+input.variantId);return task?.signature===compositionSignature(input)?task.promise:null;}
}
