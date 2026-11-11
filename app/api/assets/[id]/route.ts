import { env } from "cloudflare:workers";
import { owner, getRecord, ApiError, failure } from "@/lib/lab/server";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const uid = await owner();
    const { id } = await params;
    const asset = await getRecord(uid, id);
    if (!asset || asset.kind !== "asset" || !env.BUCKET)
      throw new ApiError(404, "File không tồn tại trong workspace này.");
    const size = asset.data.size;
    let offset = 0,
      length = size,
      partial = false;
    const h = request.headers.get("range");
    if (h) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(h);
      if (!m)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      offset = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (offset >= size || end < offset)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      length = end - offset + 1;
      partial = true;
    }
    const object = await env.BUCKET.get(asset.data.key, {
      range: { offset, length },
    });
    if (!object) throw new ApiError(404, "Không tìm thấy nội dung file.");
    const headers: Record<string, string> = {
      "Content-Type": asset.data.type,
      "Content-Length": String(length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (partial)
      headers["Content-Range"] =
        `bytes ${offset}-${offset + length - 1}/${size}`;
    return new Response(object.body, { status: partial ? 206 : 200, headers });
  } catch (e) {
    return failure(e);
  }
}
