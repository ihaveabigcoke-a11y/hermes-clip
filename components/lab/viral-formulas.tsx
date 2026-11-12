"use client";

import type { LabRecord } from "@/lib/lab/domain";
import ReferenceVideoPanel from './reference-video';
import type { ReferenceVideoDraft } from '@/lib/lab/viral-reference';
import {
  formatBeatTime, referencesForFormula, viralFormulaSeed, workspaceFormulas, type ViralFormula,
} from "@/lib/lab/viral-formulas";

const roleLabels = {hook: "Mở đầu", body: "Nội dung", cta: "Kêu gọi hành động"};
const kindLabels = {problem: "Vấn đề", versus_unbox: "So sánh / mở hộp", result: "Kết quả", cta: "Kêu gọi hành động"};
const hookLabels = {
  problem_label: "Nhãn vấn đề", pov_share_bait: "Góc nhìn gợi chia sẻ", do_not_show: "Đừng cho nhóm này xem",
  think_vs_actually: "Tưởng vậy nhưng thực tế", authority_check: "Kiểm tra bởi người có thẩm quyền",
  audience_callout: "Gọi đúng nhóm khách", emotional_story: "Câu chuyện cảm xúc",
};
const traitLabels = {
  visual_payoff_one_frame: "Kết quả rõ trong một khung hình", night_glow: "Phát sáng ban đêm",
  pet: "Thú cưng", safety: "An toàn", running: "Chạy bộ", cycling: "Đạp xe", hobby_group: "Nhóm cùng sở thích",
  identity: "Bản sắc", apparel: "May mặc", beauty: "Làm đẹp", routine: "Thói quen", family: "Gia đình", senior: "Người cao tuổi",
};
const positionLabels = {"top-center": "phía trên, chính giữa", center: "chính giữa", "bottom-center": "phía dưới, chính giữa"};

export default function ViralFormulas({records,disabled,onSaveDraft,onSaveFormula}: {records: LabRecord[]; disabled?: boolean; onSaveDraft?: (draft:ReferenceVideoDraft, revision:number)=>Promise<unknown>; onSaveFormula?: (formula:ViralFormula)=>Promise<unknown>}) {
  const formulas = workspaceFormulas(records);
  return <details className="info-panel">
    <summary><strong>Công thức video</strong> · {formulas.length} công thức</summary>
    {onSaveDraft&&<ReferenceVideoPanel records={records} disabled={disabled} onSaveDraft={onSaveDraft} onSaveFormula={onSaveFormula}/>}
    <p>{viralFormulaSeed.source}</p>
    <p>Đang xem phiên bản mới nhất. Mốc cảnh là gợi ý; CTA tính từ cuối video có thể chồng lên cảnh kết quả. Chưa có bằng chứng về hiệu quả bán hàng.</p>
    {formulas.map(formula => {
      const references = referencesForFormula(formula);
      const missingReferences = formula.references.filter(id => !references.some(reference => reference.id === id));
      return <details key={formula.id} className="production-card production-card-body">
        <summary><strong>{formula.name}</strong> · Phiên bản {formula.version}</summary>
        <p>Kiểu mở đầu: {hookLabels[formula.hookType]}. Cập nhật: {formula.updatedAt ? new Date(formula.updatedAt).toLocaleString("vi-VN") : "Chưa biết"}.</p>
        <p>Phù hợp: {formula.fitProductTraits.length ? formula.fitProductTraits.map(trait => traitLabels[trait]).join(" · ") : "Chưa xác định"}.</p>
        <p>Chữ trên màn hình: {positionLabels[formula.overlay.position]}, {formula.overlay.lines} dòng; {formula.overlay.changesPerBeat ? "đổi theo cảnh" : "giữ xuyên cảnh"}; {formula.overlay.readableMuted ? "đọc được khi tắt tiếng" : "cần kiểm tra khi tắt tiếng"}.</p>
        <ol>{formula.beats.map((beat, index) => <li key={index}>
          <strong>{roleLabels[beat.role]} · {kindLabels[beat.kind]} · {formatBeatTime(beat)}</strong>
          <p>Nhãn chữ: {beat.label || "Không có"}</p><p>{beat.goal}</p>
        </li>)}</ol>
        {Object.entries(formula.labelVariants).map(([kind, labels]) => <p key={kind}>
          Biến thể nhãn ({kindLabels[kind as keyof typeof kindLabels]}): {labels?.join(" / ")}
        </p>)}
        <p>Mẫu kêu gọi hành động: {formula.ctaPatterns.length ? formula.ctaPatterns.join(" / ") : "Chưa có"}</p>
        <h3>Điều cần giữ khi áp dụng</h3>
        {formula.guardrails.length ? <ul>{formula.guardrails.map((guardrail, index) => <li key={index}>{guardrail}</li>)}</ul> : <p>Chưa ghi giới hạn riêng cho công thức này.</p>}
        <h3>Video tham khảo</h3>
        {references.map(reference => <details key={reference.id}>
          <summary>{reference.id} · {reference.product} · {reference.durationSec === null ? "Chưa biết thời lượng" : `${reference.durationSec} giây`} · {reference.cuts === null ? "Chưa biết số lần cắt" : `${reference.cuts} lần cắt`}</summary>
          <p>Chữ mở đầu: {reference.hookText ?? "Chưa biết"}</p>
          <p>Chữ kêu gọi hành động: {reference.ctaText ?? "Chưa biết"}</p>
          {reference.notes && <p>{reference.notes}</p>}
        </details>)}
        {missingReferences.map(id => <p key={id}>{id} · Chưa có phân tích video trong thư viện.</p>)}
        {!references.length && !missingReferences.length && <p>Chưa có video tham khảo.</p>}
      </details>;
    })}
  </details>;
}
