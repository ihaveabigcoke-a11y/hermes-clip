import type { LabRecord } from "./domain.ts";

export type ProductStage = 0 | 1 | 2 | 3;

const publishedStatuses = new Set([
  "published",
  "published_manual",
  "published_browser",
]);

/** Highest recorded workflow stage; this does not grant approval to publish or sell. */
export function productStage(
  product: LabRecord,
  records: readonly LabRecord[],
): ProductStage {
  const related = records.filter(
    (record) => record.data.productId === product.id && !record.data.archived,
  );
  const plans = related.filter((record) => record.kind === "content_plan");
  const experiments = related.filter((record) => record.kind === "experiment");
  const planIds = new Set(plans.map((record) => record.id));
  const experimentIds = new Set(experiments.map((record) => record.id));

  if (
    plans.some((plan) => publishedStatuses.has(plan.data.status)) ||
    experiments.some((experiment) => experiment.data.status === "running") ||
    records.some(
      (record) =>
        (record.kind === "social_metric" && planIds.has(record.data.planId)) ||
        (record.kind === "metric" && experimentIds.has(record.data.experimentId)),
    )
  )
    return 3;

  if (related.some((record) => ["production", "creative"].includes(record.kind)))
    return 2;

  const notes =
    typeof product.data.proofNotes === "string" ? product.data.proofNotes.trim() : "";
  const proofUrl =
    typeof product.data.proofUrl === "string" ? product.data.proofUrl.trim() : "";
  // Promotion copies unverified Muse research into proofNotes. It is not sample/quote proof.
  // Use stored provenance first; legacy products may have only the old prefix.
  const hasResearchNotes = product.data.researchOrigin != null ||
    notes.startsWith("Muse đề xuất · cần kiểm tra nguồn");
  const hasProofNotes =
    notes && !hasResearchNotes;
  if (product.data.sampleCheck?.matchesVideo === true || product.data.sampleVerified === true || proofUrl || hasProofNotes) return 1;
  return 0;
}
