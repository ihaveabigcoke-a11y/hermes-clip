import { env } from "cloudflare:workers";
import { owner, save, getRecord, ApiError, failure } from "@/lib/lab/server";
import { inspectMedia } from "@/lib/lab/media";
export async function POST(request: Request) {
  try {
    const uid = await owner(request);
    if (!env.BUCKET)
      throw new ApiError(
        503,
        "Kho file chưa sẵn sàng. Có thể dùng link HTTPS trong lúc chờ.",
      );
    if (Number(request.headers.get("content-length") || 0) > 27 * 1024 * 1024)
      throw new ApiError(413, "File tối đa 25 MB.");
    const data = await request.formData();
    const commandId = data.get("commandId");
    if (commandId !== null && (typeof commandId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(commandId)))
      throw new ApiError(422, "Mã nhập file không hợp lệ.");
    const f = data.get("file");
    if (!(f instanceof File) || f.size === 0)
      throw new ApiError(422, "Chọn một ảnh hoặc video không rỗng.");
    if (f.size > 25 * 1024 * 1024)
      throw new ApiError(413, "File tối đa 25 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer()),
      s = String.fromCharCode(...bytes.subarray(0, 16));
    let type = "",
      ext = "";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      type = "image/jpeg";
      ext = "jpg";
    } else if (bytes[0] === 0x89 && s.slice(1, 4) === "PNG") {
      type = "image/png";
      ext = "png";
    } else if (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") {
      type = "image/webp";
      ext = "webp";
    } else if (s.slice(4, 8) === "ftyp") {
      type = "video/mp4";
      ext = "mp4";
    } else if (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) {
      type = "video/webm";
      ext = "webm";
    }
    if (!type)
      throw new ApiError(
        422,
        "Chỉ hỗ trợ JPG, PNG, WebP, MP4 hoặc WebM hợp lệ.",
      );
    if (type.startsWith("image/") && f.size > 8 * 1024 * 1024)
      throw new ApiError(413, "Ảnh tối đa 8 MB.");
    let metadata;
    try { metadata = inspectMedia(bytes, type); }
    catch (e) { throw new ApiError(422, (e as Error).message); }
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(v=>v.toString(16).padStart(2,"0")).join("");
    const contentId = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid + '\0' + sha256)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const id = commandId ? `upload_${commandId}` : `content_${contentId}`;
    const responseFor = (asset: any) => Response.json({id: asset.id, url: `/api/assets/${asset.id}`, ...asset.data, key: undefined});
    const previous = await getRecord(uid, id);
    if (previous) {
      if (previous.kind !== "asset" || previous.data.sha256 !== sha256)
        throw new ApiError(409, "Mã nhập file đã dùng cho nội dung khác.");
      return responseFor(previous);
    }
    // Each concurrent upload owns its temporary object until the record is saved.
    const key = `${uid}/${crypto.randomUUID()}.${ext}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
    try {
      await save(
        uid,
        id,
        "asset",
        { key, name: f.name.slice(0, 150), type, size: f.size, metadata, sha256 },
        0,
      );
    } catch (e) {
      await env.BUCKET.delete(key);
      const existing = await getRecord(uid, id);
      if (existing?.kind === "asset" && existing.data.sha256 === sha256)
        return responseFor(existing);
      throw e;
    }
    return Response.json({
      id,
      url: `/api/assets/${id}`,
      name: f.name.slice(0, 150),
      type,
      size: f.size,
      metadata,
      sha256,
    });
  } catch (e) {
    return failure(e);
  }
}
