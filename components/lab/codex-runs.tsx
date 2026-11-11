"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Badge, Empty, Pagination, api } from "./primitives";
import { formatTime, type LabRecord } from "@/lib/lab/domain";
import { codexRunSchema, exchangeByteLimit, exchangeSummary, parseCodexExchange, type CodexExchange } from "@/lib/lab/codex-exchange";

type Props = { projectId?: string; records: LabRecord[]; demo: boolean; offline: boolean; onRecord: (record: LabRecord) => void };
export default function CodexRuns({ projectId, records, demo, offline, onRecord }: Props) {
  const [preview, setPreview] = useState<CodexExchange | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [page, setPage] = useState(1);
  const file = useRef<HTMLInputElement>(null), epoch = useRef(0), lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { epoch.current++; controller.current?.abort(); }, []);
  const runs = records.filter(r => r.kind === "codex_run" && r.data.projectId === projectId)
    .flatMap(r => { const parsed = codexRunSchema.safeParse(r.data); return parsed.success ? [{ ...r, data: parsed.data }] : []; })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const pg = Math.min(page, Math.max(1, Math.ceil(runs.length / 8)));
  async function selectFile(value?: File) {
    const current = ++epoch.current;
    setPreview(null); setError(""); setNotice(""); setReading(false);
    if (!value) return;
    setReading(true);
    try {
      if (value.size > exchangeByteLimit) throw Error("Báo cáo vượt 384 KB. Chọn file codex-exchange.json nhỏ hơn.");
      const parsed = parseCodexExchange(await value.text());
      if (parsed.projectId !== projectId) throw Error("Báo cáo thuộc dự án khác. Chọn đúng dự án ghi trong mission rồi nhập lại.");
      if (epoch.current === current) setPreview(parsed);
    } catch (e) { if (epoch.current === current) setError((e as Error).message); }
    finally { if (epoch.current === current) setReading(false); }
  }
  async function commit() {
    if (lock.current || !preview || demo || offline || !projectId) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const current = epoch.current, abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 30000);
    try {
      const result = await api("/api/codex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exchange: preview }), signal: abort.signal });
      onRecord(result.record);
      if (epoch.current !== current) return;
      setNotice(result.deduplicated ? "Báo cáo này đã được lưu; không tạo bản trùng." : "Đã lưu báo cáo vào đúng dự án. Nguồn vẫn chờ xem xét.");
      setPreview(null); if (file.current) file.current.value = ""; setPage(1);
    } catch (e) { if (epoch.current === current) setError((e as Error).message + " Bản xem trước được giữ; nhập lại cùng file sẽ không tạo bản trùng."); }
    finally { clearTimeout(timer); lock.current = false; if (epoch.current === current) setBusy(false); }
  }
  function summary(value: CodexExchange) {
    const s = exchangeSummary(value);
    return `${s.research} truy vấn · ${s.sources} URL riêng biệt · ${s.references} reference / ${s.frames} khung · ${s.compositions} bản dựng`;
  }
  return <section className="production-card production-card-body codex-runs" aria-labelledby="codex-runs-title">
    <header><h3 id="codex-runs-title">Kết quả chạy trên Codex</h3><Badge>Chờ xem xét</Badge></header>
    <p>Nhận lại nghiên cứu và báo cáo tham chiếu đã chạy trên Codex. Chọn <code>codex-exchange.json</code> để xem trước rồi lưu vào dự án này.</p>
    {projectId && <small>Mã dự án cho mission: <code>{projectId}</code></small>}
    <p>Chỉ nhập báo cáo và link nguồn. Ảnh, video và phê duyệt cần được gắn riêng; mã kiểm tra file trong báo cáo chưa xác minh công dụng hoặc nhu cầu mua.</p>
    <div className="field"><label htmlFor="codex-exchange-file">Báo cáo Codex · JSON, tối đa 384 KB</label><input ref={file} id="codex-exchange-file" type="file" accept=".json,application/json" disabled={busy || !projectId} aria-invalid={!!error} aria-describedby={error ? "codex-import-error" : "codex-import-help"} onChange={e => void selectFile(e.target.files?.[0])}/><small id="codex-import-help">Xem trước được trong demo; lưu cần dữ liệu của bạn và kết nối mạng.</small></div>
    {reading && <p role="status">Đang kiểm tra báo cáo…</p>}
    {error && <p id="codex-import-error" className="inline-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {preview && <div className="info-panel"><strong>{preview.missionId}</strong><p>{summary(preview)}</p><ReportDetails exchange={preview}/><p>{formatTime(preview.finishedAt)} · đúng dự án đang chọn</p><Button busy={busy} disabled={demo || offline || busy} onClick={() => void commit()}>Lưu báo cáo vào dự án</Button><Button tone="ghost" disabled={busy} onClick={() => { setPreview(null); setError(""); if (file.current) file.current.value = ""; }}>Bỏ bản xem trước</Button>{(demo || offline) && <p>{demo ? "Bản mẫu không lưu dữ liệu thật." : "Đang ngoại tuyến. Kết nối lại để lưu; bản xem trước được giữ."}</p>}</div>}
    {runs.slice((pg - 1) * 8, pg * 8).map(run => <article key={run.id} className="production-card production-card-body"><header><h3>{run.data.exchange.missionId}</h3><Badge tone="warning">Nguồn chưa kiểm chứng</Badge></header><p>{summary(run.data.exchange)}</p><small>Chạy: {formatTime(run.data.exchange.finishedAt)} · Nhập: {formatTime(run.updatedAt)}</small><ReportDetails exchange={run.data.exchange}/></article>)}
    {!runs.length && <Empty title="Chưa nhập báo cáo Codex" text="Chạy mission bằng mã dự án trên, rồi chọn báo cáo để xem trước."/>}
    <Pagination page={pg} total={runs.length} onPage={setPage}/>
  </section>;
}

function ReportDetails({ exchange }: { exchange: CodexExchange }) {
  return <details><summary>Xem bước và nguồn</summary>{exchange.steps.map(step => <section key={step.stepId}><h4>{step.stepId} · {step.type}</h4>{step.query && <p>{step.query}</p>}{step.sources.map((source, i) => <p key={i}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>{source.excerpt && <small>{source.excerpt}</small>}</p>)}{step.media && <p>{step.media.width}×{step.media.height} · {step.media.duration.toFixed(2)}s{step.frameCount ? ` · ${step.frameCount} khung` : ""}</p>}<small>SHA-256 của file trên máy <code>{step.artifactSha256}</code></small></section>)}</details>;
}
