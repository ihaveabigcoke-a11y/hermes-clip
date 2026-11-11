import {
  owner,
  body,
  getRecord,
  getSettings,
  save,
  ApiError,
  failure,
} from "@/lib/lab/server";
export async function POST(request: Request) {
  try {
    const uid = await owner(request);
    const b = await body(request);
    const c =
      typeof b.creativeId === "string"
        ? await getRecord(uid, b.creativeId)
        : null;
    if (!c || c.kind !== "creative")
      throw new ApiError(404, "Không tìm thấy concept.");
    if ((await getSettings(uid)).paused)
      throw new ApiError(422, "Lab đang tạm dừng.");
    if (!c.data.prompt.trim())
      throw new ApiError(422, "Điền prompt trước khi tạo job.");
    const id = `job_${c.id}_${c.revision}`;
    const existing = await getRecord(uid, id);
    if (existing)
      return Response.json({ record: existing, deduplicated: true });
    const payload = JSON.stringify(
      {
        schema_version: 1,
        client_request_id: id,
        creative_id: c.id,
        creative_revision: c.revision,
        aspect_ratio: "9:16",
        prompt: c.data.prompt,
        reference_media: [],
        callback_mode: "poll",
        notes:
          "Map this contract to the selected provider after reviewing official API documentation.",
      },
      null,
      2,
    );
    const record = await save(
      uid,
      id,
      "job",
      {
        creativeId: c.id,
        creativeRevision: c.revision,
        status: "awaiting_provider",
        payload,
      },
      0,
    );
    return Response.json({
      record,
      notice: "Job đã chuẩn bị. Chưa gửi tới provider và chưa phát sinh phí.",
    });
  } catch (e) {
    return failure(e);
  }
}
