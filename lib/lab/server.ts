import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { schemas, type Kind, type LabRecord, emptySettings } from "./domain";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export async function owner(request?: Request) {
  if (request && request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new ApiError(
        403,
        "Yêu cầu không cùng nguồn. Mở lại ứng dụng để thử.",
      );
  }
  const u = await getChatGPTUser();
  if (!u)
    throw new ApiError(
      401,
      "Phiên đăng nhập chưa sẵn sàng. Đăng nhập lại để lưu dữ liệu.",
    );
  return u.userId;
}
export function database() {
  if (!env.DB)
    throw new ApiError(503, "Kho dữ liệu chưa sẵn sàng. Thử tải lại sau.");
  return env.DB;
}
export function decode(row: any): LabRecord {
  return {
    id: row.id,
    kind: row.kind,
    data: JSON.parse(row.data),
    revision: row.revision,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}
export async function getRecord(uid: string, id: string) {
  const r = await database()
    .prepare("SELECT * FROM lab_records WHERE owner_id=? AND id=?")
    .bind(uid, id)
    .first();
  return r ? decode(r) : null;
}
export async function getSettings(uid: string) {
  return (await getRecord(uid, "workspace"))?.data ?? emptySettings;
}
/** Atomic insert-if-no-project: safe across tabs, processes and restarts. */
export async function createProductionIfAbsent(uid: string, id: string, data: Record<string, any>) {
  const now = Date.now();
  const result = await database().prepare(`INSERT INTO lab_records (owner_id,id,kind,data,revision,created_at,updated_at)
    SELECT ?,?,'production',?,1,?,?
    WHERE NOT EXISTS (SELECT 1 FROM lab_records WHERE owner_id=? AND kind='production' AND json_extract(data,'$.productId')=?)
    AND (SELECT COUNT(*) FROM lab_records WHERE owner_id=?)<2000
    ON CONFLICT(owner_id,id) DO NOTHING`).bind(uid,id,JSON.stringify(data),now,now,uid,data.productId,uid).run();
  const row = await database().prepare(`SELECT * FROM lab_records WHERE owner_id=? AND kind='production'
    AND json_extract(data,'$.productId')=? ORDER BY created_at,id LIMIT 1`).bind(uid,data.productId).first();
  if (!row) throw new ApiError(409, 'Chưa tạo được dự án: ID đã dùng hoặc workspace đã đủ 2.000 bản ghi. Tải lại để kiểm tra.');
  return {record: decode(row), deduplicated: !result.meta.changes};
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Ứng dụng cần dữ liệu JSON hợp lệ.");
  const t = await request.text();
  if (t.length > 400000)
    throw new ApiError(413, "Dữ liệu quá dài. Giảm nội dung rồi thử lại.");
  try {
    return JSON.parse(t);
  } catch {
    throw new ApiError(400, "Dữ liệu JSON không hợp lệ.");
  }
}
export function parsed(kind: Kind, value: unknown) {
  const result = schemas[kind].safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const e of result.error.issues)
      fields[String(e.path[0] ?? "form")] = e.message;
    throw new ApiError(422, "Kiểm tra các trường được đánh dấu.", fields);
  }
  return result.data as Record<string, any>;
}
export async function save(
  uid: string,
  id: string,
  kind: Kind,
  data: Record<string, any>,
  revision: number,
) {
  if (
    typeof id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,120}$/.test(id) ||
    !Number.isInteger(revision) ||
    revision < 0
  )
    throw new ApiError(400, "ID hoặc phiên bản dữ liệu không hợp lệ.");
  const now = Date.now();
  const r = await database()
    .prepare(
      `INSERT INTO lab_records (owner_id,id,kind,data,revision,created_at,updated_at)
 SELECT ?,?,?,?,1,?,? WHERE (?=0 AND (SELECT COUNT(*) FROM lab_records WHERE owner_id=?)<2000) OR EXISTS(SELECT 1 FROM lab_records WHERE owner_id=? AND id=?)
 ON CONFLICT(owner_id,id) DO UPDATE SET data=excluded.data,revision=lab_records.revision+1,updated_at=excluded.updated_at WHERE lab_records.kind=excluded.kind AND lab_records.revision=?`,
    )
    .bind(
      uid,
      id,
      kind,
      JSON.stringify(data),
      now,
      now,
      revision,
      uid,
      uid,
      id,
      revision,
    )
    .run();
  if (!r.meta.changes)
    throw new ApiError(
      409,
      "Dữ liệu đã thay đổi hoặc không gian làm việc đã chạm giới hạn 2.000 bản ghi. Tải lại trước khi lưu.",
    );
  return (await getRecord(uid, id))!;
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return Response.json(
      { error: error.message, fields: error.fields },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    {
      error:
        "Không hoàn tất thao tác. Dữ liệu trong biểu mẫu vẫn được giữ; thử tải lại trước khi lưu lại.",
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
