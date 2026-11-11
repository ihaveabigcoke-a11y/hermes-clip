import type { LabRecord } from "@/lib/lab/domain";

export function SampleCheckFields({values, change, errors, records}: {
  values: Record<string, any>;
  change: (name: string, value: any) => void;
  errors: Record<string, string>;
  records: LabRecord[];
}) {
  const sample = values.sampleCheck ?? {receivedAt: null, matchesVideo: null, notes: ""};
  const update = (key: string, value: any) => change("sampleCheck", {...sample, [key]: value});
  const photos: string[] = sample.photos ?? [];
  const assets = records.filter(r => r.kind === "asset" && (r.data.type?.startsWith("image/") || photos.includes(r.id)));
  return <fieldset className="form-grid">
    <legend>Kiểm mẫu thật trước pre-order</legend>
    <div className="field"><label htmlFor="sample-receivedAt">Ngày nhận mẫu</label><input id="sample-receivedAt" type="date" value={sample.receivedAt?.slice(0, 10) ?? ""} onChange={e => update("receivedAt", e.target.value || null)}/></div>
    {([
      ["colorSizeMatches", "Đúng màu/kích thước"],
      ["matchesVideo", "Hiệu ứng như video"],
      ["packagingIntact", "Đóng gói"],
    ] as const).map(([key, label]) => <div className="field" key={key}><label htmlFor={`sample-${key}`}>{label}</label>
      <select id={`sample-${key}`} value={sample[key] == null ? "unknown" : String(sample[key])} onChange={e => update(key, e.target.value === "unknown" ? null : e.target.value === "true")}>
        <option value="unknown">Chưa kiểm</option><option value="true">Đạt</option><option value="false">Không đạt</option>
      </select></div>)}
    <div className="field full"><label htmlFor="sample-notes">Ghi chú kiểm mẫu</label><textarea id="sample-notes" maxLength={2000} value={sample.notes ?? ""} onChange={e => update("notes", e.target.value)}/></div>
    <div className="field full"><label htmlFor="sample-photos">Ảnh mẫu trong Thư viện (không bắt buộc)</label>
      <select id="sample-photos" aria-describedby="sample-photos-help" multiple value={photos} onChange={e => update("photos", Array.from(e.target.selectedOptions, option => option.value))}>
        {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.data.name}</option>)}
        {photos.filter(id => !assets.some(asset => asset.id === id)).map(id => <option key={id} value={id}>Ảnh đã lưu · {id} (chưa tìm thấy)</option>)}
      </select><small id="sample-photos-help">Chọn ảnh mẫu thật đã nhập vào Thư viện; không dùng ảnh AI làm bằng chứng.</small>
    </div>
    {errors.sampleCheck && <p className="field-error" role="alert">{errors.sampleCheck}</p>}
  </fieldset>;
}
