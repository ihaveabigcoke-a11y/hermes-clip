import { z } from "zod";
import seed from "./viral-formulas.seed.json" with { type: "json" };

// Taxonomy v1 is fixed. Future MP4/frame/OCR/Muse analysis must classify into
// these values, then propose a new formula version for the user to review.
// See docs/VIRAL-FORMULAS.md; this module performs no I/O or provider calls.
export const formulaTaxonomy = Object.freeze({
  roles: ["hook", "body", "cta"] as const,
  beatKinds: ["problem", "versus_unbox", "result", "cta"] as const,
  hookTypes: ["problem_label", "pov_share_bait", "do_not_show", "think_vs_actually", "authority_check", "audience_callout", "emotional_story"] as const,
  ctaTypes: ["comment_keyword", "send_keyword_dm", "link_in_bio"] as const,
});
export const formulaProductTraits = [
  "visual_payoff_one_frame", "night_glow", "pet", "safety", "running", "cycling",
  "hobby_group", "identity", "apparel", "beauty", "routine", "family", "senior",
] as const;
const text = z.string().trim().min(1).max(3000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/, "ID chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.");
const second = z.number().finite().min(-3600).max(3600);
const beatFields = {
  kind: z.enum(formulaTaxonomy.beatKinds),
  role: z.enum(formulaTaxonomy.roles),
  label: z.string().max(1000),
  goal: text,
};

// Start-relative beats use nonnegative seconds. End-relative CTA beats use
// negative seconds, e.g. [-3, 0] = the last 3 seconds. Both obey from < to.
export const formulaBeatSchema = z.object({
  ...beatFields,
  fromSec: second,
  toSec: second,
  timeOrigin: z.enum(["start", "end"]).default("start"),
}).superRefine((beat, ctx) => {
  if (beat.fromSec >= beat.toSec)
    ctx.addIssue({code: "custom", path: ["toSec"], message: "Mốc kết thúc phải sau mốc bắt đầu."});
  if (beat.timeOrigin === "start" ? beat.fromSec < 0 : beat.toSec > 0 || beat.role !== "cta" || beat.kind !== "cta")
    ctx.addIssue({code: "custom", path: ["timeOrigin"], message: "Mốc từ đầu phải không âm; chỉ CTA dùng mốc không dương tính từ cuối video."});
  if ((beat.role === "cta") !== (beat.kind === "cta"))
    ctx.addIssue({code: "custom", path: ["role"], message: "Vai trò CTA phải khớp loại cảnh CTA."});
});
const range = z.object({min: z.number().finite().nonnegative(), max: z.number().finite().nonnegative()})
  .refine(value => value.min <= value.max, "Khoảng tối thiểu không được lớn hơn tối đa.");
export const viralFormulaSchema = z.object({
  id,
  name: text,
  beats: z.array(formulaBeatSchema).min(1).max(40),
  overlay: z.object({
    position: z.enum(["top-center", "center", "bottom-center"]),
    lines: z.number().int().min(1).max(6),
    changesPerBeat: z.boolean(),
    readableMuted: z.boolean(),
  }),
  labelVariants: z.object({
    problem: z.array(text).max(30).optional(),
    versus_unbox: z.array(text).max(30).optional(),
    result: z.array(text).max(30).optional(),
    cta: z.array(text).max(30).optional(),
  }).strict(),
  ctaPatterns: z.array(text).max(30),
  hookType: z.enum(formulaTaxonomy.hookTypes),
  fitProductTraits: z.array(z.enum(formulaProductTraits)).max(30),
  guardrails: z.array(text).max(40),
  references: z.array(id).max(100),
  version: z.number().int().min(1).max(1_000_000).default(1),
  updatedAt: z.string().datetime({offset: true}).nullable().default(null),
  aspect: z.literal("9:16").optional(),
  durationSec: range.nullable().default(null),
  cuts: range.refine(value => Number.isInteger(value.min) && Number.isInteger(value.max), "Số lần cắt phải là số nguyên.").nullable().default(null),
});
export type ViralFormula = z.infer<typeof viralFormulaSchema>;
export type FormulaBeat = z.infer<typeof formulaBeatSchema>;

export const referenceVideoSchema = z.object({
  id,
  product: text,
  hookText: z.string().max(3000).nullable().default(null),
  ctaText: z.string().max(3000).nullable().default(null),
  durationSec: z.number().finite().positive().max(3600).nullable().default(null),
  cuts: z.number().int().nonnegative().max(10000).nullable().default(null),
  formulaId: id.nullable().default(null),
  notes: z.string().max(5000).default(""),
});
export type ReferenceVideo = z.infer<typeof referenceVideoSchema>;

const seedBeatSchema = z.union([
  z.object({...beatFields, fromSec: second.nonnegative(), toSec: second.nonnegative()}).strict(),
  z.object({...beatFields, fromEndSec: second.nonnegative(), toEndSec: second.nonnegative()}).strict(),
]).transform(beat => "fromEndSec" in beat
  ? {...beatFieldsFor(beat), fromSec: -beat.fromEndSec, toSec: beat.toEndSec === 0 ? 0 : -beat.toEndSec, timeOrigin: "end" as const}
  : {...beat, timeOrigin: "start" as const})
  .pipe(formulaBeatSchema);
function beatFieldsFor(beat: z.infer<z.ZodObject<typeof beatFields>>) {
  return {kind: beat.kind, role: beat.role, label: beat.label, goal: beat.goal};
}
const seedEnvelopeSchema = z.object({
  version: z.number().int().positive(),
  createdAt: z.string().datetime({offset: true}),
  source: text,
  taxonomy: z.object({
    roles: z.array(z.enum(formulaTaxonomy.roles)),
    beatKinds: z.array(z.enum(formulaTaxonomy.beatKinds)),
    hookTypes: z.array(z.enum(formulaTaxonomy.hookTypes)),
    ctaTypes: z.array(z.enum(formulaTaxonomy.ctaTypes)),
  }).refine(value => JSON.stringify(value) === JSON.stringify(formulaTaxonomy), "Không thay đổi taxonomy v1."),
  formulas: z.array(viralFormulaSchema.extend({beats: z.array(seedBeatSchema).min(1).max(40)})).min(1),
  references: z.array(referenceVideoSchema),
  productTraits: z.object({prefer: z.array(text), avoid: z.array(text), flagOnly: z.array(text)}),
  nicheHypotheses: z.array(text),
});

export function parseViralFormulaSeed(input: unknown) {
  const parsed = seedEnvelopeSchema.parse(input);
  const formulas = parsed.formulas.map(formula => viralFormulaSchema.parse({
    ...formula, version: parsed.version, updatedAt: parsed.createdAt,
  }));
  const formulaIds = new Set(formulas.map(formula => formula.id));
  const referenceIds = new Set(parsed.references.map(reference => reference.id));
  if (formulaIds.size !== formulas.length || referenceIds.size !== parsed.references.length)
    throw new Error("ID công thức hoặc video tham khảo bị trùng.");
  for (const formula of formulas) {
    if (formula.references.some(reference => !referenceIds.has(reference)))
      throw new Error(`Công thức ${formula.id} tham chiếu video không tồn tại.`);
  }
  for (const reference of parsed.references) {
    if (reference.formulaId !== null && !formulaIds.has(reference.formulaId))
      throw new Error(`Video ${reference.id} tham chiếu công thức không tồn tại.`);
  }
  return {...parsed, formulas};
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
freeze(formulaTaxonomy);
export const viralFormulaSeed = freeze(parseViralFormulaSeed(seed));
export const viralFormulas = viralFormulaSeed.formulas;
export const referenceVideos = viralFormulaSeed.references;
export function validateFormula(input: unknown) {
  return viralFormulaSchema.safeParse(input);
}
export function viralFormulaRecordId(formula: Pick<ViralFormula, "id" | "version">) {
  return `viral_formula_${formula.id}_v${formula.version}`;
}
type FormulaRecord = {id: string; kind: string; data: unknown};

// Workspace wins on the exact (id, version) pair. Old versions remain intact;
// consumers select the highest version per id, independent of record order.
export function formulaVersions(records: readonly FormulaRecord[] = []): ViralFormula[] {
  const versions = new Map(viralFormulas.map(formula => [viralFormulaRecordId(formula), formula]));
  for (const record of records) {
    if (record.kind !== "viral_formula") continue;
    const parsed = validateFormula(record.data);
    if (parsed.success && record.id === viralFormulaRecordId(parsed.data)) versions.set(record.id, parsed.data);
  }
  return [...versions.values()].sort((a, b) => a.id.localeCompare(b.id) || b.version - a.version);
}
export function workspaceFormulas(records: readonly FormulaRecord[] = []): ViralFormula[] {
  const latest = new Map<string, ViralFormula>();
  for (const formula of formulaVersions(records)) if (!latest.has(formula.id)) latest.set(formula.id, formula);
  return [...latest.values()];
}

// Exact taxonomy traits only; duplicate/unknown traits do not inflate a score.
// This is a content-fit suggestion, never a claim of virality or sales.
export function formulasForProduct(traits: readonly string[], formulas: readonly ViralFormula[] = viralFormulas): ViralFormula[] {
  const requested = new Set(traits);
  return formulas.map(formula => ({formula, score: new Set(formula.fitProductTraits.filter(trait => requested.has(trait))).size}))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.formula.id.localeCompare(b.formula.id))
    .map(row => row.formula);
}

export function referencesForFormula(formula: ViralFormula): ReferenceVideo[] {
  // V10 points to pov-share-bait but is absent from that formula's reference
  // list in the supplied seed. Include both directions without rewriting it.
  return referenceVideos.filter(reference => formula.references.includes(reference.id) || reference.formulaId === formula.id);
}
export function formatBeatTime(beat: FormulaBeat) {
  return beat.timeOrigin === "end"
    ? `${-beat.fromSec}–${-beat.toSec} giây trước khi hết video`
    : `${beat.fromSec}–${beat.toSec} giây từ đầu video`;
}
