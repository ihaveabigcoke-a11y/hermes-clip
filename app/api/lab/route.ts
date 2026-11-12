import {
  owner,
  database,
  decode,
  body,
  parsed,
  save,
  getRecord,
  getSettings,
  ApiError,
  failure,
} from "@/lib/lab/server";
import { kinds, productGate, type Kind } from "@/lib/lab/domain";
import { researchProductId } from "@/lib/lab/operations";
import { viralFormulaRecordId } from "@/lib/lab/viral-formulas";
import { referenceDraftRecordId } from "@/lib/lab/viral-reference";
import {env} from 'cloudflare:workers';
import {buildOfficeView} from '@/lib/lab/office-view';
import {dailySelectionInput} from '@/lib/lab/daily-selection';
import {metricImportInput} from '@/lib/lab/metric-import';
import {hookDraftInput} from '@/lib/lab/hook-matrix';
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const uid = await owner();
    const r = await database()
      .prepare(
        "SELECT * FROM lab_records WHERE owner_id=? ORDER BY updated_at DESC LIMIT 2001",
      )
      .bind(uid)
      .all();
    if (r.results.length > 2000)
      throw new ApiError(
        409,
        "Workspace vượt giới hạn bản đầu. Cần phân trang phía server trước khi tiếp tục.",
      );
    if(new URL(request.url).searchParams.get('view')==='office') {
      const state=(env as any).OFFICE_STATE;
      if(!state)throw new ApiError(503,'Màn theo dõi cần dữ liệu desktop local.');
      return Response.json({view:buildOfficeView(r.results.map(decode),state.jobs,state.manual,state.integrations,Date.now())},{headers:{'Cache-Control':'no-store'}});
    }
    return Response.json(
      {
        records: r.results.map(decode).filter(r=>r.kind!=="assistant_run"),
        videoProvider: { connected: false, state: "awaiting_documentation" },
        maxRecords: 2000,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const uid = await owner(request);
    const b = await body(request);
    if(b.action==='import_social_metrics'){
      const input=metricImportInput.safeParse(b.input);if(!input.success)throw new ApiError(422,'Kiểm lại các dòng số liệu, nguồn và thời điểm đo.');
      if(!(env as any).IMPORT_SOCIAL_METRICS)throw new ApiError(503,'Nhập bảng số liệu cần desktop local.');
      try{return Response.json({records:(env as any).IMPORT_SOCIAL_METRICS(uid,input.data)});}catch(error){throw new ApiError(409,(error as Error).message);}
    }
    if(b.action==='create_hook_drafts') {
      const input=hookDraftInput.safeParse(b.input);
      if(!input.success)throw new ApiError(422,'Chọn nhóm hook, tài khoản và landing HTTPS hợp lệ.');
      if(!(env as any).CREATE_HOOK_DRAFTS)throw new ApiError(503,'Tạo nhóm bài nháp cần bản desktop local.');
      try{return Response.json({records:(env as any).CREATE_HOOK_DRAFTS(uid,input.data)});}
      catch(error){throw new ApiError(409,(error as Error).message);}
    }
    if(b.action==='select_daily') {
      const input=dailySelectionInput.safeParse(b.input);
      if(!input.success)throw new ApiError(422,'Nhập mã sản phẩm và thứ hạng hợp lệ.');
      if(!(env as any).SELECT_RESEARCH)throw new ApiError(503,'Chọn theo ngày cần bản desktop local.');
      try {return Response.json({records:(env as any).SELECT_RESEARCH(uid,input.data)});}
      catch(error) {throw new ApiError(409,(error as Error).message);}
    }
    if (
      !kinds.includes(b.kind) ||
      ![
        "product",
        "product_decision",
        "experiment",
        "creative",
        "metric",
        "cost",
        "settings",
        "signal",
        "research_batch",
        "social_account",
        "content_plan",
        "social_metric",
        "keyword_comment_measurement",
        "landing_page",
        "viral_formula",
        "reference_video_draft",
      ].includes(b.kind)
    )
      throw new ApiError(400, "Loại bản ghi không được hỗ trợ.");
    const kind = b.kind as Kind;
    let d = parsed(kind, b.data);
    let id = b.id;
    const revision = b.revision ?? 0;
    if (kind === "reference_video_draft") id = referenceDraftRecordId({id:d.id});
    if (kind === "viral_formula") {
      // Append-only versions. Canonical IDs + save's CAS prevent concurrent
      // requests or retries from overwriting an existing formula version.
      if (revision !== 0)
        throw new ApiError(409, "Giữ phiên bản đã lưu. Tăng version để lưu công thức thành bản mới.");
      id = viralFormulaRecordId({id: d.id, version: d.version});
      d.updatedAt = new Date().toISOString();
    }
    if(kind==='product_decision'){
      if(revision!==0)throw new ApiError(409,'Giữ lịch sử quyết định. Tạo quyết định mới.');
      const product=await getRecord(uid,d.productId);if(product?.kind!=='product')throw new ApiError(422,'Chọn sản phẩm trong không gian làm việc.');
    }
    if (kind === "settings") id = "workspace";
    if(kind==='product') {
      for(const video of d.competitorVideos??[]){
        if(video.referenceId){const ref=await getRecord(uid,video.referenceId);if(ref?.kind!=='reference_video_draft')throw new ApiError(422,'Bản phân tích video không tồn tại trong không gian làm việc.');}
      }
      const previous=await getRecord(uid,id);
      if((d.productKey??null)!==(previous?.data.productKey??null))
        throw new ApiError(422,'Gán mã khi chọn sản phẩm theo ngày. Mã đã gán không được đổi.');
    }
    if(kind==='research_batch') {
      const previous=await getRecord(uid,id);
      if(JSON.stringify(d.selectionLinks??[])!==JSON.stringify(previous?.data.selectionLinks??[]) ||
        (previous?.data.selectionDay && d.selectionDay!==previous.data.selectionDay))
        throw new ApiError(422,'Giữ liên kết và ngày của đợt đã lưu.');
    }
    if (kind === "product" && d.researchOrigin) {
      const {batchId, candidateId} = d.researchOrigin;
      const batch = await getRecord(uid, batchId);
      if (id !== researchProductId(batchId, candidateId) || batch?.kind !== "research_batch" ||
          !batch.data.candidates.some((candidate: any) => candidate.id === candidateId))
        throw new ApiError(422, "Nguồn nghiên cứu của sản phẩm không hợp lệ.");
      const existing = await getRecord(uid, id);
      if (!existing && !batch.data.selectedIds.includes(candidateId))
        throw new ApiError(422, "Chọn ứng viên trong đợt nghiên cứu trước khi tạo sản phẩm.");
      if (existing && b.action === "promote") {
        if (existing.kind !== 'product' || existing.data.researchOrigin?.batchId !== batchId || existing.data.researchOrigin?.candidateId !== candidateId)
          throw new ApiError(409, 'ID hồ sơ đã dùng cho nguồn khác. Giữ nguyên hồ sơ và kiểm tra nguồn ứng viên.');
        return Response.json({record: existing, deduplicated: true});
      }
    }
    if (["social_account", "content_plan", "landing_page"].includes(kind)) {
      const product = await getRecord(uid, d.productId);
      if (product?.kind !== "product" || product.data.archived)
        throw new ApiError(422, "Chọn sản phẩm đang hoạt động trong workspace.", {productId: "Sản phẩm không sẵn sàng."});
      if(d.variantId){const production=d.productionId?await getRecord(uid,d.productionId):null;if(!production||production.kind!=='production'||production.data.productId!==d.productId||!production.data.variants.some((v:any)=>v.id===d.variantId))throw new ApiError(422,'Biến thể không thuộc dự án/sản phẩm.');}
      const previous = await getRecord(uid, id);
      if (previous && previous.data.productId !== d.productId)
        throw new ApiError(422, "Tạo hồ sơ mới khi cần chuyển sang sản phẩm khác.", {productId: "Hồ sơ đã gắn với sản phẩm ban đầu."});
    }
    if (kind === "content_plan") {
      const savedPlan=await getRecord(uid,id);
      if(JSON.stringify(savedPlan?.data.comparison)!==JSON.stringify(d.comparison))throw new ApiError(422,'Giữ bản lưu điều kiện của lượt so sánh. Tạo nhóm qua nút Tạo 3 bài nháp.');
      const account = d.accountId ? await getRecord(uid, d.accountId) : null;
      if (d.accountId && (account?.kind !== "social_account" || account.data.archived || account.data.productId !== d.productId))
        throw new ApiError(422, "Tài khoản và sản phẩm không khớp.", {accountId: "Chọn tài khoản của sản phẩm này."});
      if (d.productionId) {
        const production = await getRecord(uid, d.productionId);
        if (production?.kind !== "production" || production.data.productId !== d.productId)
          throw new ApiError(422, "Dự án video và sản phẩm không khớp.", {productionId: "Chọn dự án của sản phẩm này."});
      }
      const previous = await getRecord(uid, id);
      if (previous && (previous.data.accountId !== d.accountId || previous.data.postUrl !== d.postUrl)) {
        const metric = await getRecord(uid, `social_metric_${id}`);
        const comments = await database().prepare("SELECT id FROM lab_records WHERE owner_id=? AND kind='keyword_comment_measurement' AND json_extract(data,'$.planId')=? LIMIT 1").bind(uid, id).first();
        const imported = await database().prepare("SELECT id FROM lab_records WHERE owner_id=? AND kind='social_metric' AND json_extract(data,'$.planId')=? LIMIT 1").bind(uid,id).first();
        if (metric || comments || imported) throw new ApiError(422, "Bài đã có số liệu. Tạo nội dung mới để giữ đúng nguồn đo.");
      }
    }
    if (kind === "keyword_comment_measurement") {
      if (revision !== 0) throw new ApiError(409, "Giữ bản đo đã lưu. Dán comment để tạo bản đo mới.");
      const plan = await getRecord(uid, d.planId);
      if (plan?.kind !== 'content_plan' || !['published_manual', 'published_browser'].includes(plan.data.status))
        throw new ApiError(422, "Ghi nhận bài đã đăng và URL trước khi dán comment.");
      const account = await getRecord(uid, d.accountId);
      if (d.accountId !== plan.data.accountId || d.sourceUrl !== plan.data.postUrl || account?.kind !== 'social_account' || account.data.productId !== plan.data.productId)
        throw new ApiError(422, "Nguồn comment không khớp bài đăng hoặc tài khoản.");
      // Source is a manual observation made now, independent of Insights.
      d.observedAt = new Date().toISOString();
    }
    if (kind === "social_metric") {
      if(d.importBatchId)throw new ApiError(422,'Bản đo nhập lô chỉ được tạo qua xem trước bảng.');
      const oldInput=await getRecord(uid,id);if(oldInput?.data.importBatchId)throw new ApiError(409,'Giữ lịch sử bản đo nhập lô.');
      const plan = await getRecord(uid, d.planId);
      if (plan?.kind !== "content_plan" || !["published_manual", "published_browser"].includes(plan.data.status))
        throw new ApiError(422, "Ghi nhận bài đã đăng và URL trước khi cập nhật số liệu.");
      if (['instagram_browser', 'api'].includes(d.source) && (d.accountId !== plan.data.accountId || d.sourceUrl !== plan.data.postUrl || !d.handle))
        throw new ApiError(422, "Nguồn số liệu không khớp bài đăng hoặc tài khoản.");
      id = `social_metric_${d.planId}`;
      const previous = await getRecord(uid, id);
      if (previous && Date.parse(d.observedAt) < Date.parse(previous.data.observedAt))
        throw new ApiError(422, "Thời điểm đo cần bằng hoặc sau bản số liệu hiện tại.", {observedAt: "Giữ bản đo mới nhất."});
    }
    if (kind === "landing_page") {
      id = `landing_${d.productId}`;
      if (d.imageAssetId) {
        const asset = await getRecord(uid, d.imageAssetId);
        if (asset?.kind !== "asset" || !["image/png", "image/jpeg", "image/webp"].includes(asset.data.type))
          throw new ApiError(422, "Chọn ảnh PNG, JPEG hoặc WebP trong workspace.", {imageAssetId: "Ảnh không hợp lệ."});
      }
    }
    if (kind === "experiment") {
      const p = await getRecord(uid, d.productId);
      if (!p || p.kind !== "product")
        throw new ApiError(422, "Không tìm thấy sản phẩm.", {
          productId: "Chọn sản phẩm trong workspace này.",
        });
      if (d.status === "running" || d.decision === "pilot") {
        const why = productGate(p.data);
        if (why) throw new ApiError(422, why, { status: why });
        const s = await getSettings(uid);
        if (s.paused)
          throw new ApiError(
            422,
            "Lab đang tạm dừng. Mở lại trong Kết nối & cài đặt.",
          );
      }
    }
    if (kind === "creative") {
      const p = await getRecord(uid, d.productId),
        ex = await getRecord(uid, d.experimentId);
      if (
        !p ||
        p.kind !== "product" ||
        !ex ||
        ex.kind !== "experiment" ||
        ex.data.productId !== p.id
      )
        throw new ApiError(422, "Sản phẩm và bài test không khớp.");
      if (b.action === "approve") {
        const why = productGate(p.data);
        if (why) throw new ApiError(422, why);
        if (!d.mediaUrl)
          throw new ApiError(422, "Gắn video đã xem trước khi duyệt.", {
            mediaUrl: "Tải video hoặc điền link HTTPS.",
          });
        d.status = "approved";
        d.approvedAt = Date.now();
      } else {
        d.status = d.mediaUrl ? "ready" : "draft";
        d.approvedAt = null;
      }
    }
    if (kind === "metric" || kind === "signal") {
      const ex = await getRecord(uid, d.experimentId);
      if (!ex || ex.kind !== "experiment")
        throw new ApiError(422, "Bài test không tồn tại.");
      if (kind === "metric") id = `metric_${d.experimentId}`;
    }
    if (kind === "cost" && d.productId) {
      const p = await getRecord(uid, d.productId);
      if (!p || p.kind !== "product")
        throw new ApiError(422, "Sản phẩm không tồn tại.");
    }
    const old = kind === "product" ? await getRecord(uid, id) : null;
    let record;
    try { record = await save(uid, id, kind, d, revision); }
    catch (error) {
      // A second tab may have promoted this candidate after our initial read.
      if (error instanceof ApiError && error.status === 409 && kind === 'product' && b.action === 'promote' && d.researchOrigin) {
        const existing = await getRecord(uid, id);
        if (existing?.kind === 'product' && existing.data.researchOrigin?.batchId === d.researchOrigin.batchId && existing.data.researchOrigin?.candidateId === d.researchOrigin.candidateId)
          return Response.json({record: existing, deduplicated: true});
      }
      throw error;
    }
    if (
      old &&
      kind === "product" &&
      (old.data.proofNotes !== d.proofNotes ||
        old.data.proofUrl !== d.proofUrl ||
        old.data.sampleVerified !== d.sampleVerified)
    )
      await database()
        .prepare(
          `UPDATE lab_records SET data=json_set(data,'$.status','draft','$.approvedAt',NULL),revision=revision+1,updated_at=? WHERE owner_id=? AND kind='creative' AND json_extract(data,'$.productId')=? AND json_extract(data,'$.status')='approved'`,
        )
        .bind(Date.now(), uid, id)
        .run();
    return Response.json(
      { record },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
