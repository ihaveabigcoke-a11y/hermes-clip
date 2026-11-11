"use client";
import {useEffect, useState} from "react";
import {z} from "zod";
import {Button, Badge, Modal, RecordForm, api} from "./primitives";
import {desktopBridge} from "@/lib/lab/desktop-client";
import {formatTime} from "@/lib/lab/domain";

const validation = z.object({model: z.string().trim().max(120).regex(/^[a-zA-Z0-9._/-]*$/),
  dailyLimit: z.number().int().min(0).max(20), apiKey: z.string().trim().max(500), clearKey: z.boolean()});

export default function AssistantSettings({demo}: {demo: boolean}) {
  const [status, setStatus] = useState<any>(null);
  const [proof, setProof] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const bridge = desktopBridge();
    if (!demo && bridge?.assistantSettings) {
      void Promise.all([bridge.assistantSettings(), api("/api/assistant")]).then(([settings, evidence]) => {
        if (live) { setStatus(settings); setProof(evidence); }
      }).catch(failure => { if (live) setError(failure.message); });
    }
    return () => { live = false; };
  }, [demo]);
  return <section className="production-card production-card-body">
    <header><h3>Gemini viết kịch bản</h3><Badge tone={proof?.connected ? "success" : "warning"}>{proof?.connected ? "Đã nhận kết quả" : status?.configured ? "Đã cấu hình · chờ kiểm chứng" : "Chưa cấu hình"}</Badge></header>
    <p>{status?.model || "Chọn model và giới hạn lượt/ngày để sử dụng."}{status?.dailyLimit > 0 && ` · ${status.dailyLimit} lượt/ngày`}</p>
    {proof?.verifiedAt && <p>Kết quả gần nhất {formatTime(proof.verifiedAt)}</p>}
    <p>Khóa được mã hóa bằng kho bảo mật Windows. Gọi model từ bước soạn kịch bản trong Tạo video.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Button tone="neutral" disabled={demo || !desktopBridge()?.assistantSettings} onClick={() => { setDirty(false); setOpen(true); }}>Cấu hình Gemini trên máy</Button>
    <Modal open={open} title="Cấu hình Gemini trên máy" dirty={dirty} locked={busy} onClose={() => setOpen(false)}>
      <RecordForm kind="settings" initial={{model: status?.model ?? "", dailyLimit: status?.dailyLimit ?? 0, apiKey: "", clearKey: false}} validation={validation}
        fields={[{name: "model", label: "Model Gemini", help: "Điền model tài khoản của bạn được phép dùng."},
          {name: "dailyLimit", label: "Lượt tối đa mỗi ngày", type: "number", help: "Nhập 0 để tắt hoặc chọn từ 1 đến 20 lượt mỗi ngày."},
          {name: "apiKey", label: "Khóa API Gemini", type: "password", full: true, help: status?.hasKey ? "Để trống để giữ khóa đã mã hóa." : "Nhập khóa trực tiếp tại đây."},
          {name: "clearKey", label: "Xóa khóa đã lưu", type: "checkbox"}]}
        onDirty={setDirty} onCancel={() => setOpen(false)} onSave={async value => {
          setBusy(true);
          try {
            setStatus(await desktopBridge()!.saveAssistantSettings(value));
            window.dispatchEvent(new Event('product-lab:assistant-settings-changed'));
            setProof(await api("/api/assistant"));
            setError(""); setDirty(false); setOpen(false);
          } finally { setBusy(false); }
        }}/>
    </Modal>
  </section>;
}
