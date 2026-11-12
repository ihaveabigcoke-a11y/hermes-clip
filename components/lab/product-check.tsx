"use client";
import {useState} from 'react';
import {type Candidate, candidateCurrency, landedCost} from '@/lib/lab/operations';
import {listingStatus, listingStatusLabels, markupCheck, suggestVerdict, supplierQuestions, manualCheckLinks} from '@/lib/lab/product-check';
import {formatMoney} from '@/lib/lab/domain';
import {Badge, Button} from './primitives';

const usd = (value: number) => '$' + new Intl.NumberFormat('vi-VN', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value);
export function RetailMarkup({candidate, ceilingUsd}: {candidate: Candidate; ceilingUsd: number}) {
  const check = markupCheck(candidate, ceilingUsd);
  return check.typicalRetailUsd != null && check.maxLandedUsd
    ? <span title="Giá điển hình → vốn + ship tối đa theo giả thuyết ×4–×3">{usd(check.typicalRetailUsd)} → ≤ {usd(check.maxLandedUsd[0])}–{usd(check.maxLandedUsd[1])}</span> : <span>—</span>;
}

export function ProductCheck({candidate, ceilingUsd}: {candidate: Candidate; ceilingUsd: number}) {
  const [copied, setCopied] = useState('');
  const suggestion = suggestVerdict(candidate, ceilingUsd), check = markupCheck(candidate, ceilingUsd);
  const questions = supplierQuestions(candidate), landed = landedCost(candidate);
  const currentListing = candidate.listingCheck?.sourceUrl === candidate.supplierUrl ? candidate.listingCheck : null;
  const amount = (key: 'cost' | 'shipping') => candidate[key] == null ? 'Chưa biết' : formatMoney(candidate[key]!, candidateCurrency(candidate, key));
  const missing = [...suggestion.missing];
  if (candidate.competition?.activeAdsObserved == null) missing.push('Số quảng cáo đang chạy: chưa biết.');
  if (candidate.competition?.similarReels30d == null) missing.push('Số Reels tương tự trong 30 ngày: chưa biết.');
  if (!candidate.usRetail?.sources?.length) missing.push('Nguồn và ngày đọc giá bán lẻ; giá khoảng nhập tay chưa đủ để xác minh.');
  else if (candidate.usRetail.sources.some(source => !source.observedAt)) missing.push('Ngày đọc của một số nguồn giá bán lẻ.');
  async function copyQuestions() {
    try { await navigator.clipboard.writeText(questions.join('\n')); setCopied('Đã sao chép câu hỏi.'); }
    catch { setCopied('Chưa sao chép được. Chọn phần câu hỏi bên dưới để sao chép thủ công.'); }
  }
  return <div className="product-check-detail">
    <section aria-label="Đã quan sát"><h3>Đã quan sát</h3>
      <p>Theo dữ liệu đã lưu; nguồn Muse và giá nhập tay cần đối chiếu lại.</p>
      <dl className="preview-facts"><div><dt>Listing gộp</dt><dd>{listingStatusLabels[listingStatus(candidate)]}</dd></div><div><dt>Vốn / ship đã lưu</dt><dd>{amount('cost')} / {amount('shipping')}</dd></div><div><dt>Đối chiếu SKU</dt><dd>{candidate.matchType === 'exact_sku' ? 'Đúng SKU' : candidate.matchType === 'similar' ? 'Sản phẩm tương tự' : 'Chưa biết'}</dd></div><div><dt>IP / thương hiệu</dt><dd>{(['ipRisk', 'brandRisk'] as const).map(key => candidate.logisticsFlags?.[key] == null ? 'Chưa biết' : candidate.logisticsFlags[key] ? 'Có rủi ro' : 'Không ghi nhận').join(' / ')}</dd></div></dl>
      {currentListing && <p>Lần đọc local: {new Date(currentListing.fetchedAt).toLocaleString('vi-VN')} · <a href={currentListing.sourceUrl} target="_blank" rel="noopener noreferrer">Trang đã đọc</a>{currentListing.title ? ` · ${currentListing.title}` : ''}</p>}
      <p>{candidate.ipNotes || 'Chưa có ghi chú bằng sáng chế / kiểu dáng.'}</p>
      {candidate.usRetail && <p>Khoảng giá bán lẻ đã lưu: {candidate.usRetail.low ?? 'Chưa biết'} – {candidate.usRetail.high ?? 'Chưa biết'} {candidate.usRetail.currency ?? '· chưa rõ tiền tệ'}.</p>}
      {candidate.usRetail?.sources?.length ? <ul>{candidate.usRetail.sources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || new URL(source.url).hostname}</a> · {source.price == null ? 'Chưa có giá' : candidate.usRetail?.currency === 'USD' ? usd(source.price) : `${source.price} · chưa rõ tiền tệ`} · {source.observedAt ? new Date(source.observedAt).toLocaleDateString('vi-VN') : 'Chưa rõ ngày đọc'}</li>)}</ul> : <p>Chưa có nguồn bán lẻ Mỹ.</p>}
    </section>
    <section aria-label="Suy luận"><h3>Suy luận</h3>
      <p>Gợi ý kết luận: <Badge tone={suggestion.verdict === 'reject' ? 'error' : 'neutral'}>{{try: 'Thử', hold: 'Giữ', reject: 'Loại'}[suggestion.verdict]}</Badge></p>
      <p>Chỉ là gợi ý; không thay quyết định đã lưu. Hệ số ×3–4 là giả thuyết, chưa tính lợi nhuận hay chứng minh nhu cầu.</p>
      <p><RetailMarkup candidate={candidate} ceilingUsd={ceilingUsd}/> · Trần người dùng: {usd(ceilingUsd)}.</p>
      <p>Vốn + ship: {landed.amount == null ? landed.reason : formatMoney(landed.amount, landed.currency)} · {{ok_x4: 'Đủ ×4', ok_x3: 'Chỉ đủ ×3', fail: 'Chưa đủ ×3', unknown: 'Chưa đủ dữ liệu USD để so'}[check.status]}.</p>
      <ul>{suggestion.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </section>
    <section aria-label="Chưa biết"><h3>Chưa biết</h3><ul>{missing.length ? missing.map(item => <li key={item}>{item}</li>) : <li>Chưa kiểm mẫu thật và khả năng bán. Không có thiếu dữ liệu chính theo quy tắc gợi ý.</li>}</ul></section>
    <h3>Câu hỏi nhà cung cấp</h3><Button tone="neutral" onClick={() => void copyQuestions()}>Sao chép câu hỏi</Button><p role="status">{copied}</p>
    <ol lang="en">{questions.map(question => <li key={question}>{question}</li>)}</ol>
    <h3>Link tự kiểm</h3><p>Mở trang để tự đối chiếu. Link tìm kiếm không phải số lượng đối thủ đã đếm.</p>
    <div className="button-row">{manualCheckLinks(candidate.name).map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
  </div>;
}
