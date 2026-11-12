import { z } from "zod";
import {candidateSchema, researchBatchSchema, usRetailSchema, sourceLink, type ResearchBatch} from './operations.ts';
import {researchResponse, contentResponse, landingResponse, museTaskPrompt} from './muse-workflows.ts';
import {annotateResearchQuality} from './research-quality.ts';

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

// Text exchanges share the Muse contracts; media mission receipts above remain unchanged.
export const textTaskKind = z.enum(['research', 'content', 'landing']);
export type TextTaskKind = z.infer<typeof textTaskKind>;
export const textTaskRequest = z.object({
  kind: textTaskKind, context: z.record(z.unknown()),
}).strict();
const toolName = z.string().trim().min(1, 'Điền tên công cụ tạo JSON.').max(80).regex(/^[^\r\n]+$/);
const logisticsKeys = ['battery','liquid','fragile','sizeFit','vehicleFit','bulky','brandRisk','ipRisk'] as const;
const skillResponse = candidateSchema.omit({id: true, listingCheck: true, qualityWarnings: true}).extend({
  listingStatus: z.enum(['single','showroom','not_found','blocked']),
  supplierUrl: candidateSchema.shape.supplierUrl.nullable(),
  supplierCountry: candidateSchema.shape.supplierCountry.nullable(),
  usRetail: z.preprocess(value => {
    if (!value || typeof value !== 'object' || !('sources' in value) || !Array.isArray(value.sources)) return value;
    return {...value, sources: value.sources.map(source => typeof source === 'string' && sourceLink.safeParse(source).success ? {url:source} : source)};
  }, usRetailSchema.nullable().optional()),
  logisticsFlags: z.union([candidateSchema.shape.logisticsFlags, z.array(z.enum(logisticsKeys)).max(8)]),
  maxLandedForMarkup: z.unknown(),
}).passthrough();

function fieldError(error: z.ZodError): Error {
  return new Error(error.issues.map(issue => `${issue.path.join('.') || 'JSON'}: ${issue.message}`).join('\n'));
}
function checked<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw fieldError(result.error);
  return result.data;
}
function readTextJson(text: string): unknown {
  if (new TextEncoder().encode(text).length > exchangeByteLimit) throw Error('JSON: vượt giới hạn 384 KB.');
  try { return JSON.parse(text.replace(/^\uFEFF/, '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw Error('JSON: cú pháp không hợp lệ. Chỉ nhập đối tượng JSON, không kèm phần tóm tắt.'); }
}

export function textTaskPrompt(kind: TextTaskKind, context: Record<string, unknown>) {
  return museTaskPrompt(kind, context).replace(/\bMuse\b/g, 'research assistant');
}

export function parseTextExchange(kind: 'research', text: string, tool: string): z.infer<typeof researchResponse>;
export function parseTextExchange(kind: 'content', text: string, tool: string): z.infer<typeof contentResponse>;
export function parseTextExchange(kind: 'landing', text: string, tool: string): z.infer<typeof landingResponse>;
export function parseTextExchange(kind: TextTaskKind, text: string, tool: string): z.infer<typeof researchResponse> | z.infer<typeof contentResponse> | z.infer<typeof landingResponse>;
export function parseTextExchange(kind: TextTaskKind, text: string, tool: string): z.infer<typeof researchResponse> | z.infer<typeof contentResponse> | z.infer<typeof landingResponse> {
  const name = checked(toolName, tool), value = readTextJson(text);
  if (kind === 'content') return checked(contentResponse, value);
  if (kind === 'landing') return checked(landingResponse, value);
  let research: unknown = value;
  if (value && typeof value === 'object' && !Array.isArray(value) && !('candidates' in value)) {
    const skill = checked(skillResponse, value);
    const originalFlags = skill.logisticsFlags;
    const flags = Array.isArray(originalFlags)
      ? Object.fromEntries(logisticsKeys.map(key => [key, originalFlags.includes(key) ? true : null]))
      : originalFlags;
    // Retain the complete skill payload, including fields not yet represented in the app.
    research = {summary: skill.verdictReason ?? '', candidates: [{...skill,
      supplierUrl: skill.supplierUrl ?? '', supplierCountry: skill.supplierCountry ?? '',
      logisticsFlags: flags, importMetadata: {rawJson: JSON.stringify(value)},
    }]};
  }
  const parsed = checked(researchResponse, research);
  const issues: z.ZodIssue[] = [];
  parsed.candidates.forEach((candidate, index) => {
    const issue = (field: string, message: string) => issues.push({code: 'custom', path: ['candidates', index, field], message});
    if (!candidate.supplierUrl && candidate.listingStatus !== 'not_found') issue('supplierUrl', 'Cần URL nguồn HTTPS; chỉ not_found được để trống.');
    for (const field of ['cost','shipping'] as const) {
      if (candidate.listingStatus && candidate.listingStatus !== 'single' && candidate[field] !== null)
        issue(field, 'listingStatus khác single: số tiền bắt buộc là null.');
      if (candidate[field] !== null && !candidate[`${field}Currency`]) issue(`${field}Currency`, 'Số tiền đã biết cần mã tiền tệ từ nguồn, không tự suy từ giá bán.');
    }
  });
  if (issues.length) throw fieldError(new z.ZodError(issues));
  return {...parsed, candidates: parsed.candidates.map(candidate => ({...candidate, source: `import:${name}`}))};
}

export function mergeTextResearch(batch: ResearchBatch, result: z.infer<typeof researchResponse>, importId: string): ResearchBatch {
  checked(id, importId);
  const identity = (candidate: {name: string; supplierUrl: string}) => candidate.supplierUrl.replace(/\/$/, '') + '\n' + candidate.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const identities = new Set(batch.candidates.map(identity));
  const additions = result.candidates.flatMap((candidate, index) => {
    const key = identity(candidate);
    if (identities.has(key)) return [];
    identities.add(key);
    return [{...candidate, id: `import_${importId}_${index}`}];
  });
  if (!additions.length) return batch;
  if (batch.candidates.length + additions.length > 10) throw Error('candidates: đợt vượt 10 ứng viên. Tạo đợt mới hoặc nhập ít ứng viên hơn.');
  return checked(researchBatchSchema, {...batch,
    candidates: annotateResearchQuality([...batch.candidates, ...additions]),
    notes: `[${additions[0].source}]\n${result.summary}\n\n${batch.notes}`,
  });
}
