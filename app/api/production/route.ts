import {resolveProvider, mediaProviderReceipts} from '@/desktop/src/provider-routing.mjs';
import { z } from "zod";
import { env } from "cloudflare:workers";
import { owner, body, getRecord, save, getSettings, ApiError, failure } from "@/lib/lab/server";
import { applyProduction, newProduction, productionSchema, providerAdapter, variantItems, ProductionError, creativeDrafts } from "@/lib/lab/production";
import { validationMessage } from "@/lib/lab/domain";

export async function POST(request: Request) {
  try {
    const uid=await owner(request),b=await body(request);
    const envelope=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),revision:z.number().int().nonnegative(),commandId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),action:z.string().max(50),input:z.record(z.unknown())}).parse(b);
    if(envelope.action==='media_provider'&&envelope.input.provider==='muse'&&(env as any).MUSE_PAUSED!==false)throw new ApiError(422,'Muse đang tạm dừng');
    const old=await getRecord(uid,envelope.id);
    if(["prepare","retry"].includes(envelope.action)&&(await getSettings(uid)).paused)throw new ApiError(422,"Lab đang tạm dừng giao việc.");
    if(old&&old.kind!=="production")throw new ApiError(409,"ID đã dùng cho dữ liệu khác.");
    if(old?.data.receipts.includes(envelope.commandId))return Response.json({record:old,deduplicated:true});
    if((old?.revision??0)!==envelope.revision)throw new ApiError(409,"Dự án đã thay đổi. Tải lại trước khi lưu; bản nháp vẫn được giữ.");
    if(envelope.action==='manual_result'&&old){
      const scene=old.data.scenes.find((row:any)=>row.id===envelope.input.sceneId),status=(env as any).MUSE_STATUS;
      if(scene){const routing=resolveProvider({kind:'media',status,selection:scene.mediaProvider??old.data.mediaProvider,
        previous:mediaProviderReceipts({jobs:status?.jobs??[],scene,projectId:old.id})});
        if(routing.blocked||routing.provider!=='manual')throw new ApiError(422,routing.reason||'Cảnh chưa chọn nhà cung cấp manual.');}
    }
    if(envelope.action==='skip_reconciliation'&&old){
      const scene=old.data.scenes.find((row:any)=>row.id===envelope.input.sceneId),status=(env as any).MUSE_STATUS;
      if(scene){const receipts=mediaProviderReceipts({jobs:status?.jobs??[],scene,projectId:old.id}).filter(row=>!row.reconciled);
        const uncertain=receipts.filter(row=>['unknown','needs_attention'].includes(row.state));
        // An in-flight Muse job may still deliver; never let the user skip past it.
        if(resolveProvider({kind:'media',selection:'manual',previous:receipts.filter(row=>!uncertain.includes(row))}).reason)throw new ApiError(422,'Tác vụ Muse của cảnh đang chạy. Chờ xong rồi mới bỏ qua đối soát.');
        if(!uncertain.length)throw new ApiError(422,'Cảnh không có kết quả Muse chưa rõ.');}
    }
    let p;
    if(envelope.action==="create") {
      if(old)throw new ApiError(409,"Dự án đã tồn tại.");
      const d=z.object({name:z.string().trim().min(1).max(150),productId:z.string(),locale:z.string().trim().min(2).max(40),creativeId:z.string().max(120).default(""),contentPlanId:z.string().max(120).optional(),contentPlanRevision:z.number().int().positive().optional()}).parse(envelope.input);
      const product=await getRecord(uid,d.productId);
      if(!product||product.kind!=="product"||product.data.archived)throw new ApiError(422,"Chọn sản phẩm hiện hành trong workspace.");
      const c=d.creativeId?await getRecord(uid,d.creativeId):null;
      if(d.creativeId&&(!c||c.kind!=="creative"||c.data.productId!==product.id))throw new ApiError(422,"Concept không thuộc sản phẩm.");
      p=newProduction(d.name,d.productId,product.revision,d.locale,d.creativeId);p.receipts.push(envelope.commandId);
      p.events.push({id:envelope.commandId,at:Date.now(),action:"create",detail:d.name});
      if(c)p=applyProduction(p,"import",{rows:creativeDrafts(c.data,envelope.commandId)},envelope.commandId+"_draft",Date.now(),product.revision);
      if (d.contentPlanId) {
        if (d.creativeId) throw new ApiError(422, "Chọn một nguồn kịch bản cho dự án.");
        const plan = await getRecord(uid, d.contentPlanId);
        if (plan?.kind !== "content_plan" || plan.data.productId !== product.id)
          throw new ApiError(422, "Kế hoạch nội dung không thuộc sản phẩm.");
        if (plan.revision !== d.contentPlanRevision)
          throw new ApiError(409, "Kế hoạch nội dung đã thay đổi. Tải lại trước khi tạo dự án.");
        const script = [plan.data.hook, plan.data.script].filter(Boolean).join("\n");
        if (!script.trim()) throw new ApiError(422, "Điền hook hoặc kịch bản trước khi tạo dự án.");
        if (script.split("\n").filter(line => line.trim()).length > 30)
          throw new ApiError(422, "Tối đa 30 dòng cảnh trong một dự án. Chia kịch bản thành phần nhỏ hơn.");
        p.contentPlanId = plan.id;
        p.contentPlanRevision = plan.revision;
        p = applyProduction(p, "import", {rows: creativeDrafts({name: plan.data.name, script}, envelope.commandId)}, envelope.commandId+"_draft", Date.now(), product.revision);
      }
    } else {
      if(!old)throw new ApiError(404,"Không tìm thấy dự án sản xuất.");
      p=productionSchema.parse(old.data);
      const product=await getRecord(uid,p.productId);
      if(!product||product.kind!=="product"||product.data.archived)throw new ApiError(422,"Sản phẩm không tồn tại hoặc đang lưu trữ. Khôi phục sản phẩm trước khi sửa dự án.");
      let input:any=envelope.input;
      if(envelope.action==="reference"||envelope.action==="attach"||(envelope.action==="worker_result"||envelope.action==="manual_result")||(envelope.action==="export"&&input.assetId)) {
        const a=typeof input.assetId==="string"?await getRecord(uid,input.assetId):null;
        if(!a||a.kind!=="asset")throw new ApiError(422,"Chọn file đã tải trong workspace này.");
        if(envelope.action==="reference"&&!a.data.metadata)throw new ApiError(422,"Reference chưa đọc được kích thước. Dùng JPG/PNG/WebP hoặc MP4 đã kiểm tra.");
        if(envelope.action==="attach"||(envelope.action==="worker_result"||envelope.action==="manual_result")) {
          if(!a.data.metadata||!a.data.sha256)throw new ApiError(422,"File cũ chưa có metadata/hash. Tải lại file để kiểm tra trước khi gắn take.");
          input={sceneId:input.sceneId,attemptId:input.attemptId??null,sceneRevision:input.sceneRevision,productRevision:input.productRevision,jobId:input.jobId,providerId:input.providerId,take:{assetId:a.id,name:a.data.name,type:a.data.type,size:a.data.size,sha256:a.data.sha256,metadata:a.data.metadata}};
        }
        if(envelope.action==="export") {
          const items=variantItems(p,input.variantId),duration=items.reduce((n,i)=>n+(i.take.metadata.duration??0),0),m=a.data.metadata;
          if(input.kind!=="render"||!m||!a.data.type.startsWith("video/")||Math.abs(m.duration-duration)>0.5)throw new ApiError(422,"File render cần video có metadata và thời lượng khớp timeline (±0,5s).");
          const [w,h]=items[0].scene.ratio.split(":").map(Number);if(Math.abs((m.width/m.height)/(w/h)-1)>0.01)throw new ApiError(422,"File render sai tỷ lệ timeline.");
        }
      }
      if(envelope.action==="export"&&input.kind==="render"&&!input.assetId)throw new ApiError(422,"Chọn file MP4 đã render thật.");
      p=applyProduction(p,envelope.action,input,envelope.commandId,Date.now(),product.revision);
    }
    const record=await save(uid,envelope.id,"production",p,envelope.revision);
    return Response.json({record,adapter:providerAdapter},{headers:{"Cache-Control":"no-store"}});
  } catch(e) {
    if(e instanceof z.ZodError)return failure(new ApiError(422,e.issues.map(validationMessage).join(" ")));
    if(e instanceof ProductionError)return failure(new ApiError(422,e.message));
    return failure(e);
  }
}
