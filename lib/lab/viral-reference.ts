import {z} from 'zod';
import {formulaBeatSchema, formulaProductTraits, formulaTaxonomy, formulasForProduct, referenceVideoSchema,
  viralFormulas, viralFormulaSchema, type ViralFormula} from './viral-formulas.ts';
import {analysisWithinDuration, formulaAnalysisPrompt, savedFormulaAnalysisSchema} from './formula-analysis.ts';

const positive = z.number().finite().positive();
const contactSheetSchema = z.object({
  path: z.string().min(1).max(2000), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  fromSec: z.number().finite().nonnegative(), toSec: positive.max(180), secondsPerFrame: positive,
  columns: positive.int().max(15), rows: positive.int().max(15), frameCount: positive.int().max(225).optional(),
  frameWidth: positive.int().max(200).optional(), frameHeight: positive.int().max(400).optional(),
}).refine(s => s.fromSec < s.toSec, 'Khoảng thời gian sheet không hợp lệ.');
export const videoStructureSchema = z.object({
  durationSec: positive.max(180),
  width: positive.int().nullable().default(null), height: positive.int().nullable().default(null),
  aspectRatio: z.string().max(50).nullable().default(null),
  gridColumns: positive.int().max(15).nullable().default(null),
  cuts: z.array(positive).max(10000), cutCount: z.number().int().nonnegative().max(10000),
  contactSheetPath: z.string().min(1).max(2000),
  contactSheets: z.object({sparse: contactSheetSchema, dense: z.array(contactSheetSchema).max(6)}).optional(),
  frames: z.array(z.object({t: z.number().finite().nonnegative(), path: z.string().min(1).max(2000)})).min(1).max(225),
}).superRefine((value, ctx) => {
  if (value.cutCount !== value.cuts.length || value.cuts.some((t, i) => t >= value.durationSec || (i > 0 && t <= value.cuts[i - 1])))
    ctx.addIssue({code: 'custom', message: 'Mốc cắt phải tăng dần, trong video và khớp số lần cắt.'});
  if (value.frames.some((f, i) => f.t >= value.durationSec || (i > 0 && f.t <= value.frames[i - 1].t)))
    ctx.addIssue({code: 'custom', message: 'Mốc khung hình phải tăng dần và trong video.'});
  if (value.contactSheets && (value.contactSheets.sparse.path !== value.contactSheetPath ||
      value.contactSheets.dense.some((s, i) => s.columns !== 11 || s.rows > 11 || s.secondsPerFrame !== .25 ||
        (s.frameCount !== undefined && (s.frameCount > 120 || s.rows !== Math.ceil(s.frameCount / 11))) ||
        s.toSec > value.durationSec || s.fromSec !== (i ? value.contactSheets!.dense[i - 1].toSec : 0))))
    ctx.addIssue({code: 'custom', message: 'Sheet dày phải liên tục, 4 fps và tối đa 120 khung hình mỗi tấm.'});
});
export type VideoStructure = z.infer<typeof videoStructureSchema>;

export const referenceVideoDraftSchema = referenceVideoSchema.extend({
  proposedFormula:viralFormulaSchema.optional(),
  status: z.literal('draft').default('draft'),
  formulaVersion: z.number().int().positive().nullable().default(null),
  integrationJobId: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).nullable().default(null),
  projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).nullable().default(null),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  sourceUrl: z.string().url().max(2048).nullable().default(null),
  structure: videoStructureSchema.nullable().default(null),
  beats: z.array(formulaBeatSchema).min(1).max(40).nullable().default(null),
  hookType: z.enum(formulaTaxonomy.hookTypes).nullable().default(null),
  ctaType: z.enum(formulaTaxonomy.ctaTypes).nullable().default(null),
  ctaKeyword: z.string().max(200).nullable().default(null),
  productTraits: z.array(z.enum(formulaProductTraits)).max(30).nullable().default(null),
  caption: z.string().max(2200).nullable().optional(),
  fileName: z.string().max(1000).nullable().optional(),
  analysis: savedFormulaAnalysisSchema.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.structure && (value.durationSec !== value.structure.durationSec || value.cuts !== value.structure.cutCount))
    ctx.addIssue({code: 'custom', message: 'Thời lượng và số cắt phải khớp phân tích.'});
  if (value.beats && (value.durationSec === null || value.beats.some((beat, i) => beat.timeOrigin !== 'start' ||
      beat.toSec > value.durationSec! || (i === 0 ? beat.fromSec !== 0 : beat.fromSec !== value.beats![i - 1].toSec)) ||
      value.beats.at(-1)!.toSec !== value.durationSec))
    ctx.addIssue({code: 'custom', message: 'Beat nháp phải phủ liên tục từ đầu đến hết video.'});
  if (value.analysis && (!value.structure || value.analysis.durationSec !== value.structure.durationSec ||
      value.analysis.cutCount !== value.structure.cutCount || !analysisWithinDuration(value.analysis, value.structure)))
    ctx.addIssue({code: 'custom', message: 'Phân tích JSON phải khớp số đo và nằm trong thời lượng video.'});
  if (value.analysis && (value.analysis.ctaSource === 'caption' || value.analysis.ctaSource === 'filename')) {
    const source = value.analysis.ctaSource === 'caption' ? value.caption : value.fileName;
    if (!value.analysis.ctaKeyword?.trim() || !source?.toLowerCase().includes(value.analysis.ctaKeyword.toLowerCase()))
      ctx.addIssue({code: 'custom', message: 'Nguồn CTA không chứa từ khóa; đọc lại kết quả JSON để đối chiếu.'});
  }
});
export type ReferenceVideoDraft = z.infer<typeof referenceVideoDraftSchema>;
export const referenceDraftRecordId = (draft: Pick<ReferenceVideoDraft, 'id'>) => `reference_video_draft_${draft.id}`;

// Time/scene observations only. Labels and semantic classifications stay blank.
// The selected template proposes roles; it is not evidence of what the clip says.
export function draftReferenceVideo(input: {
  id: string; product: string; structure: unknown; integrationJobId?: string; projectId?: string;
  sourceSha256?: string; sourceUrl?: string | null; traits?: readonly string[]; formula?: ViralFormula;
}): ReferenceVideoDraft {
  const structure = videoStructureSchema.parse(input.structure);
  const formula = viralFormulaSchema.parse(input.formula ?? formulasForProduct(input.traits ?? [])[0] ?? viralFormulas.find(f => f.id === 'problem-vs-result-cta')!);
  const weights = formula.beats.map(beat => beat.toSec - beat.fromSec), total = weights.reduce((sum, n) => sum + n, 0);
  const boundaries = [0];
  let elapsed = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    elapsed += weights[i];
    const target = structure.durationSec * elapsed / total, previous = boundaries.at(-1)!;
    const nextTarget = structure.durationSec * (elapsed + weights[i + 1]) / total;
    const nearest = structure.cuts.filter(t => t > previous && t < nextTarget)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
    // Keep very distant cuts from replacing a template's proportional boundary.
    const boundary = nearest !== undefined && Math.abs(nearest - target) <= structure.durationSec / weights.length
      ? nearest : Math.max(target, previous + (nextTarget - previous) / 2);
    boundaries.push(boundary);
  }
  boundaries.push(structure.durationSec);
  return referenceVideoDraftSchema.parse({id: input.id, product: input.product, hookText: '', ctaText: '',
    durationSec: structure.durationSec, cuts: structure.cutCount, formulaId: formula.id, formulaVersion: formula.version,
    integrationJobId: input.integrationJobId ?? null, sourceSha256: input.sourceSha256 ?? null, sourceUrl: input.sourceUrl ?? null,
    projectId: input.projectId ?? null,
    structure, beats: formula.beats.map((beat, i) => ({kind: beat.kind, role: beat.role, label: '',
      goal: 'Template timing proposal; review against the source video.', timeOrigin: 'start', fromSec: boundaries[i], toSec: boundaries[i + 1]})),
    notes: 'Nháp tất định theo tỷ lệ thời gian công thức và mốc cắt gần nhất; chưa đọc chữ, chưa xác minh ý nghĩa cảnh. Chưa áp vào công thức chính.',
  });
}

export function referenceMusePrompt(input: {structure: unknown; beats?: ReferenceVideoDraft['beats']}) {
  return formulaAnalysisPrompt({structure: videoStructureSchema.parse(input.structure), formulas: viralFormulas});
}
