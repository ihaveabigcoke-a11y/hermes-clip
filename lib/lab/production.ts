import { z } from "zod";
import {renderPlanSchema,validateRenderPlan,getRenderPlan} from "./render-plan.ts";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const text = (n = 1000) => z.string().trim().max(n).default("");
export const ratios = ["9:16", "16:9", "1:1", "4:3", "3:4"] as const;
export const roles = ["product", "person", "style", "background", "logo", "voice", "first_frame", "last_frame"] as const;
export const referenceRoleLabels = {product: 'Sản phẩm', person: 'Người mẫu', style: 'Phong cách', background: 'Bối cảnh', logo: 'Logo', voice: 'Giọng nói', first_frame: 'Ảnh đầu', last_frame: 'Ảnh cuối'};
export const metadataSchema = z.object({
  width: z.number().int().positive().max(32768), height: z.number().int().positive().max(32768),
  duration: z.number().positive().max(7200).nullable(),
  verifiedBy: z.enum(["container", "browser"]),
});
const referenceSchema = z.object({
  id, version: z.number().int().positive(), name: z.string().trim().min(1).max(150),
  role: z.enum(roles), assetId: id, sourceUrl: text(2048).refine(v => !v || /^https:\/\//i.test(v), "Nguồn cần link HTTPS."),
  notes: text(2000), createdAt: z.number(),
});
const pinSchema = z.object({ id, version: z.number().int().positive() });
export const overlayTextSchema = z.string().trim().max(60, "Chữ trên màn hình tối đa 60 ký tự.").refine(value => !/[\r\n]/.test(value), "Chữ trên màn hình chỉ một dòng.").nullable().optional();
export const ctaKeywordSchema = z.string().trim().regex(/^[A-Z]{1,20}$/, "Từ khóa cần một từ tiếng Anh in hoa, tối đa 20 chữ cái.");
export const timedOverlaySchema = z.object({
  text: z.string().trim().min(1).max(120), emoji: z.string().max(24),
  fromSec: z.number().nonnegative(), toSec: z.number().positive(),
  position: z.literal('top-center'), lines: z.union([z.literal(1),z.literal(2)]),
}).refine(o=>o.toSec>o.fromSec && o.text.split('\n').length<=o.lines,'Mốc chữ đè hoặc số dòng không hợp lệ.');
export const packagingSchema = z.object({brandName:z.string().trim().min(1,'Chưa đặt tên bao bì.').max(80),boxText:z.string().trim().min(1,'Điền chữ trên hộp.').max(160)});
export const storyboardV2Fields = {
  sourceReference:z.object({jobId:id,shotId:z.string().regex(/^shot_\d{3,5}$/),prompt:z.string().max(6000),
    firstFrame:z.string().regex(/^shots\/shot_\d{3,5}_first\.jpg$/).nullable(),lastFrame:z.string().regex(/^shots\/shot_\d{3,5}_last\.jpg$/).nullable()}).optional(),
  storyboardVersion:z.literal(2).optional(),
  beatId:id.optional(), beatKind:z.enum(['problem','versus_unbox','result']).optional(),
  phase:z.enum(['hook','unbox','result','feature_tour']).optional(),
  fromSec:z.number().nonnegative().optional(), toSec:z.number().positive().optional(),
  subjects:text(1000).optional(), setting:text(1000).optional(),
  constraints:z.array(z.string().trim().min(1).max(1000).refine(v=>!/[\r\n]/.test(v))).max(3).optional(),
  overlay:timedOverlaySchema.optional(), ctaOverlay:timedOverlaySchema.optional(),
  ctaPlacement:z.enum(['overlay','caption']).optional(), ctaKeyword:ctaKeywordSchema.optional(),
  situation:z.string().trim().min(1,'Điền tình huống mở đầu.').max(1000).optional(),
  packaging:packagingSchema.optional(),
  resultStyle:z.enum(['spectacle','subject_after','feature_tour','story_cards']).optional(),
  metadata:z.object({dramatization:z.literal(true).optional()}).optional(),
  generationUnit:z.object({id,fromSec:z.number().nonnegative(),toSec:z.number().positive(),duration:z.literal(8)}).optional(),
};
export function storyboardMetadata(s: Partial<Scene>) {
  return Object.fromEntries(Object.keys(storyboardV2Fields).filter(key=>s[key as keyof Scene]!==undefined).map(key=>[key,s[key as keyof Scene]]));
}
const ctaFields = {ctaKeyword: ctaKeywordSchema.nullable().optional(), ctaText: text(200).nullable().optional()};
const attemptSchema = z.object({
  provider: z.enum(['muse','manual']).optional(),
  id, requestId: id, sceneRevision: z.number().int().positive(),
  status: z.enum(["awaiting_provider", "cancelled", "manual_complete", "local_complete", "unknown"]),
  snapshot: z.string().max(20000), providerJobId: text(200),
  usageUsd: z.number().nonnegative().nullable(), createdAt: z.number(),
});
export const compressionSchema = z.object({version:z.literal(1),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),sourceSize:z.number().int().positive(),size:z.number().int().positive(),mode:z.enum(['encoded','remux','original']),overLimit:z.boolean(),maxBytes:z.number().int().positive().max(6*1024**2)});
const takeSchema = z.object({
  compression: compressionSchema.optional(),
  provider: z.enum(['muse','manual']).optional(),
  id, attemptId: id.nullable(), assetId: id, name: text(150), type: text(80),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive(),
  snapshot: z.string().max(20000).optional(),
  metadata: metadataSchema, sceneRevision: z.number().int().positive(),
  review: z.enum(["pending", "approved", "rejected"]), notes: text(2000), createdAt: z.number(),
});
export const sceneInputSchema = z.object({
  ...storyboardV2Fields,
  name: z.string().trim().min(1, "Đặt tên cảnh.").max(150),
  role: z.enum(["hook", "body", "cta"]).default("body"),
  mediaType: z.enum(["image", "video"]).default("video"),
  prompt: z.string().trim().min(1, "Điền prompt.").max(10000),
  overlayText: overlayTextSchema,
  action: text(1000), camera: text(1000), voice: text(2000),
  ratio: z.enum(ratios).default("9:16"), duration: z.number().min(1).max(120).default(5),
  referenceIds: z.array(id).max(12).default([]),
});
export const mediaProviderSchema = z.enum(["manual", "muse", "grok-cli", "fal"]);
const sceneSchema = sceneInputSchema.omit({ referenceIds: true }).extend({
  mediaProvider: mediaProviderSchema.optional(),
  // User chose "skip reconciliation": Muse receipts created at or before this time stop blocking manual.
  museReconciledAt: z.number().int().nonnegative().optional(),
  id, revision: z.number().int().positive(), references: z.array(pinSchema).max(12),
  storyboardApproved: z.boolean(), attempts: z.array(attemptSchema).max(50), takes: z.array(takeSchema).max(50),
});
const approvedItemSchema = z.object({ sceneId: id, takeId: id });
// A formula draft pins scenes first. Null never resolves to an arbitrary take.
const itemSchema = approvedItemSchema.extend({takeId: id.nullable()});
const bodySchema = z.object({ id, name: text(150), items: z.array(itemSchema).min(1).max(30), createdAt: z.number() });
const variantSchema = z.object({
  id, name: z.string().trim().min(1).max(150), bodyId: id, hook: itemSchema.nullable(), cta: itemSchema.nullable(),
  locale: z.string().trim().min(2).max(40), caption: text(3000), createdAt: z.number(),
  ...ctaFields,
  ctaPlacement:z.enum(['overlay','caption']).optional(),
  comparisonGroupId:id.optional(),
  formulaId: id.optional(), formulaVersion: z.number().int().positive().optional(),
});
export const formulaDraftInputSchema = z.object({
  storyboardVersion:z.literal(2).optional(),
  ctaPlacement:z.enum(['overlay','caption']).optional(),
  situation:z.string().trim().min(1,'Điền tình huống mở đầu.').max(1000).optional(),
  packaging:packagingSchema.optional(),
  name: z.string().trim().min(1).max(150), formulaId: id, formulaVersion: z.number().int().positive(),
  rows: z.array(sceneInputSchema).min(2).max(18), alternateHook: sceneInputSchema,
  ctaKeyword: ctaKeywordSchema, ctaText: z.string().trim().min(1).max(200),
}).superRefine((draft, ctx) => {
  const rows = draft.rows, hook = rows[0], alternate = draft.alternateHook;
  const total = rows.reduce((sum, row) => sum + row.duration, 0);
  if(draft.storyboardVersion===2) {
    const fail=(message:string)=>ctx.addIssue({code:'custom',message});
    if(!draft.situation)fail('Điền tình huống mở đầu.');
    if(!draft.packaging?.brandName)fail('Chưa đặt tên bao bì.');
    if(!draft.ctaPlacement)fail('Chọn vị trí CTA.');
    if(rows.length<8||rows.some(row=>row.duration<1||row.duration>2.5||row.role==='cta'))fail('Bản v2 cần ít nhất 8 shot, mỗi shot 1–2,5 giây; CTA đè cảnh.');
    let cursor=0;
    for(const row of [...rows,alternate]) {
      if(row===alternate)cursor=0;
      if(row.storyboardVersion!==2||Math.abs((row.fromSec??-1)-cursor)>0.001||Math.abs((row.toSec??-1)-cursor-row.duration)>0.001)fail('Mốc shot phải nối tiếp nhau.');
      const gate=storyboardShotGate(row);if(gate)fail(gate);
      if(row.situation!==draft.situation||JSON.stringify(row.packaging)!==JSON.stringify(draft.packaging)||row.ctaKeyword!==draft.ctaKeyword||row.ctaPlacement!==draft.ctaPlacement)fail('Thông tin shot không khớp bản nháp.');
      cursor+=row.duration;
    }
    const result=rows.filter(row=>row.phase==='result'),features=rows.filter(row=>row.phase==='feature_tour');
    if(features.length ? features.length<6||features.length>8||result.length>0 : result.length<3)fail('Cần ít nhất 3 shot kết quả hoặc 6–8 shot tính năng.');
    const payoff=features.length?features:result;
    const ctas=rows.filter(row=>row.ctaOverlay);
    if(draft.ctaPlacement==='caption'&&ctas.length)fail('CTA caption không đè lên shot.');
    if(draft.ctaPlacement==='overlay') {
      const cta=ctas[0]?.ctaOverlay;
      if(!cta||cta.toSec!==total||cta.toSec-cta.fromSec<4||cta.toSec-cta.fromSec>6||cta.fromSec<(payoff[0]?.fromSec??Infinity)||!rows.some(r=>r.fromSec===cta.fromSec))fail('CTA phải nằm trong 4–6 giây cuối phần kết quả hoặc tour tính năng.');
      if(cta?.text!==draft.ctaText||ctas.some(r=>JSON.stringify(r.ctaOverlay)!==JSON.stringify(cta)||!r.overlay?.text.includes(cta!.text))||rows.some(r=>Boolean(r.ctaOverlay)!==Boolean(cta&&r.fromSec!>=cta.fromSec)))fail('Mốc và chữ CTA phải thống nhất trên các shot kết thúc.');
    }
    const beats=new Map<string,typeof rows>();
    for(const row of rows)beats.set(row.beatId!,[...(beats.get(row.beatId!)??[]),row]);
    if([...beats.values()].some(shots=>shots.length>6))fail('Mỗi beat có tối đa 6 shot.');
    const boundaries=new Set([0,...rows.map(r=>r.toSec)]);
    for(const row of rows)if(!boundaries.has(row.overlay?.fromSec)||!boundaries.has(row.overlay?.toSec))fail('Nhãn chữ phải đổi đúng mốc cắt shot.');
    for(const shots of beats.values())if(shots.some((row,i)=>i>0&&row.fromSec!==shots[i-1].toSec))fail('Các shot cùng beat phải liền nhau.');
    const groups=new Map<string,typeof rows>();
    for(const row of rows)if(row.generationUnit)groups.set(row.generationUnit.id,[...(groups.get(row.generationUnit.id)??[]),row]);
    for(const shots of groups.values()) {
      const unit=shots[0].generationUnit!;
      if(unit.fromSec!==shots[0].fromSec||unit.toSec!==shots.at(-1)!.toSec||shots.some((row,i)=>row.setting!==shots[0].setting||row.beatId!==shots[0].beatId||JSON.stringify(row.generationUnit)!==JSON.stringify(unit)||(i>0&&row.fromSec!==shots[i-1].toSec)))fail('Nhóm tạo cần shot liền kề, cùng beat và bối cảnh.');
    }
  }
  if (hook.role !== 'hook' || rows.filter(row => row.role === 'hook').length !== 1 || !rows.some(row => row.role === 'body') ||
      rows.filter(row => row.role === 'cta').length > 1 || rows.some((row, i) => row.role === 'cta' && i !== rows.length - 1))
    ctx.addIssue({code:'custom', message:'Công thức cần một mở đầu, nội dung chính và tối đa một CTA ở cuối.'});
  if (total < 10 - 0.001 || total > 18 + 0.001 || [...rows, alternate].some(row => row.ratio !== '9:16' || row.mediaType !== 'video'))
    ctx.addIssue({code:'custom', message:'Bản công thức cần video 9:16, tổng 10–18 giây.'});
  if (alternate.role !== 'hook' || alternate.duration !== hook.duration || !hook.overlayText || !alternate.overlayText ||
      (alternate.prompt === hook.prompt && alternate.overlayText === hook.overlayText) ||
      JSON.stringify(alternate.referenceIds) !== JSON.stringify(hook.referenceIds))
    ctx.addIssue({code:'custom', message:'Hai mở đầu cần khác nội dung, có chữ gợi ý, cùng thời lượng và tham chiếu.'});
});
export const measurementSchema = z.object({variantId:id,views:z.number().int().nonnegative().max(1e12),clicks:z.number().int().nonnegative().max(1e12),sessions:z.number().int().nonnegative().max(1e10),orders:z.number().int().nonnegative().max(1e10),delivered:z.number().int().nonnegative().max(1e10),returned:z.number().int().nonnegative().max(1e10),netRevenue:z.number().nonnegative().max(1e9),totalCosts:z.number().nonnegative().max(1e9),source:z.string().trim().min(3,"Ghi nguồn số liệu.").max(500),notes:text(2000)}).superRefine((v,c)=>{for(const [a,b] of [["orders","sessions"],["delivered","orders"],["returned","delivered"]] as const)if(v[a]>v[b])c.addIssue({code:"custom",path:[a],message:`${a} không được lớn hơn ${b}.`});});
export const productionSchema = z.object({
  mediaProvider: mediaProviderSchema.optional(),
  schemaVersion: z.literal(1), name: z.string().trim().min(1).max(150), productId: id,
  productRevision: z.number().int().positive(), creativeId: text(120),
  contentPlanId: id.optional(), contentPlanRevision: z.number().int().positive().optional(),
  locale: z.string().trim().min(2).max(40), paused: z.boolean(),
  references: z.array(referenceSchema).max(120), scenes: z.array(sceneSchema).max(30),
  reuseBodyPlan:renderPlanSchema.optional(),refreshSourcePlanId:id.optional(),
  renderPlans:z.array(renderPlanSchema).max(60).optional(),
  bodies: z.array(bodySchema).max(30), variants: z.array(variantSchema).max(60),
  measurements: z.array(measurementSchema.and(z.object({updatedAt:z.number()}))).max(60).default([]),
  exports: z.array(z.object({ id, variantId: id, filename: text(180), assetId: id.nullable(), createdAt: z.number(), renderPlan:renderPlanSchema.optional(), sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(), verified:z.boolean().optional(), kind: z.enum(["package", "render"]) })).max(100),
  receipts: z.array(id).max(500), events: z.array(z.object({ id, at: z.number(), action: text(100), detail: text(1000) })).max(300),
});
export type Production = z.infer<typeof productionSchema>;
export type Scene = Production["scenes"][number];
export type Take = Scene["takes"][number];
export type MediaMetadata = z.infer<typeof metadataSchema>;
export function storyboardShotGate(s: Omit<z.infer<typeof sceneInputSchema>,"referenceIds">) {
  if(s.storyboardVersion!==2)return '';
  if(!s.ctaKeyword)return 'Điền từ khóa CTA.';
  if(!s.situation?.trim())return 'Điền tình huống mở đầu.';
  if(!s.packaging?.brandName?.trim())return 'Chưa đặt tên bao bì.';
  if(!s.packaging.boxText.trim())return 'Điền chữ trên hộp.';
  if(!s.beatId||!s.phase||!s.beatKind||!s.camera||!s.subjects||!s.setting||!s.overlay||!s.generationUnit||!s.constraints||!s.resultStyle||!s.ctaPlacement)return 'Shot v2 thiếu thông tin hình, chữ đè hoặc nhóm tạo.';
  if(s.voice||s.role==='cta'||s.duration<1||s.duration>2.5)return 'Shot v2 cần 1–2,5 giây, không lời thoại và không có cảnh CTA riêng.';
  if(s.fromSec===undefined||s.toSec===undefined||Math.abs(s.toSec-s.fromSec-s.duration)>0.001)return 'Mốc shot không khớp thời lượng.';
  if(s.generationUnit.fromSec>s.fromSec||s.generationUnit.toSec<s.toSec||s.generationUnit.toSec-s.generationUnit.fromSec>8)return 'Shot nằm ngoài nhóm tạo 8 giây.';
  if(s.overlay.fromSec>s.fromSec||s.overlay.toSec<s.toSec)return 'Chữ đè phải bao phủ shot.';
  if(s.resultStyle==='story_cards'&&!s.metadata?.dramatization)return 'Thẻ chuyện cần metadata tình huống hư cấu.';
  if(s.constraints.length>3||s.prompt.split('\n').filter(Boolean).length<1.5*s.constraints.length)return 'Mô tả hình cần ít nhất 60% số dòng; tối đa 3 dòng giới hạn.';
  return '';
}
export class ProductionError extends Error {}
export const providerAdapter = {
  id: "unconfigured", connected: false, state: "awaiting_documentation",
  capabilities: { image: "unknown", video: "unknown", reference: "unknown", firstLast: "unknown", audio: "unknown", cancel: "unknown", usage: "unknown", aspectRatios: "unknown", durationsSeconds: "unknown", models: "unknown" },
  notice: "Chưa nối API. tác vụ được lưu; chưa gửi generation hoặc phát sinh phí công cụ tạo.",
} as const;
export function newProduction(name: string, productId: string, productRevision: number, locale = "en-US", creativeId = ""): Production {
  return productionSchema.parse({ schemaVersion: 1, name, productId, productRevision, creativeId, locale, paused: false, references: [], scenes: [], bodies: [], variants: [], exports: [], receipts: [], events: [] });
}
export function latestReferences(p: Production) {
  return p.references.filter(r => !p.references.some(x => x.id === r.id && x.version > r.version));
}
export function sceneGate(p: Production, s: Scene) {
  const storyboardIssue=storyboardShotGate(s);if(storyboardIssue)return storyboardIssue;
  if (!s.prompt.trim()) return "Cảnh chưa có prompt.";
  for (const pin of s.references) {
    const latest = latestReferences(p).find(r => r.id === pin.id);
    if (!latest || latest.version !== pin.version) return "Tham chiếu đã có phiên bản mới. Lưu lại cảnh để cập nhật thông tin liên kết và duyệt lại.";
  }
  const references = s.references.map(pin => p.references.find(reference => reference.id === pin.id && reference.version === pin.version)!);
  const firstFrames = references.filter(reference => reference.role === 'first_frame');
  const lastFrames = references.filter(reference => reference.role === 'last_frame');
  if (firstFrames.length || lastFrames.length) {
    if (s.mediaType !== 'video') return "Ảnh đầu và cuối dùng cho cảnh video.";
    if (firstFrames.length !== 1 || lastFrames.length !== 1) return 'Chọn đúng một ảnh đầu và một ảnh cuối.';
  }
  return "";
}
export function checkMedia(s: Pick<Scene, "ratio" | "duration" | "mediaType">, t: Pick<Take, "metadata" | "type">) {
  const issues: string[] = [];
  const m = t.metadata;
  const [w,h] = s.ratio.split(":").map(Number);
  if (Math.abs((m.width / m.height) / (w / h) - 1) > 0.01) issues.push(`Tỷ lệ ${m.width}×${m.height} khác ${s.ratio} (sai số tối đa 1%).`);
  if (!t.type.startsWith(s.mediaType + "/")) issues.push("Loại file không khớp cảnh.");
  if (s.mediaType === "video" && (m.duration === null || Math.abs(m.duration - s.duration) > 0.25)) issues.push(`Thời lượng ${m.duration ?? "chưa đo"}s khác ${s.duration}s (sai số tối đa 0,25s).`);
  return issues;
}
export function takeGate(p: Production, s: Scene, t: Take) {
  return sceneGate(p, s) || (!s.storyboardApproved ? "Kịch bản chưa duyệt." : "") ||
    (t.sceneRevision !== s.revision ? "Phiên bản thuộc phiên bản cảnh cũ. Giữ lịch sử; thêm phiên bản cho phiên bản hiện tại." : "") || checkMedia(s, t).join(" ");
}
export function resolveItems(p: Production, items: {sceneId: string;takeId: string|null}[]) {
  // Check the whole timeline first: an earlier stale take must not hide an unselected pin.
  if (items.some(i => i.takeId === null)) throw new ProductionError("Biến thể nháp: Chờ chọn take. Duyệt kịch bản/video rồi chọn phiên bản để ghép.");
  return items.map(i => {
    const s = p.scenes.find(s => s.id === i.sceneId), t = s?.takes.find(t => t.id === i.takeId);
    if (!s || !t || t.review !== "approved") throw new ProductionError("Có cảnh/phiên bản chưa được duyệt.");
    const gate = takeGate(p,s,t); if(gate) throw new ProductionError(gate);
    if (s.mediaType !== "video") throw new ProductionError("Nội dung chính chỉ nhận phiên bản video đã duyệt.");
    return { scene: s, take: t };
  });
}
export function variantItems(p: Production, variantId: string) {
  const v=p.variants.find(x=>x.id===variantId), b=p.bodies.find(x=>x.id===v?.bodyId);
  if(!v||!b)throw new ProductionError("Không tìm thấy biến thể hoặc nội dung chính.");
  return resolveItems(p,[...(v.hook?[v.hook]:[]),...b.items,...(v.cta?[v.cta]:[])]);
}
/** Selection only, never approval: old productions without draft pins have no pending selection. */
export function pendingTakeSelection(p: Pick<Production,'bodies'|'variants'>) {
  const bodyIds=(p.bodies??[]).filter(body=>body.items.some(item=>item.takeId===null)).map(body=>body.id);
  const variantIds=(p.variants??[]).filter(variant=>bodyIds.includes(variant.bodyId)
    ||variant.hook?.takeId===null||variant.cta?.takeId===null).map(variant=>variant.id);
  return bodyIds.length||variantIds.length?{state:'waiting_take' as const,label:'Chờ chọn take',bodyIds,variantIds}:null;
}
const commandSchemas: Record<string, z.ZodTypeAny> = {
  reference: referenceSchema.omit({version:true,createdAt:true}),
  scene: sceneInputSchema.extend({ id }),
  import: z.object({rows:z.array(sceneInputSchema.extend({id})).min(1).max(30)}),
  formula_draft: formulaDraftInputSchema,
  pin_formula: z.object({bodyId:id, items:z.array(approvedItemSchema).min(1).max(30)}),
  storyboard: z.object({sceneId:id}), prepare: z.object({sceneId:id}), retry: z.object({sceneId:id}),
  pause: z.object({paused:z.boolean()}), cancel: z.object({sceneId:id,attemptId:id}),
  attach: z.object({sceneId:id,attemptId:id.nullable(),take:takeSchema.omit({id:true,attemptId:true,sceneRevision:true,review:true,notes:true,createdAt:true})}),
  media_provider: z.object({sceneId:id.optional(),provider:z.union([mediaProviderSchema,z.literal('auto')])}),
  skip_reconciliation: z.object({sceneId:id}),
  manual_result: z.object({sceneId:id,sceneRevision:z.number().int().positive(),take:takeSchema.omit({id:true,attemptId:true,sceneRevision:true,review:true,notes:true,createdAt:true})}),
  worker_result: z.object({sceneId:id,productRevision:z.number().int().positive(),sceneRevision:z.number().int().positive(),jobId:id,providerId:text(200),take:takeSchema.omit({id:true,attemptId:true,sceneRevision:true,review:true,notes:true,createdAt:true})}),
  review: z.object({sceneId:id,takeId:id,review:z.enum(["approved","rejected"]),notes:text(2000)}),
  body: z.object({name:z.string().trim().min(1).max(150),items:z.array(approvedItemSchema).min(1).max(30)}),
  variant: variantSchema.omit({id:true,createdAt:true}).extend({hook:approvedItemSchema.nullable(),cta:approvedItemSchema.nullable()}),
  render_plan:renderPlanSchema,
  hook_variants:z.object({productionId:id,sourceVariantId:id,hooks:z.array(approvedItemSchema).length(3)}),
  export: z.object({renderPlan:renderPlanSchema.optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),verified:z.boolean().optional(),variantId:id,filename:z.string().regex(/^[a-zA-Z0-9_.-]{1,180}$/),assetId:id.nullable(),kind:z.enum(["package","render"])}),
  sync_product: z.object({}),
  measurement: measurementSchema,
};
export function applyProduction(p0: Production, action: string, input: unknown, commandId: string, now = Date.now(), productRevision = p0.productRevision): Production {
  id.parse(commandId);
  if(p0.receipts.includes(commandId))return p0;
  const schema=commandSchemas[action];if(!schema)throw new ProductionError("Thao tác không hỗ trợ.");
  const d=schema.parse(input);
  if(action!=="sync_product" && productRevision!==p0.productRevision)throw new ProductionError("Hồ sơ sản phẩm đã đổi. Đồng bộ phiên bản sản phẩm trước khi tiếp tục.");
  const p=productionSchema.parse(structuredClone(p0));
  const scene=(sid:string)=>{const s=p.scenes.find(s=>s.id===sid);if(!s)throw new ProductionError("Cảnh không tồn tại trong dự án.");return s;};
  const snapshotScene = (s: Scene) => JSON.stringify({
    ...storyboardMetadata(s), productId:p.productId, productRevision:p.productRevision,
    sceneId:s.id, sceneRevision:s.revision, name:s.name, role:s.role,
    prompt:s.prompt, overlayText:s.overlayText, action:s.action, camera:s.camera, voice:s.voice,
    ratio:s.ratio, duration:s.duration, mediaType:s.mediaType,
    references:s.references.map(pin=>({...pin,assetId:p.references.find(r=>r.id===pin.id&&r.version===pin.version)?.assetId})),
  });
  const saveScene=(d:any)=>{
    const refs=d.referenceIds.map((rid:string)=>{const r=latestReferences(p).find(x=>x.id===rid);if(!r)throw new ProductionError("Tham chiếu không thuộc dự án/sản phẩm này.");return {id:r.id,version:r.version};});
    const prior=p.scenes.find(s=>s.id===d.id);const {referenceIds,...values}=d;
    if(prior){
      for(const take of prior.takes)if(!take.snapshot&&take.sceneRevision===prior.revision)take.snapshot=snapshotScene(prior);
      Object.assign(prior,values,{revision:prior.revision+1,references:refs,storyboardApproved:false});
    }
    else p.scenes.push({...values,revision:1,references:refs,storyboardApproved:false,attempts:[],takes:[]});
  };
  if(action==="reference") {
    const previous=p.references.filter(r=>r.id===d.id);
    p.references.push({...d,version:Math.max(0,...previous.map(r=>r.version))+1,createdAt:now});
    p.scenes.filter(s=>s.references.some(r=>r.id===d.id)).forEach(s=>{s.storyboardApproved=false;});
  } else if(action==="media_provider") {
    if(d.provider==='grok-cli'||d.provider==='fal')throw new ProductionError(d.provider==='fal'?'Trả phí, phải báo giá trước.':'Nhà cung cấp chưa kiểm.');
    if(d.sceneId){if(d.provider==='auto')delete scene(d.sceneId).mediaProvider;else scene(d.sceneId).mediaProvider=d.provider;}
    else {if(d.provider==='auto')delete p.mediaProvider;else p.mediaProvider=d.provider;}
  } else if(action==="skip_reconciliation") {
    // Receipts, attempts and takes stay untouched; only the scene's reconciliation mark moves forward.
    const s=scene(d.sceneId);s.museReconciledAt=Math.max(s.museReconciledAt??0,now);
  } else if(action==="manual_result") {
    const s=scene(d.sceneId);
    if((s.mediaProvider??p.mediaProvider??'manual')!=='manual')throw new ProductionError('Cảnh chưa chọn nhà cung cấp manual.');
    if(s.revision!==d.sceneRevision)throw new ProductionError('Cảnh đã đổi; kiểm lại trước khi gắn file.');
    const existing=p.scenes.find(row=>row.takes.some(t=>t.sha256===d.take.sha256));
    if(existing)throw new ProductionError('Checksum đã có trong dự án; không nhập lại.');
    s.takes.push({...d.take,provider:"manual",snapshot:snapshotScene(s),id:commandId,attemptId:null,sceneRevision:s.revision,review:'pending',notes:'Nhập từ Hộp nhận media · manual · '+checkMedia(s,d.take).join(' '),createdAt:now});
  } else if(action==="scene")saveScene(d);
  else if(action==="import") {
    const ids=d.rows.map((r:any)=>r.id);if(new Set(ids).size!==ids.length||ids.some((v:string)=>p.scenes.some(s=>s.id===v)))throw new ProductionError("Lô có Scene ID trùng. Chưa lưu dòng nào.");
    d.rows.forEach(saveScene);
  } else if(action==="formula_draft") {
    const rows = [...d.rows, d.alternateHook].map((row:any, index:number) => ({...row, ...(row.generationUnit?{generationUnit:{...row.generationUnit,id:`${commandId}_${row.generationUnit.id}`}}:{}), id:`${commandId}_s${index}`}));
    if(rows.some((row:any)=>p.scenes.some(s=>s.id===row.id)))throw new ProductionError('Mã cảnh công thức đã tồn tại.');
    rows.forEach(saveScene);
    const pin = (row:any) => ({sceneId:row.id, takeId:null});
    const bodyId = commandId+'_body', cta = rows.find((row:any)=>row.role==='cta');
    p.bodies.push({id:bodyId,name:d.name,items:rows.filter((row:any)=>row.role==='body').map(pin),createdAt:now});
    [rows[0],rows.at(-1)].forEach((hook:any,index:number)=>p.variants.push({
      id:commandId+(index?'_b':'_a'),name:(d.name+(index?' · B':' · A')).slice(0,150),bodyId,
      hook:pin(hook),cta:cta?pin(cta):null,locale:'en-US',caption:d.ctaPlacement==='overlay'?'':d.ctaText,ctaPlacement:d.ctaPlacement,
      ctaKeyword:d.ctaKeyword,ctaText:d.ctaText,formulaId:d.formulaId,formulaVersion:d.formulaVersion,createdAt:now,
    }));
  } else if(action==="pin_formula") {
    const b=p.bodies.find(body=>body.id===d.bodyId), variants=p.variants.filter(v=>v.bodyId===d.bodyId);
    if(!b||variants.length!==2||variants.some(v=>!v.formulaId))throw new ProductionError('Chọn nhóm biến thể công thức.');
    const pins=[...b.items,...variants.flatMap(v=>[...(v.hook?[v.hook]:[]),...(v.cta?[v.cta]:[])])];
    const ids=new Set(pins.map(pin=>pin.sceneId));
    if(pins.some(pin=>pin.takeId!==null))throw new ProductionError('Nhóm đã ghim phiên bản; giữ nguyên lịch sử, tạo nhóm mới để đổi video.');
    if(d.items.length!==ids.size||new Set(d.items.map((i:any)=>i.sceneId)).size!==ids.size||d.items.some((i:any)=>!ids.has(i.sceneId)))
      throw new ProductionError('Chọn đúng một video cho mỗi cảnh trong cả hai biến thể.');
    const resolved=resolveItems(p,d.items);
    if(new Set(resolved.map(item=>item.scene.ratio)).size!==1||b.items.some(i=>scene(i.sceneId).role!=='body')||
       variants.some(v=>(v.hook&&scene(v.hook.sceneId).role!=='hook')||(v.cta&&scene(v.cta.sceneId).role!=='cta')))
      throw new ProductionError('Vai trò hoặc tỷ lệ cảnh đã đổi. Tạo nhóm công thức mới.');
    for(const pin of pins)pin.takeId=d.items.find((i:any)=>i.sceneId===pin.sceneId).takeId;
  } else if(action==="storyboard") {
    const s=scene(d.sceneId),why=sceneGate(p,s);if(why)throw new ProductionError(why);s.storyboardApproved=true;
  } else if(action==="prepare"||action==="retry") {
    const s=scene(d.sceneId),why=sceneGate(p,s);if(why)throw new ProductionError(why);
    if(p.paused)throw new ProductionError("Hàng đợi đang tạm dừng. Mở lại trước khi chuẩn bị lượt tạo.");
    if(!s.storyboardApproved)throw new ProductionError("Duyệt kịch bản trước khi chuẩn bị tác vụ.");
    if(s.attempts.some(a=>a.status==="unknown"))throw new ProductionError("Lượt tạo chưa rõ kết quả. Cần đối soát mã kết quả trước khi gửi lại.");
    if(action==="prepare" && s.attempts.some(a=>a.sceneRevision===s.revision && a.status==="awaiting_provider"))throw new ProductionError("Cảnh đã có tác vụ chờ API. Dùng Thêm lượt tạo nháp khi cần thử lại.");
    if(action==="retry"&&!s.attempts.length)throw new ProductionError("Chưa có lượt tạo để thử lại.");
    s.attempts.push({id:commandId,requestId:commandId,sceneRevision:s.revision,status:"awaiting_provider",snapshot:JSON.stringify({...storyboardMetadata(s),productId:p.productId,productRevision:p.productRevision,sceneId:s.id,sceneRevision:s.revision,prompt:s.prompt,overlayText:s.overlayText,action:s.action,camera:s.camera,voice:s.voice,references:s.references.map(pin=>({...pin,assetId:p.references.find(r=>r.id===pin.id&&r.version===pin.version)!.assetId})),ratio:s.ratio,duration:s.duration,mediaType:s.mediaType,provider:providerAdapter.id,model:null}),providerJobId:"",usageUsd:null,createdAt:now});
  } else if(action==="pause")p.paused=d.paused;
  else if(action==="cancel") {
    const a=scene(d.sceneId).attempts.find(a=>a.id===d.attemptId);if(!a||a.status!=="awaiting_provider")throw new ProductionError("Chỉ hủy tác vụ nội bộ đang chờ API.");a.status="cancelled";
  } else if(action==="worker_result") {
    const s=scene(d.sceneId);if(p.productRevision!==d.productRevision)throw new ProductionError("Kết quả tác vụ nền dùng phiên bản sản phẩm cũ.");if(s.revision!==d.sceneRevision)throw new ProductionError("Cảnh đã thay đổi. Giữ file tác vụ nền và duyệt lại trước khi gắn.");
    const prior=p.scenes.find(x=>x.attempts.some(a=>a.requestId===d.jobId));
    if(prior){
      if(prior.id!==s.id)throw new ProductionError("Tác vụ tác vụ nền đã thuộc cảnh khác.");
      const attempt=prior.attempts.find(a=>a.requestId===d.jobId)!;
      const take=prior.takes.find(t=>t.attemptId===attempt.id);
      if(attempt.status!=="local_complete"||attempt.sceneRevision!==d.sceneRevision||attempt.providerJobId!==d.providerId||!take||
        take.assetId!==d.take.assetId||take.sha256!==d.take.sha256||take.size!==d.take.size||take.type!==d.take.type||take.name!==d.take.name||
        JSON.stringify(take.metadata)!==JSON.stringify(d.take.metadata))throw new ProductionError("Kết quả tác vụ nền trùng mã tác vụ nhưng khác biên nhận đã lưu.");
      return p0;
    }
    const aid=commandId+"_a";id.parse(aid);if(!s.storyboardApproved)throw new ProductionError("Duyệt kịch bản trước khi nhận kết quả tác vụ nền.");
    s.attempts.push({id:aid,requestId:d.jobId,sceneRevision:s.revision,status:"local_complete",provider:"muse",snapshot:JSON.stringify({...JSON.parse(snapshotScene(s)),source:"windows_worker_receipt"}),providerJobId:d.providerId,usageUsd:null,createdAt:now});
    s.takes.push({...d.take,provider:"muse",snapshot:snapshotScene(s),id:commandId,attemptId:aid,sceneRevision:s.revision,review:"pending",notes:"Nhận qua trên máy; máy chủ kiểm tra file, nội dung chờ người duyệt.",createdAt:now});
  } else if(action==="attach") {
    const s=scene(d.sceneId),a=d.attemptId?s.attempts.find(a=>a.id===d.attemptId):null;
    if(d.attemptId&&!a)throw new ProductionError("Lượt tạo không thuộc cảnh.");
    if(a&&a.status!=="awaiting_provider")throw new ProductionError("Lượt tạo này không nhận thêm kết quả. Chọn lượt tạo chờ hoặc nhập thủ công.");
    s.takes.push({...d.take,provider:"manual",snapshot:a?.snapshot??snapshotScene(s),id:commandId,attemptId:a?.id??null,sceneRevision:a?.sceneRevision??s.revision,review:"pending",notes:"",createdAt:now});
    if(a)a.status="manual_complete";
  } else if(action==="review") {
    const s=scene(d.sceneId),t=s.takes.find(t=>t.id===d.takeId);if(!t)throw new ProductionError("Phiên bản không tồn tại.");
    if(d.review==="approved"){const why=takeGate(p,s,t);if(why)throw new ProductionError(why);}
    if(d.review==="rejected"&&!d.notes)throw new ProductionError("Ghi lý do từ chối phiên bản.");
    t.review=d.review;t.notes=d.notes;
  } else if(action==="body") {
    if(new Set(d.items.map((i:any)=>i.sceneId)).size!==d.items.length)throw new ProductionError("Nội dung chính có cảnh trùng.");
    const resolved=resolveItems(p,d.items);if(resolved.some(i=>i.scene.role!=="body"))throw new ProductionError("Nội dung chính chỉ nhận cảnh vai trò nội dung chính.");
    if(new Set(resolved.map(i=>i.scene.ratio)).size>1)throw new ProductionError("Các cảnh nội dung chính cần cùng tỷ lệ.");
    p.bodies.push({...d,id:commandId,createdAt:now});
  } else if(action==="variant") {
    const b=p.bodies.find(b=>b.id===d.bodyId);if(!b)throw new ProductionError("Chọn nhóm cảnh chính đã duyệt.");
    const resolved=resolveItems(p,[...(d.hook?[d.hook]:[]),...b.items,...(d.cta?[d.cta]:[])]);
    if(d.hook&&resolved[0].scene.role!=="hook")throw new ProductionError("Đầu video cần cảnh mở đầu.");
    if(d.cta&&resolved.at(-1)!.scene.role!=="cta")throw new ProductionError("Cuối video cần cảnh kêu gọi hành động.");
    if(new Set(resolved.map(i=>i.scene.ratio)).size>1)throw new ProductionError("Mở đầu, nội dung chính và kêu gọi hành động cần cùng tỷ lệ.");
    p.variants.push({...d,id:commandId,createdAt:now});
  } else if(action==='render_plan') {
    const plan=validateRenderPlan(p,d);p.renderPlans=[...(p.renderPlans??[]).filter(x=>x.variantId!==plan.variantId),plan];
  } else if(action==='hook_variants') {
    const source=p.variants.find(v=>v.id===d.sourceVariantId);if(!source?.hook)throw new ProductionError('Chọn biến thể có hook làm gốc.');
    const base=getRenderPlan(p,d.productionId,source.id),hookLength=base.segments[0].outSec-base.segments[0].inSec;
    if(new Set(d.hooks.map((h:any)=>h.sceneId+':'+h.takeId)).size!==3)throw new ProductionError('Chọn ba hook khác nhau.');
    const hooks=resolveItems(p,d.hooks);if(hooks.some(h=>h.scene.role!=='hook'||h.scene.ratio!=='9:16'||h.take.metadata.duration!<hookLength))throw new ProductionError('Hook cần video 9:16 đủ thời lượng đã duyệt.');
    for(const [i,h] of hooks.entries()) {
      const vid=commandId.slice(0,110)+'_'+i;
      const variant={...source,id:vid,name:source.name+' · Hook '+(i+1),hook:{sceneId:h.scene.id,takeId:h.take.id},comparisonGroupId:commandId,createdAt:now};p.variants.push(variant);
      const plan={...structuredClone(base),variantId:vid,segments:[{shotId:h.scene.id,sceneId:h.scene.id,takeId:h.take.id,assetId:h.take.assetId,sha256:h.take.sha256,inSec:0,outSec:hookLength},...structuredClone(base.segments.slice(1))]};
      p.renderPlans=[...(p.renderPlans??[]),validateRenderPlan(p,plan)];
    }
  } else if(action==="export") {
    variantItems(p,d.variantId);if(d.renderPlan)validateRenderPlan(p,d.renderPlan);p.exports.push({...d,id:commandId,createdAt:now});
  } else if(action==="sync_product") {
    for (const s of p.scenes) {
      for (const take of s.takes) {
        if (!take.snapshot && take.sceneRevision === s.revision) take.snapshot = snapshotScene(s);
      }
      s.revision++;
      s.storyboardApproved = false;
    }
    p.productRevision = productRevision;
  } else if(action==="measurement") {
    if(!p.variants.some(v=>v.id===d.variantId))throw new ProductionError("Biến thể không thuộc dự án.");
    p.measurements=[...p.measurements.filter(m=>m.variantId!==d.variantId),{...d,updatedAt:now}];
  }
  p.receipts.push(commandId);p.receipts=p.receipts.slice(-500);
  p.events.push({id:commandId,at:now,action,detail: d.sceneId??d.name??(action==="pause"?(d.paused?"Tạm dừng":"Mở lại"):p.name)});p.events=p.events.slice(-300);
  const result=productionSchema.parse(p);
  if(JSON.stringify(result).length>280000)throw new ProductionError("Dự án đã đầy (280 KB). Tạo dự án sản xuất mới để tiếp tục; lịch sử cũ được giữ.");
  return result;
}

export function creativeDuration(script = ""): number | null {
  const lines = script.split("\n").map(line => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  let end = 0;
  for (const line of lines) {
    const match = line.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*s?\b/);
    if (!match) return null;
    const start = Number(match[1]), stop = Number(match[2]);
    if (!Number.isFinite(stop) || stop <= start || Math.abs(start - end) > 0.000001) return null;
    end = stop;
  }
  return Math.round(end * 1000000) / 1000000;
}

export function creativeDrafts(creative:{script?:string;prompt?:string;name?:string},prefix:string) {
  const lines=(creative.script??"").split("\n").map(x=>x.trim()).filter(Boolean).slice(0,30);
  if(!lines.length)lines.push(creative.prompt||"Điền nội dung cảnh từ ý tưởng.");
  return lines.map((line,index)=>{const m=line.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)s?/);const duration=m?Math.max(1,Math.min(120,Number(m[2])-Number(m[1]))):5;return sceneInputSchema.extend({id:z.string()}).parse({id:prefix+"_s"+index,name:`${creative.name||"Concept"} · cảnh ${index+1}`.slice(0,150),role:lines.length===1?"body":index===0?"hook":index===lines.length-1?"cta":"body",prompt:(line+"\n"+(creative.prompt??"")).slice(0,10000),duration,ratio:"9:16",referenceIds:[]});});
}

export function parseCsv(input:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],value="",quoted=false;
  const s=input.replace(/^\uFEFF/,"");
  if(s.length>80000)throw new ProductionError("CSV tối đa 80.000 ký tự.");
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==='"'){if(quoted&&s[i+1]==='"'){value+='"';i++;}else if(quoted||!value)quoted=!quoted;else throw new ProductionError("Dấu nháy CSV không hợp lệ.");}
    else if(c===","&&!quoted){row.push(value);value="";}
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&s[i+1]==="\n")i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value="";}
    else value+=c;
  }
  if(quoted)throw new ProductionError("CSV còn dấu nháy chưa đóng.");
  row.push(value);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
