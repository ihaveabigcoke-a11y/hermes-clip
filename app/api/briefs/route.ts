import {
  owner,
  body,
  getRecord,
  getSettings,
  database,
  decode,
  ApiError,
  failure,
} from "@/lib/lab/server";
import { makeBriefs } from "@/lib/lab/domain";
export async function POST(request: Request) {
  try {
    const uid = await owner(request);
    const b = await body(request);
    const ex =
      typeof b.experimentId === "string"
        ? await getRecord(uid, b.experimentId)
        : null;
    if (!ex || ex.kind !== "experiment")
      throw new ApiError(404, "Chọn một bài test trước.");
    const p = await getRecord(uid, ex.data.productId);
    if (!p || p.kind !== "product" || p.data.archived)
      throw new ApiError(422, "Sản phẩm không còn hoạt động.");
    if ((await getSettings(uid)).paused)
      throw new ApiError(422, "Lab đang tạm dừng.");
    const briefs = makeBriefs(p, ex),
      now = Date.now();
    const db = database();
    await db.batch(
      briefs.map((r) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO lab_records (owner_id,id,kind,data,revision,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM lab_records WHERE owner_id=?)<2000",
          )
          .bind(uid, r.id, r.kind, JSON.stringify(r.data), now, now, uid),
      ),
    );
    const rows = await db
      .prepare(
        "SELECT * FROM lab_records WHERE owner_id=? AND kind=? AND json_extract(data,'$.experimentId')=? ORDER BY created_at",
      )
      .bind(uid, "creative", ex.id)
      .all();
    return Response.json({
      records: rows.results.map(decode),
      source: "template",
      notice: "Đây là khung kịch bản có sẵn, chưa gọi LLM hoặc engine video.",
    });
  } catch (e) {
    return failure(e);
  }
}
