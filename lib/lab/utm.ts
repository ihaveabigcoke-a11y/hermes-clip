type UtmInput = {
  productSlug: string;
  accountHandle: string;
  planId: string;
  hookId?: string | null;
  ctaKeyword: string;
};

export function isHttpsLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

function slug(value: string, label: string, handle = false): string {
  const result = value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
    // Dots and underscores distinguish real Instagram handles (a.b vs a_b).
    .replace(handle ? /[^a-z0-9._]+/g : /[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/[a-z0-9]/.test(result)) throw Error(`Thiếu ${label} để tạo link UTM.`);
  return result;
}

/** Pure URL construction. A plan ID identifies the hook until a variant is selected. */
export function buildUtmLink(baseUrl: string, input: UtmInput): string {
  if (!isHttpsLink(baseUrl)) throw Error('Link landing phải là URL HTTPS hợp lệ, không chứa thông tin đăng nhập.');
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'dm');
  url.searchParams.set('utm_campaign', slug(input.productSlug, 'tên sản phẩm'));
  url.searchParams.set('utm_content', `${slug(input.accountHandle, 'tên người dùng Instagram', true)}-${slug(input.hookId?.trim() || input.planId, 'mã hook hoặc kế hoạch')}`);
  url.searchParams.set('utm_term', slug(input.ctaKeyword, 'từ khóa CTA'));
  return url.href;
}

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
