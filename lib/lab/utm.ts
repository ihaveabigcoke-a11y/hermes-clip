type UtmInput = {
  productSlug: string;
  accountHandle: string;
  planId: string;
  hookId?: string | null;
  ctaKeyword: string;
};

import {buildUtmLink as buildLink, isHttpsLink} from '../../desktop/src/utm.mjs';
export {isHttpsLink};
export function buildUtmLink(baseUrl:string,input:UtmInput):string { return buildLink(baseUrl,input); }

type Row = {id: string; kind: string; data: Record<string, any>};
type Variant = {id: string; name?: string; ctaKeyword?: string | null};

/** Resolve only saved relationships for this product, never a first-account/video guess. */
export function planUtmContext(records: Row[], plan: Row) {
  const product = records.find(row => row.kind === 'product' && row.id === plan.data.productId);
  const account = records.find(row => row.kind === 'social_account' && row.id === plan.data.accountId && row.data.productId === plan.data.productId);
  const landing = records.find(row => row.kind === 'landing_page' && row.data.productId === plan.data.productId);
  const projects = records.filter(row => row.kind === 'production' && row.data.productId === plan.data.productId
    && (plan.data.productionId ? row.id === plan.data.productionId : row.data.contentPlanId === plan.id));
  const project = projects.length === 1 ? projects[0] : null;
  const variants: Variant[] = Array.isArray(project?.data.variants) ? project.data.variants : [];
  const exports = (project?.data.exports ?? []).filter((entry: any) => entry.kind === 'render' && plan.data.assetId && entry.assetId === plan.data.assetId);
  const matching = plan.data.assetId ? variants.filter(variant => exports.some((entry: any) => entry.variantId === variant.id)) : variants;
  const hookId = plan.data.utmHookId ?? (matching.length === 1 ? matching[0].id : '');
  return {product, account, landing, variants, hookId};
}
