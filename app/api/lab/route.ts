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
    if (
      !kinds.includes(b.kind) ||
      ![
        "product",
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
    if (kind === "settings") id = "workspace";
    if (kind === "product" && d.researchOrigin) {
      const {batchId, candidateId} = d.researchOrigin;
      const batch = await getRecord(uid, batchId);
      if (id !== researchProductId(batchId, candidateId) || batch?.kind !== "research_batch" ||
          !batch.data.candidates.some((candidate: any) => candidate.id === candidateId))
        throw new ApiError(422, "Nguồn nghiên cứu của sản phẩm không hợp lệ.");
      const existing = await getRecord(uid, id);
      if (!existing && !batch.data.selectedIds.includes(candidateId))
        throw new ApiError(422, "Chọn ứng viên trong đợt nghiên cứu trước khi tạo sản phẩm.");
      if (existing && b.action === "promote") return Response.json({record: existing, deduplicated: true});
    }
    if (["social_account", "content_plan", "landing_page"].includes(kind)) {
      const product = await getRecord(uid, d.productId);
      if (product?.kind !== "product" || product.data.archived)
        throw new ApiError(422, "Chọn sản phẩm đang hoạt động trong workspace.", {productId: "Sản phẩm không sẵn sàng."});
      const previous = await getRecord(uid, id);
      if (previous && previous.data.productId !== d.productId)
        throw new ApiError(422, "Tạo hồ sơ mới khi cần chuyển sang sản phẩm khác.", {productId: "Hồ sơ đã gắn với sản phẩm ban đầu."});
    }
    if (kind === "content_plan") {
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
        if (metric || comments) throw new ApiError(422, "Bài đã có số liệu. Tạo nội dung mới để giữ đúng nguồn đo.");
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
      const plan = await getRecord(uid, d.planId);
      if (plan?.kind !== "content_plan" || !["published_manual", "published_browser"].includes(plan.data.status))
        throw new ApiError(422, "Ghi nhận bài đã đăng và URL trước khi cập nhật số liệu.");
      if (d.source === 'instagram_browser' && (d.accountId !== plan.data.accountId || d.sourceUrl !== plan.data.postUrl || !d.handle))
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
    const record = await save(uid, id, kind, d, revision);
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
