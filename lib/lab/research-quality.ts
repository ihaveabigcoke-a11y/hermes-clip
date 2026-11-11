import type {Candidate} from './operations.ts';

export const sharedSourceWarning = 'Dùng chung trang nguồn';
export const pageLevelEvidenceWarning = 'Số liệu cấp trang · không dùng để so';

const productName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
// Ignore fragments/trailing slashes, but retain query parameters that can identify SKUs.
function sourceKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href;
  } catch { return value.trim(); }
}
const metricKey = (metric: Candidate['marketEvidence'][number]) => JSON.stringify([metric.value, metric.unit, sourceKey(metric.sourceUrl)]);

/** Pure, local annotations. Keep original values, labels, dates, URLs and selections.
 * Check all candidates before filtering the display. Recompute only derived flags,
 * so corrections clear stale warnings; unchanged inputs retain their identity.
 */
export function annotateResearchQuality(candidates: Candidate[]): Candidate[] {
  const suppliers = new Map<string, Set<string>>();
  const metrics = new Map<string, Set<number>>();
  candidates.forEach((candidate, index) => {
    const source = sourceKey(candidate.supplierUrl);
    const names = suppliers.get(source) ?? new Set<string>();
    names.add(productName(candidate.name));
    suppliers.set(source, names);
    for (const metric of candidate.marketEvidence ?? []) {
      const key = metricKey(metric), owners = metrics.get(key) ?? new Set<number>();
      owners.add(index);
      metrics.set(key, owners);
    }
  });
  const annotated = candidates.map(candidate => {
    const shared = (suppliers.get(sourceKey(candidate.supplierUrl))?.size ?? 0) >= 2;
    const qualityWarnings: Candidate['qualityWarnings'] = shared ? ['shared_supplier_url'] : [];
    let changed = shared !== (candidate.qualityWarnings ?? []).includes('shared_supplier_url');
    const marketEvidence = (candidate.marketEvidence ?? []).map(metric => {
      const pageLevel = (metrics.get(metricKey(metric))?.size ?? 0) >= 2;
      if (pageLevel === (metric.pageLevel ?? false)) return metric;
      changed = true;
      return {...metric, pageLevel};
    });
    return changed ? {...candidate, qualityWarnings, marketEvidence} : candidate;
  });
  return annotated.some((candidate, index) => candidate !== candidates[index]) ? annotated : candidates;
}
