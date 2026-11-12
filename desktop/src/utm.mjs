export function isHttpsLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

function slug(value, label, handle = false) {
  const result = value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
    // Dots and underscores distinguish real Instagram handles (a.b vs a_b).
    .replace(handle ? /[^a-z0-9._]+/g : /[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/[a-z0-9]/.test(result)) throw Error(`Thiếu ${label} để tạo link UTM.`);
  return result;
}

/** Pure URL construction. A plan ID identifies the hook until a variant is selected. */
export function buildUtmLink(baseUrl, input) {
  if (!isHttpsLink(baseUrl)) throw Error('Link landing phải là URL HTTPS hợp lệ, không chứa thông tin đăng nhập.');
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'dm');
  url.searchParams.set('utm_campaign', slug(input.productSlug, 'tên sản phẩm'));
  url.searchParams.set('utm_content', `${slug(input.accountHandle, 'tên người dùng Instagram', true)}-${slug(input.hookId?.trim() || input.planId, 'mã hook hoặc kế hoạch')}`);
  url.searchParams.set('utm_term', slug(input.ctaKeyword, 'từ khóa CTA'));
  return url.href;
}

