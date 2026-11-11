"use client";
import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Loader2,
  X,
  Search,
  Upload,
  AlertCircle,
  CheckCircle2,
  Inbox,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button as BaseButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { schemas, validationMessage, type Kind } from "@/lib/lab/domain";
import { probeFile } from "@/lib/lab/client-media";

export function Button({
  children,
  busy = false,
  tone = "primary",
  className = "",
  ...props
}: React.ComponentProps<typeof BaseButton> & {
  busy?: boolean;
  tone?: "primary" | "neutral" | "ghost" | "danger";
}) {
  return (
    <BaseButton
      {...props}
      variant={
        tone === "primary"
          ? "default"
          : tone === "ghost"
            ? "ghost"
            : tone === "danger"
              ? "destructive"
              : "outline"
      }
      className={`lab-button ${tone} ${className}`}
      disabled={busy || props.disabled}
      aria-busy={busy}
    >
      {busy ? <Loader2 size={16} className="spin" /> : null}
      {children}
    </BaseButton>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span aria-hidden="true" className="badge-dot" />
      {children}
    </span>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Notice({
  notice,
  onClose,
}: {
  notice: { text: string; tone: string } | null;
  onClose: () => void;
}) {
  return (
    <div
      className="notice-region"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {notice && (
        <div className={`notice ${notice.tone}`}>
          {notice.tone === "error" ? (
            <AlertCircle size={19} />
          ) : (
            <CheckCircle2 size={19} />
          )}
          <span>{notice.text}</span>
          <button aria-label="Đóng thông báo" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  dirty = false,
  locked = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  dirty?: boolean;
  locked?: boolean;
  children: ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const [discard, setDiscard] = useState(false);
  const safe = useRef<HTMLButtonElement>(null);
  const formFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (discard) safe.current?.focus();
  }, [discard]);
  useEffect(() => {
    if (!open) setDiscard(false);
  }, [open]);
  useEffect(() => {
    if (!dirty || !open) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty, open]);
  function close() {
    if (locked) return;
    if (discard) {
      setDiscard(false);
      requestAnimationFrame(() => formFocus.current?.focus());
      return;
    }
    if (dirty) {
      formFocus.current = document.activeElement as HTMLElement;
      setDiscard(true);
    } else onClose();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent
        className="lab-modal"
        showCloseButton={false}
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
          else document.getElementById("lab-main")?.focus();
        }}
      >
        <header className="modal-heading">
          <div>
            <DialogTitle>
              {discard ? "Bỏ thay đổi chưa lưu?" : title}
            </DialogTitle>
            <DialogDescription>
              {discard
                ? "Các thay đổi trong biểu mẫu này chưa được lưu."
                : description || "Lưu để cập nhật không gian làm việc của bạn."}
            </DialogDescription>
          </div>
          <button
            className="icon-button"
            onClick={close}
            disabled={locked}
            aria-label="Đóng hộp thoại"
          >
            <X size={20} />
          </button>
        </header>
        <div hidden={discard}>{children}</div>
        {discard && (
          <div className="discard-content">
            <p>
              Giữ biểu mẫu để viết tiếp, hoặc bỏ những thay đổi của lần này.
            </p>
            <div className="form-actions">
              <Button
                ref={safe}
                tone="neutral"
                onClick={() => {
                  setDiscard(false);
                  requestAnimationFrame(() => formFocus.current?.focus());
                }}
              >
                Viết tiếp
              </Button>
              <Button
                tone="danger"
                onClick={() => {
                  setDiscard(false);
                  onClose();
                }}
              >
                Bỏ thay đổi
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Tìm trong không gian làm việc…",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="search-box">
      <Search size={17} />
      <input
        ref={ref}
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label="Xóa tìm kiếm"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function Pagination({
  page,
  total,
  size = 8,
  onPage,
}: {
  page: number;
  total: number;
  size?: number;
  onPage: (n: number) => void;
}) {
  const max = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="pagination" aria-label="Phân trang">
      <span>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} / ${total}`
          : "0 kết quả"}
      </span>
      <div>
        <button
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <span>
          Trang {page}/{max}
        </span>
        <button
          aria-label="Trang sau"
          disabled={page >= max}
          onClick={() => onPage(page + 1)}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </nav>
  );
}
export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox" | "url" | "password";
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  full?: boolean;
  upload?: "image" | "video";
  uploadValue?: "id";
  nullable?: boolean;
};
export function SecretInput({label,...props}:React.InputHTMLAttributes<HTMLInputElement>&{label:string}) {
  const [visible,setVisible]=useState(false);
  return <div className="secret-input"><input {...props} type={visible?"text":"password"} autoComplete="new-password"/><Button type="button" tone="ghost" aria-label={`${visible?"Ẩn":"Hiện"} ${label}`} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={16}/>:<Eye size={16}/>}</Button></div>;
}
export class ClientError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
    public status = 0,
  ) {
    super(message);
  }
}
export async function api(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(path, {
      ...options,
      cache: "no-store",
      signal: options.signal ?? controller.signal,
    });
    const data: any = await res.json();
    if (!res.ok)
      throw new ClientError(
        data.error || "Không hoàn tất thao tác.",
        data.fields || {},
        res.status,
      );
    return data;
  } catch (e) {
    if (e instanceof ClientError) throw e;
    if ((e as Error).name === "AbortError")
      throw new ClientError(
        "Kết nối quá lâu hoặc đã hủy. Tải lại để kiểm tra kết quả trước khi thử lại.",
      );
    throw new ClientError(
      "Không kết nối được. Nội dung vẫn được giữ; kiểm tra mạng rồi thử lại.",
    );
  } finally {
    clearTimeout(timer);
  }
}
export function RecordForm({
  kind,
  initial,
  fields,
  onSave,
  onCancel,
  onDirty,
  approve = false,
  demo = false,
  validation,
  extra,
  submitLabel = "Lưu thay đổi",
}: {
  kind: Kind;
  initial: Record<string, any>;
  fields: FieldDef[];
  onSave: (data: Record<string, any>, action?: string) => Promise<void>;
  onCancel: () => void;
  onDirty: (v: boolean) => void;
  approve?: boolean;
  demo?: boolean;
  validation?: { safeParse: (v: any) => any };
  extra?: (values: Record<string, any>, change: (name: string, value: any) => void, errors: Record<string,string>) => ReactNode;
  submitLabel?: string;
}) {
  const [values, setValues] = useState({ ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const abort = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  function change(name: string, value: any) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: "" }));
    setError("");
    onDirty(true);
  }
  async function submit(action = "save") {
    if (busy || uploading) return;
    const r = (validation ?? schemas[kind]).safeParse(values);
    if (!r.success) {
      const es: Record<string, string> = {};
      for (const e of r.error.issues) es[String(e.path[0])] = validationMessage(e);
      setErrors(es);
      setError("Kiểm tra các trường được đánh dấu.");
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(r.data, action);
      onDirty(false);
    } catch (e) {
      const err = e as ClientError;
      setError(err.message);
      setErrors(err.fields || {});
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(f: File | undefined, field: FieldDef) {
    if (!f) return;
    if (demo) {
      setError(
        "Chuyển sang dữ liệu của bạn để tải file. Không lưu file riêng vào dữ liệu mẫu.",
      );
      return;
    }
    const isVideo = field.upload === "video";
    const valid = isVideo
      ? /\.(mp4|webm)$/i.test(f.name)
      : /\.(jpe?g|png|webp)$/i.test(f.name);
    const max = (isVideo ? 25 : 8) * 1024 * 1024;
    if (!valid || f.size > max || f.size === 0) {
      setErrors((e) => ({
        ...e,
        [field.name]: `${isVideo ? "MP4/WebM tối đa 25" : "JPG/PNG/WebP tối đa 8"} MB, file không rỗng.`,
      }));
      return;
    }
    onDirty(true);
    setUploading(field.name);
    setUploadName(f.name);
    abort.current = new AbortController();
    const timer = setTimeout(() => abort.current?.abort(), 60000);
    try {
      await probeFile(f, isVideo ? "video" : "image", abort.current.signal);
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/assets", {
        method: "POST",
        body: fd,
        signal: abort.current.signal,
      });
      const d: any = await r.json();
      if (!r.ok) throw new Error(d.error || "Chưa tải được file.");
      change(field.name, field.uploadValue === "id" ? d.id : d.url);
    } catch (e) {
      setErrors((v) => ({
        ...v,
        [field.name]:
          (e as Error).name === "AbortError"
            ? "Đã hủy hoặc quá thời gian. Chọn lại file để thử."
            : (e as Error).message,
      }));
    } finally {
      clearTimeout(timer);
      setUploading(null);
    }
  }
  return (
    <form
      ref={form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="modal-body">
        {error && (
          <div className="inline-error" role="alert">
            <AlertCircle size={17} />
            <div>
              {error}
              {error.includes("đăng nhập") && (
                <a href="/signin-with-chatgpt?return_to=/" target="_top">
                  Đăng nhập lại
                </a>
              )}
              {error.includes("thay đổi") && (
                <Button
                  type="button"
                  tone="ghost"
                  onClick={() => {
                    const safeValues=Object.fromEntries(Object.entries(values).filter(([key])=>!fields.some(f=>f.name===key&&f.type==="password")));
                    const blob = new Blob([JSON.stringify(safeValues, null, 2)], {
                      type: "application/json",
                    });
                    const u = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = u;
                    a.download = "ban-nhap-product-lab.json";
                    a.click();
                    URL.revokeObjectURL(u);
                  }}
                >
                  Tải bản nháp trước khi mở lại
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="form-grid">
          {fields.map((f) => (
            <div
              key={f.name}
              className={`field ${f.full ? "full" : ""} ${f.type === "checkbox" ? "checkbox-field" : ""}`}
            >
              <label htmlFor={`field-${f.name}`}>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea
                  className="resize-none"
                  id={`field-${f.name}`}
                  rows={f.name === "prompt" || f.name === "script" ? 7 : 3}
                  style={{ resize: "none" }}
                  value={values[f.name] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => change(f.name, e.target.value)}
                  aria-invalid={!!errors[f.name]}
                  aria-describedby={
                    errors[f.name]
                      ? `error-${f.name}`
                      : f.help
                        ? `help-${f.name}`
                        : undefined
                  }
                />
              ) : f.type === "select" ? (
                <select
                  id={`field-${f.name}`}
                  value={values[f.name] ?? ""}
                  onChange={(e) => change(f.name, e.target.value)}
                  aria-invalid={!!errors[f.name]}
                  aria-describedby={
                    errors[f.name] ? `error-${f.name}` : undefined
                  }
                >
                  {values[f.name] && !f.options?.some(o=>o.value===values[f.name]) && f.uploadValue === "id" && <option value={values[f.name]}>File vừa tải · {uploadName}</option>}
                  {f.options?.map((o) => (
                    <option value={o.value} key={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  id={`field-${f.name}`}
                  type="checkbox"
                  checked={!!values[f.name]}
                  onChange={(e) => change(f.name, e.target.checked)}
                />
              ) : f.type === "password" ? (
                <SecretInput id={`field-${f.name}`} label={f.label} value={values[f.name]??""} onChange={e=>change(f.name,e.target.value)} aria-invalid={!!errors[f.name]} aria-describedby={errors[f.name]?`error-${f.name}`:f.help?`help-${f.name}`:undefined}/>
              ) : (
                <input
                  id={`field-${f.name}`}
                  type={
                    f.type === "number"
                      ? "number"
                      : f.type === "url"
                        ? "url"
                        : "text"
                  }
                  step={f.type === "number" ? "any" : undefined}
                  min={f.type === "number" ? 0 : undefined}
                  value={values[f.name] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    change(
                      f.name,
                      f.type === "number"
                        ? e.target.value === ""
                          ? (f.nullable ? null : NaN)
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  aria-invalid={!!errors[f.name]}
                  aria-describedby={
                    errors[f.name]
                      ? `error-${f.name}`
                      : f.help
                        ? `help-${f.name}`
                        : undefined
                  }
                />
              )}{" "}
              {f.upload && (
                <div className="upload-line">
                  <label
                    className={`upload-button ${uploading ? "disabled" : ""}`}
                  >
                    <Upload size={14} />
                    {uploading === f.name
                      ? "Đang tải file…"
                      : f.upload === "video"
                        ? "Tải video lên"
                        : "Tải ảnh lên"}
                    <input
                      type="file"
                      className="sr-only"
                      accept={
                        f.upload === "video"
                          ? ".mp4,.webm"
                          : ".jpg,.jpeg,.png,.webp"
                      }
                      disabled={!!uploading || busy}
                      onChange={(e) => void upload(e.target.files?.[0], f)}
                    />
                  </label>
                  <span>
                    {f.upload === "video"
                      ? "MP4/WebM · 25 MB"
                      : "JPG/PNG/WebP · 8 MB"}
                  </span>
                  {uploading === f.name && (
                    <button
                      type="button"
                      onClick={() => abort.current?.abort()}
                    >
                      Hủy tải
                    </button>
                  )}
                </div>
              )}
              {uploading === f.name && (
                <p role="status">
                  <Loader2 size={14} className="spin" />
                  {uploadName}
                </p>
              )}
              {f.help && <small id={`help-${f.name}`}>{f.help}</small>}
              {errors[f.name] && (
                <small id={`error-${f.name}`} className="field-error">
                  {errors[f.name]}
                </small>
              )}
            </div>
          ))}
        </div>
        {extra?.(values, change, errors)}
        {kind === "creative" && values.mediaUrl && (
          <div className="video-review">
            <p>Video để xem trước</p>
            <video
              key={values.mediaUrl}
              src={values.mediaUrl}
              controls
              preload="metadata"
              playsInline
              aria-label="Video cần duyệt"
            />
          </div>
        )}
      </div>
      <footer className="form-actions">
        <DialogClose asChild>
          <Button type="button" tone="neutral" disabled={busy || !!uploading}>
            Hủy
          </Button>
        </DialogClose>
        {approve && (
          <Button
            type="button"
            tone="neutral"
            busy={busy}
            disabled={!!uploading}
            onClick={() => void submit("approve")}
          >
            <CheckCircle2 size={16} />
            Đã xem · Duyệt video
          </Button>
        )}
        <Button type="submit" busy={busy} disabled={!!uploading}>
          {submitLabel}
        </Button>
      </footer>
    </form>
  );
}
