export function parseMuseQuota(text, now = Date.now()) {
  const usage = text.split(/\bUsage\b|Mức sử dụng|Hạn mức sử dụng/i)[1];
  if (!usage) return {state:'unavailable', checkedAt:now, source:'Muse Settings', message:'Muse chưa hiển thị mục Usage.'};
  const weekly = usage.split(/Additional tokens|Token bổ sung/i)[0];
  const additional = usage.split(/Additional tokens|Token bổ sung/i)[1]?.split(/Upgrade|Redeem|Language|Nâng cấp|Ngôn ngữ/i)[0];
  const used = weekly.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:used|đã dùng|đã sử dụng)/i);
  if (!used) return {state:'unavailable', checkedAt:now, source:'Muse Settings', message:'Muse chưa cung cấp phần trăm hạn mức tuần.'};
  const weeklyUsedPercent = Number(used[1].replace(',','.'));
  if (!Number.isFinite(weeklyUsedPercent) || weeklyUsedPercent < 0 || weeklyUsedPercent > 100) {
    return {state:'unavailable', checkedAt:now, source:'Muse Settings', message:'Số liệu hạn mức Muse chưa hợp lệ.'};
  }
  const tokens = additional?.match(/([\d.,]+)\s*([KMB])?\s*tokens?\s*left/i);
  const multiplier = {K:1000,M:1000000,B:1000000000};
  const additionalTokens = tokens ? Number(tokens[1].replaceAll(',','')) * (multiplier[tokens[2]?.toUpperCase()] ?? 1) : null;
  return {
    state: weeklyUsedPercent < 100 || additionalTokens > 0 ? 'available' : additionalTokens === 0 ? 'exhausted' : 'unavailable', checkedAt:now, source:'Muse Settings · Usage',
    plan:weekly.trim().split('\n')[0], weeklyUsedPercent, weeklyRemainingPercent:100-weeklyUsedPercent,
    resetLabel:weekly.match(/(?:Weekly limit resets on|Đặt lại hạn mức tuần vào)\s*([^\n]+)/i)?.[1]?.trim() ?? null,
    additionalTokens, additionalTokensLabel:tokens?.[0] ?? null,
    additionalUsedPercent:additional?.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:used|đã dùng|đã sử dụng)/i)?.[1] ?? null,
  };
}

export function museQuotaExhausted(quota) {
  return quota?.state === 'exhausted' || (quota?.weeklyRemainingPercent === 0 && quota?.additionalTokens === 0);
}

export async function readMuseQuota(page, adapter) {
  if (!await adapter.session(page)) return {state:'login_required',checkedAt:Date.now(),source:'Muse Settings',message:'Đăng nhập Muse để đọc hạn mức.'};
  const settings = page.getByRole('button',{name:'Settings',exact:true});
  await settings.click({timeout:15000});
  await page.getByText('Settings',{exact:true}).click({timeout:10000});
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Usage',{exact:true}).waitFor({state:'visible',timeout:15000});
  await dialog.getByText(/^\d+(?:[.,]\d+)?%\s+used$/i).waitFor({state:'visible',timeout:15000});
  return parseMuseQuota(await dialog.innerText());
}
