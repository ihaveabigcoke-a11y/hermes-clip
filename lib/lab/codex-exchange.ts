import { z } from "zod";

export const exchangeByteLimit = 384000;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.object({
  title: z.string().max(180),
  url: z.string().max(2048).url().refine(value => {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  }),
  excerpt: z.string().max(300),
}).strict();
const media = z.object({
  width: z.number().int().positive().max(32768),
  height: z.number().int().positive().max(32768),
  duration: z.number().finite().positive().max(3600),
}).strict();
export const codexExchangeSchema = z.object({
  schemaVersion: z.literal(1),
  missionId: id,
  projectId: id,
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative(),
  status: z.literal("completed"),
  steps: z.array(z.object({
    stepId: id,
    type: z.enum(["research", "reference", "compose"]),
    jobId: id,
    query: z.string().max(300).default(""),
    channel: z.enum(["web", "youtube", "reddit", "instagram"]).optional(),
    sources: z.array(source).max(5).default([]),
    frameCount: z.number().int().min(0).max(20).default(0),
    media: media.optional(),
    artifactSha256: sha,
  }).strict()).min(1).max(80),
}).strict().superRefine((value, context) => {
  if (value.finishedAt < value.startedAt || new Set(value.steps.map(s => s.stepId)).size !== value.steps.length)
    context.addIssue({ code: "custom", message: "Thời gian hoặc mã bước trong báo cáo không hợp lệ." });
  for (const step of value.steps) {
    if ((step.type === "research" && (!step.query || !step.channel || step.frameCount || step.media)) ||
        (step.type !== "research" && (step.sources.length || step.query || step.channel)) ||
        (step.type === "reference" && (!step.media || !step.frameCount)) ||
        (step.type === "compose" && (!step.media || step.frameCount)))
      context.addIssue({ code: "custom", message: "Nội dung bước không khớp loại tác vụ." });
  }
});
export type CodexExchange = z.infer<typeof codexExchangeSchema>;
export const codexRunSchema = z.object({
  projectId: id,
  productId: id,
  digest: sha,
  interpretation: z.literal("unreviewed"),
  exchange: codexExchangeSchema,
}).strict();

export function parseCodexExchange(text: string): CodexExchange {
  if (new TextEncoder().encode(text).length > exchangeByteLimit)
    throw new Error("Báo cáo vượt 384 KB. Chia mission thành các lượt nhỏ hơn.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("File cần JSON hợp lệ. Chọn codex-exchange.json do runner xuất."); }
  const result = codexExchangeSchema.safeParse(value);
  if (!result.success) throw new Error("Báo cáo sai định dạng. Chọn codex-exchange.json; không dùng run-summary.json hoặc ZIP.");
  return result.data;
}

export function exchangeSummary(exchange: CodexExchange) {
  return {
    research: exchange.steps.filter(s => s.type === "research").length,
    references: exchange.steps.filter(s => s.type === "reference").length,
    frames: exchange.steps.reduce((n, s) => n + s.frameCount, 0),
    sources: new Set(exchange.steps.flatMap(s => s.sources.map(x => x.url))).size,
    compositions: exchange.steps.filter(s => s.type === "compose").length,
  };
}
