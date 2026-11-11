"use client";
import {useRef, useState} from 'react';
import {type LabRecord, validationMessage} from '@/lib/lab/domain';
import {contentPlanSchema} from '@/lib/lab/operations';
import {buildUtmLink, planUtmContext} from '@/lib/lab/utm';
import {Button} from './primitives';

type Props = {
  plan: LabRecord; records: LabRecord[]; disabled: boolean;
  onSave: (plan: LabRecord, data: Record<string, any>) => Promise<LabRecord>;
};

export default function PlanUtmLink({plan, records, disabled, onSave}: Props) {
  const context = planUtmContext(records, plan);
  const [baseUrl, setBaseUrl] = useState(plan.data.landingBaseUrl ?? context.landing?.data.ctaUrl ?? '');
  const [hookId, setHookId] = useState<string>(context.hookId);
  const [keywordOverride, setKeywordOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const variant = context.variants.find(row => row.id === hookId);
  const keyword = keywordOverride ?? plan.data.ctaKeyword ?? variant?.ctaKeyword ?? '';
  const handle = context.account?.data.handle ?? '';
  const savedLink = plan.data.utmLink ?? '';
  function change() { setMessage(''); setError(''); }
  async function generate() {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); change();
    try {
      if (hookId && !variant) throw Error('Biến thể đã thay đổi. Chọn lại hook trước khi tạo link.');
      const utmLink = buildUtmLink(baseUrl, {productSlug: context.product?.data.name ?? '', accountHandle: handle,
        planId: plan.id, hookId, ctaKeyword: keyword});
      const parsed = contentPlanSchema.safeParse({...plan.data, landingBaseUrl: baseUrl, utmHookId: hookId,
        ctaKeyword: keyword, utmLink});
      if (!parsed.success) throw Error(parsed.error.issues.map(validationMessage).join(' '));
      await onSave(plan, parsed.data);
      setMessage('Đã tạo và lưu link UTM vào kế hoạch.');
    } catch (failure) { setError((failure as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function copy() {
    change();
    try { await navigator.clipboard.writeText(savedLink); setMessage('Đã sao chép link UTM đã lưu.'); }
    catch { setError('Chưa sao chép được. Chọn và sao chép link đã lưu trong ô bên dưới.'); }
  }
  return <section className="production-card production-card-body" aria-label="Link UTM cho kế hoạch">
    <h3>Link UTM cho DM</h3>
    <p>Tài khoản đã lưu: {handle ? `@${handle}` : 'Chưa có tên người dùng — cập nhật trong hồ sơ và Sửa nội dung.'}</p>
    <label className="field">Link landing gốc<input type="url" value={baseUrl} disabled={disabled || busy}
      placeholder="https://example.com/product" onChange={event => {setBaseUrl(event.target.value); change();}}/></label>
    <small>Mặc định lấy URL đích của nút CTA trong bản nháp landing. Kiểm tra đây là trang muốn gửi qua DM.</small>
    <label className="field">Biến thể / hook cho link<select aria-label="Biến thể / hook cho link" value={hookId} disabled={disabled || busy}
      onChange={event => {setHookId(event.target.value); setKeywordOverride(null); change();}}>
      <option value="">Dùng mã kế hoạch · {plan.id}</option>
      {hookId && !variant && <option value={hookId}>Biến thể đã thay đổi · chọn lại</option>}
      {context.variants.map(row => <option key={row.id} value={row.id}>{row.name ?? row.id} · {row.id}</option>)}
    </select></label>
    <label className="field">Từ khóa CTA cho link<input value={keyword} disabled={disabled || busy} placeholder="LED / RUN / HELP"
      onChange={event => {setKeywordOverride(event.target.value); change();}}/></label>
    <small>Dùng tài khoản đã lưu trong kế hoạch. Chọn hook A/B để phân biệt biến thể; nếu chưa gắn hook, dùng mã kế hoạch. Khi đổi tài khoản, hook hoặc CTA, tạo và lưu lại link.</small>
    <div className="button-row">
      <Button tone="neutral" disabled={disabled || busy} onClick={() => void generate()}>{busy ? 'Đang lưu…' : 'Tạo và lưu link UTM'}</Button>
      <Button tone="ghost" disabled={busy || !savedLink} onClick={() => void copy()}>Sao chép link UTM</Button>
    </div>
    <label className="field">Link UTM đã lưu<input readOnly value={savedLink} title={savedLink || undefined} placeholder="Chưa tạo link UTM"/></label>
    {message && <p role="status">{message}</p>}{error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
