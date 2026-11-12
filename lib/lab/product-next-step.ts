import { productFinancials, type LabRecord } from "./domain.ts";
import { candidateCurrencySchema } from "./operations.ts";
import { productionSchema } from "./production.ts";
import { workflowGuidance } from "./workflow-guidance.ts";
import { sampleCheckWarning } from "./sample-check.ts";
import {contentReadiness} from './product-profile.ts';
import {selectionEntries} from './daily-selection.ts';
import {getRenderPlan,renderDuration} from './render-plan.ts';
import {comparisonDrift} from './hook-matrix.ts';

export type ProductNextStep = {
  stage: string;
  title: string;
  detail: string;
  actionView: "products" | "production" | "social";
};

export function latestProductProduction(product: LabRecord, records: readonly LabRecord[]) {
  return records.filter(r => r.kind === "production" && r.data.productId === product.id && !r.data.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
}

/** Advice from saved evidence only; never authorizes publication or payment. */
export function productNextStep(product: LabRecord, records: readonly LabRecord[]): ProductNextStep {
  const next = (stage: string, title: string, detail: string, actionView: ProductNextStep["actionView"]): ProductNextStep => ({stage, title, detail, actionView});
  const p = productFinancials(product.data);
  const missing = (["cost", "shipping"] as const).filter(key => typeof p[key] !== "number" || !Number.isFinite(p[key]) || p[key] < 0);
  const costCurrency = p.costCurrency ?? p.currency;
  const shippingCurrency = p.shippingCurrency ?? p.currency;
  const currenciesKnown = candidateCurrencySchema.safeParse(costCurrency).success && candidateCurrencySchema.safeParse(shippingCurrency).success;
  if (missing.length || !currenciesKnown || costCurrency !== shippingCurrency) {
    const reasons: string[] = missing.map(key => key === "cost" ? "thiếu giá vốn" : "thiếu phí ship tới Mỹ");
    if (!currenciesKnown) reasons.push("chưa rõ tiền tệ của giá vốn/ship");
    else if (costCurrency !== shippingCurrency) reasons.push(`giá vốn (${costCurrency}) và ship (${shippingCurrency}) khác tiền tệ`);
    return next("supplier", "Hỏi giá nhà cung cấp", `${reasons.join("; ")}. Bổ sung báo giá cùng tiền tệ cho đúng SKU; không tự quy đổi.`, "products");
  }
  const sampleWarning = sampleCheckWarning(p);
  if (sampleWarning) return next("sample", "Kiểm mẫu thật", sampleWarning, "products");

  const production = latestProductProduction(product, records);
  if (!production) return next("production", "Tạo kịch bản theo công thức", "Chưa có dự án sản xuất cho sản phẩm. Tạo dự án, rồi chọn Mẫu prompt để soạn kịch bản nháp theo công thức.", "production");
  const parsed = productionSchema.safeParse(production.data);
  if (!parsed.success) return next("scenes", "Kiểm tra dữ liệu dự án", "Dự án mới nhất thiếu hoặc sai dữ liệu cảnh/phiên bản. Mở dự án để kiểm tra; chưa đủ dữ liệu để hướng dẫn đăng.", "production");
  const guidance = workflowGuidance(parsed.data, product.revision);
  if (guidance.approved < guidance.total || ["references", "queue", "scenes", "library", "desktop"].includes(guidance.stage) || guidance.takeSelection)
    return next(guidance.stage, guidance.title, guidance.detail, "production");

  const related = records.filter(r => r.data.productId === product.id && !r.data.archived);
  if (!related.some(r => r.kind === "social_account" && typeof r.data.handle === "string" && r.data.handle.trim()))
    return next("account", "Gắn tài khoản", "Chưa có tài khoản Instagram đang dùng với username gắn sản phẩm. Bổ sung trong Instagram; hồ sơ đã lưu chưa chứng minh đăng nhập hay quyền đăng.", "social");
  const published = related.filter(r => r.kind === "content_plan" && ["published", "published_manual", "published_browser"].includes(r.data.status));
  if (!published.length) return next("publish", "Đăng bài đã duyệt", "Chưa ghi nhận bài đã đăng cho sản phẩm. Kiểm tra video, caption và quyền đăng trên đúng tài khoản trước khi gửi.", "social");
  const hasMetrics = records.some(r => r.kind === "social_metric" && published.some(plan => plan.id === r.data.planId));
  return next("metrics", "Đọc số liệu / so hook", hasMetrics
    ? "Đã có bài đăng và bản đo đã lưu. So hook trong cùng tài khoản, từ khóa CTA và kỳ đo; chỉ số chưa biết vẫn để trống."
    : "Đã ghi nhận bài đăng nhưng chưa có bản đo. Đọc số liệu có nguồn và kỳ đo trước khi so hook.", "social");
}

export type JourneyStep={step:number;stage:string;title:string;detail:string;href:string};
export type JourneyMedia={scenes:{projectId:string;sceneId:string;state:string}[]}|null;
/** Current ten-step workflow. The earlier evidence helper remains available to older callers. */
export function productJourneyStep(product:LabRecord,records:readonly LabRecord[],manual:JourneyMedia=null,jobs:readonly {state:string;request:{projectId:string;sceneId:string;sceneRevision:number}}[]=[]):JourneyStep {
  const url=(view:string,params:Record<string,string>={})=>'?'+new URLSearchParams({view,product:product.id,...params});
  const next=(step:number,stage:string,title:string,detail:string,href:string):JourneyStep=>({step,stage,title,detail,href});
  const selection=selectionEntries([...records]).filter(s=>s.productId===product.id).at(-1);
  if(!product.data.productKey||!selection?.rank)return next(1,'identity','Gán mã và tự xếp hạng','Tự nhập mã sản phẩm và chọn hạng 1–3 trong đợt nghiên cứu.',url('research',{ops_id:selection?.batchId??product.data.researchOrigin?.batchId??''}));
  const missing=contentReadiness(product.data).filter(r=>!r.ready);
  if(missing.length)return next(2,'content','Bổ sung đầu vào Khung content',missing.map(r=>r.label).join(' · '),url('products',{product_tab:'content'}));
  const project=latestProductProduction(product,records),parsed=project?productionSchema.safeParse(project.data):null;
  const studio=(stage='scenes',view='production')=>project?url(view,{production:project.id,stage}):url('content',{new_product:product.id});
  if(!project||!parsed?.success||!parsed.data.scenes.length||parsed.data.productRevision!==product.revision)return next(3,'prompt','Chuẩn bị gói lượt tạo','Mở Khung content, đồng bộ hồ sơ, duyệt cảnh và tạo bằng Muse; khi tạm dừng, xuất gói prompt manual.',studio('scenes','content'));
  const p=parsed.data;
  const videos=p.scenes.filter(s=>s.mediaType!=='image');
  const clips=videos.length>0&&videos.every(s=>s.takes.some(t=>t.sceneRevision===s.revision&&t.type==='video/mp4'));
  const sent=videos.length>0&&videos.every(s=>s.takes.some(t=>t.sceneRevision===s.revision)||s.attempts.some(a=>a.sceneRevision===s.revision&&a.status!=='cancelled')||jobs.some(j=>j.request.projectId===project.id&&j.request.sceneId===s.id&&j.request.sceneRevision===s.revision&&j.state!=='cancelled')||manual?.scenes.some(m=>m.projectId===project.id&&m.sceneId===s.id&&['Đã xuất','Chờ file','Đã nhận'].includes(m.state)));
  if(!sent&&!clips)return next(3,'prompt','Xuất gói prompt hoặc tạo bằng Muse','Chưa có đủ gói prompt hiện hành hay lượt tạo đã gửi cho các cảnh.',studio());
  if(!clips)return next(4,'clips','Chờ clip trong Hộp nhận','Kiểm lượt đang chờ; thả MP4 tải về vào Hộp nhận hoặc gắn file chưa khớp cảnh.',studio());
  const plans=(p.renderPlans??[]).filter(plan=>{try{return plan.productionId===project.id&&JSON.stringify(getRenderPlan(p,project.id,plan.variantId))===JSON.stringify(plan);}catch{return false;}});
  if(!plans.length)return next(5,'segments','Chọn đoạn dùng được','Duyệt take, khóa thân video, rồi lưu in/out. Mốc shot dự kiến được giữ nguyên.',studio('variants'));
  const renders=p.exports.filter(e=>{
    const plan=plans.find(plan=>plan.variantId===e.variantId),asset=records.find(r=>r.kind==='asset'&&r.id===e.assetId),m=asset?.data.metadata;
    return e.kind==='render'&&e.verified&&e.sha256&&asset?.data.sha256===e.sha256&&asset.data.type==='video/mp4'&&m?.verifiedBy==='container'&&m.width===720&&m.height===1280&&typeof m.duration==='number'&&plan&&Math.abs(m.duration-renderDuration(plan))<=.1&&JSON.stringify(e.renderPlan)===JSON.stringify(plan);
  });
  if(!renders.length)return next(6,'render','Xuất MP4 đã kiểm','Xuất theo đoạn và chữ; chỉ tính bản có hash, tài sản và thông số file khớp kế hoạch hiện tại.',studio('variants'));
  const all=records.filter(r=>r.kind==='content_plan'&&!r.data.archived&&r.data.productId===product.id&&r.data.productionId===project.id&&r.data.comparison);
  const groups=[...new Set(all.map(r=>r.data.comparison.groupId))];
  const complete=groups.map(group=>all.filter(r=>r.data.comparison.groupId===group)).filter(rows=>{
    const source=rows[0].data.comparison.sourceGroupId,variants=p.variants.filter(v=>v.comparisonGroupId===source);
    if(variants.length!==3||rows.some(r=>comparisonDrift(r).length||!variants.some(v=>v.id===r.data.variantId)||!renders.some(e=>e.variantId===r.data.variantId&&e.assetId===r.data.assetId)))return false;
    return [...new Set(rows.map(r=>r.data.accountId))].every(a=>variants.every(v=>rows.some(r=>r.data.accountId===a&&r.data.variantId===v.id)));
  }).sort((a,b)=>Math.max(...b.map(r=>r.createdAt??r.updatedAt))-Math.max(...a.map(r=>r.createdAt??r.updatedAt)))[0];
  if(!complete)return next(7,'drafts','Tạo 3 bài nháp','Xuất ba hook dùng chung thân, giữ CTA/giá/landing rồi tạo nháp theo tài khoản đã chọn.',studio('variants'));
  const social=url('social',{ops_id:product.id,ig_tab:'content'});
  if(complete.some(r=>!['published_manual','published_browser'].includes(r.data.status)||!r.data.postUrl))return next(8,'publish','Chờ đăng bài đã duyệt','Ba hook đã có nháp. Duyệt nội dung, tài khoản, quyền đăng rồi đăng tay và ghi URL.',social);
  const measured=complete.every(plan=>records.some(r=>r.kind==='social_metric'&&r.data.planId===plan.id&&Number.isFinite(Date.parse(r.data.observedAt))&&r.data.sourceUrl===plan.data.postUrl&&['views','keywordComments','utmClicks','orders'].some(k=>typeof r.data[k]==='number')));
  if(!measured)return next(9,'metrics','Nhập số liệu cho lượt so sánh','Cần bản đo có nguồn và thời điểm cho từng bài. Ô trống giữ Chưa biết.',url('results'));
  const decisions=records.filter(r=>r.kind==='product_decision'&&r.data.productId===product.id);
  return next(10,'decision',decisions.length?'Xem và cập nhật quyết định':'Chờ quyết định',decisions.length?'Đã có lịch sử quyết định. Đọc số mới và lưu lý do nếu đổi hướng.':'So ba hook và tự chọn đẩy, sửa hoặc bỏ. Chưa đặt ngưỡng thì app không tự kết luận.',url('experiments'));
}
