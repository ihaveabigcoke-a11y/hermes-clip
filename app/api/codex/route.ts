import { owner, body, getRecord, save, failure, ApiError } from "@/lib/lab/server";
import { parseCodexExchange } from "@/lib/lab/codex-exchange";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const uid = await owner(request);
    const input = await body(request);
    let exchange;
    try { exchange = parseCodexExchange(JSON.stringify(input.exchange)); }
    catch (error) { throw new ApiError(422, (error as Error).message); }
    const project = await getRecord(uid, exchange.projectId);
    if (!project || project.kind !== "production") throw new ApiError(404, "Dự án không tồn tại trong workspace này.");
    const product = await getRecord(uid, project.data.productId);
    if (!product || product.kind !== "product") throw new ApiError(422, "Không tìm thấy hồ sơ sản phẩm của dự án.");
    // Canonical schema output, including property order, is the replay identity.
    const bytes = new TextEncoder().encode(JSON.stringify(exchange));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    const id = "codex_" + digest;
    const reply = (record: unknown, deduplicated: boolean) => Response.json({ record, deduplicated }, { headers: { "Cache-Control": "no-store" } });
    const existing = await getRecord(uid, id);
    if (existing) {
      if (existing.kind !== "codex_run" || existing.data.digest !== digest) throw new ApiError(409, "Mã báo cáo đang được bản ghi khác sử dụng.");
      return reply(existing, true);
    }
    const data = { projectId: project.id, productId: product.id, digest, interpretation: "unreviewed", exchange };
    try { return reply(await save(uid, id, "codex_run", data, 0), false); }
    catch (error) {
      // A concurrent import can win the CAS; return that same immutable receipt.
      if (error instanceof ApiError && error.status === 409) {
        const replay = await getRecord(uid, id);
        if (replay?.kind === "codex_run" && replay.data.digest === digest) return reply(replay, true);
      }
      throw error;
    }
  } catch (error) { return failure(error); }
}
