"use client";
import type {Candidate} from '@/lib/lab/operations';
import {Button} from './primitives';

type Props = {values: Record<string, any>; change: (name: string, value: any) => void; errors: Record<string, string>};
export function ProductCheckFields({values, change, errors}: Props) {
  const retail: NonNullable<Candidate['usRetail']> = values.usRetail ?? {low: null, high: null, currency: null, sources: []};
  const setRetail = (patch: Partial<typeof retail>) => change('usRetail', {...retail, ...patch});
  const number = (value: string) => value === '' ? null : Number(value);
  const setSource = (index: number, patch: Partial<typeof retail.sources[number]>) =>
    setRetail({sources: retail.sources.map((source, i) => i === index ? {...source, ...patch} : source)});
  return <div className="field full product-check-fields">
    <h3>Bán lẻ Mỹ · bản generic</h3>
    <p>Nhập giá từ trang đã mở. Để trống nếu chưa biết; tối đa 4 nguồn, chỉ URL HTTPS.</p>
    <div className="research-structured-fields">
      <label className="field">Giá bán lẻ thấp<input type="number" min="0" step="any" value={retail.low ?? ''} onChange={e => setRetail({low: number(e.target.value)})}/></label>
      <label className="field">Giá bán lẻ cao<input type="number" min="0" step="any" value={retail.high ?? ''} onChange={e => setRetail({high: number(e.target.value)})}/></label>
      <label className="field">Tiền tệ bán lẻ<select aria-label="Tiền tệ bán lẻ" value={retail.currency ?? ''} onChange={e => setRetail({currency: e.target.value === 'USD' ? 'USD' : null})}><option value="">Chưa biết</option><option value="USD">USD</option></select></label>
    </div>
    {retail.sources.map((source, index) => <fieldset key={index} className="info-panel">
      <legend>Nguồn bán lẻ {index + 1}</legend>
      <label className="field">URL nguồn {index + 1}<input type="url" value={source.url} aria-invalid={!!errors.usRetail} onChange={e => setSource(index, {url: e.target.value})}/></label>
      <label className="field">Tiêu đề nguồn {index + 1}<input value={source.title ?? ''} maxLength={300} onChange={e => setSource(index, {title: e.target.value || null})}/></label>
      <label className="field">Giá nguồn {index + 1} (USD)<input type="number" min="0" step="any" value={source.price ?? ''} onChange={e => setSource(index, {price: number(e.target.value)})}/></label>
      <label className="field">Ngày đọc nguồn {index + 1}<input type="date" value={source.observedAt?.slice(0, 10) ?? ''} onChange={e => setSource(index, {observedAt: e.target.value ? `${e.target.value}T00:00:00Z` : null})}/></label>
      <Button type="button" tone="ghost" onClick={() => setRetail({sources: retail.sources.filter((_, i) => i !== index)})}>Bỏ nguồn {index + 1}</Button>
    </fieldset>)}
    <div className="button-row"><Button type="button" tone="neutral" disabled={retail.sources.length >= 4} onClick={() => setRetail({sources: [...retail.sources, {url: '', title: null, price: null, observedAt: null}]})}>Thêm nguồn bán lẻ</Button>
      <Button type="button" tone="ghost" onClick={() => change('usRetail', null)}>Để giá bán lẻ chưa biết</Button></div>
    {errors.usRetail && <p className="inline-error" role="alert">{errors.usRetail}</p>}
    <label className="field">Rủi ro bằng sáng chế / kiểu dáng<select aria-label="Rủi ro bằng sáng chế / kiểu dáng" value={values.logisticsFlags?.ipRisk == null ? '' : String(values.logisticsFlags.ipRisk)} onChange={e => change('logisticsFlags', {...values.logisticsFlags, ipRisk: e.target.value === '' ? null : e.target.value === 'true'})}>
      <option value="">Chưa biết</option><option value="true">Có rủi ro</option><option value="false">Không ghi nhận sau kiểm tra</option>
    </select></label>
    <label className="field">Ghi chú IP<textarea aria-label="Ghi chú IP" rows={3} maxLength={600} value={values.ipNotes ?? ''} aria-invalid={!!errors.ipNotes} onChange={e => change('ipNotes', e.target.value || null)}/></label>
    {errors.ipNotes && <p className="inline-error" role="alert">{errors.ipNotes}</p>}
  </div>;
}
