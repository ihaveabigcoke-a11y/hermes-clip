"use client";
import {uiCopy} from '@/desktop/src/ui-copy.mjs';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DesktopConsole from "./desktop-console";
import WorkspaceLibrary from "./workspace-library";
import MuseConnectionStrip from "./muse-connection-strip";
import {
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  Package,
  Clapperboard,
  BarChart3,
  PlugZap,
  Plus,
  ArrowUpRight,
  ChevronRight,
  ArrowRight,
  Check,
  Clock3,
  ShieldCheck,
  X,
  Loader2,
  Download,
  Play,
  Pencil,
  Copy,
  ExternalLink,
  CheckCircle2,
  Pause,
  Sparkles,
  Video,
  FileText,
  Globe2,
  Lightbulb,
  RefreshCw,
  Archive,
  RotateCcw,
  MessageSquare,
  Workflow,
  Wallet,
  Target,
  Layers,
  ChevronDown,
  Info,
  ImageIcon,
  Images,
  UsersRound,
  Search,
} from "lucide-react";
import {
  Button,
  Badge,
  Empty,
  Notice,
  Modal,
  SearchBox,
  Pagination,
  RecordForm,
  api,
  ClientError,
  type FieldDef,
} from "./primitives";
import { ProductArt } from "./art";
import { currencyFields } from "./currency-fields";
import ProductionStudio from "./production";
import OperationsPanel from "./operations";
import {ManualMediaSettings} from './manual-media';
import AssistantSettings from "./assistant-settings";
import {InstagramSettings} from './instagram-settings';
import MuseChatPanel from "./muse-chat";
import { creativeDuration } from "@/lib/lab/production";
import { desktopBridge } from "@/lib/lab/desktop-client";
import { demoRecords } from "@/lib/lab/demo";
import {productCardDetails, showWorkspaceBanner} from "@/lib/lab/ui-state";
import { productStage } from "@/lib/lab/product-stage";
import { productNextStep, latestProductProduction } from "@/lib/lab/product-next-step";
import { sampleCheckState } from "@/lib/lab/sample-check";
import { SampleCheckFields } from "./sample-check-fields";
import {
  type LabRecord,
  type Kind,
  emptyProduct,
  emptySettings,
  unitMargin,
  productGate,
  metricAdvice,
  makeBriefs,
  classifyComment,
  formatMoney,
  productFinancials,
  productMarginLabel,
  formatTime,
} from "@/lib/lab/domain";
const businessViews = new Set(["overview", "studio", "experiments", "results", "social", "landing"]);
const navigation = [
  { id: "production", label: "Tạo nội dung", icon: Video },
  { id: "images", label: "Tạo ảnh", icon: ImageIcon },
  { id: "queue", label: "Hàng đợi", icon: Clapperboard },
  { id: "chat", label: uiCopy.chat, icon: MessageSquare },
  { id: "library", label: "Thư viện", icon: Images },
  { id: "research", label: "Nghiên cứu", icon: Search },
  { id: "products", label: "Sản phẩm", icon: Package },
  { id: "accounts", label: uiCopy.accounts, icon: UsersRound },
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "studio", label: "Ý tưởng đã lưu", icon: Clapperboard },
  { id: "experiments", label: "Thử nghiệm nội dung", icon: FlaskConical },
  { id: "results", label: "Số liệu", icon: BarChart3 },
  { id: "social", label: "Instagram", icon: Globe2 },
  { id: "landing", label: "Trang giới thiệu", icon: FileText },
  { id: "settings", label: "Cài đặt", icon: PlugZap },
];
const productFields: FieldDef[] = [
  {
    name: "name",
    label: "Tên sản phẩm",
    placeholder: "Ví dụ: đèn đọc sách kẹp bàn",
  },
  {
    name: "niche",
    label: "Nhóm sản phẩm",
    placeholder: "Không gian sống, chăm sóc tóc…",
  },
  { name: "sku", label: "SKU / mã sản phẩm" },
  { name: "market", label: "Thị trường quốc tế ưu tiên", placeholder: "US, UK, EU…" },
  { name: "locale", label: "Ngôn ngữ nội dung", placeholder: "en-US" },
  { name: "allowedClaims", label: "Thông điệp công dụng có bằng chứng", type: "textarea", full: true },
  { name: "invariants", label: "Đặc điểm sản phẩm phải giữ nguyên", type: "textarea", full: true, help: "Màu, kiểu dáng, logo, bao bì, trạng thái từng bộ phận…" },
  {
    name: "customer",
    label: "Khách hàng mục tiêu",
    type: "textarea",
    full: true,
  },
  {
    name: "problem",
    label: "Vấn đề khách muốn giải quyết",
    type: "textarea",
    full: true,
  },
  {
    name: "imageUrl",
    label: "Ảnh sản phẩm",
    type: "url",
    upload: "image",
    full: true,
    placeholder: "https://… hoặc tải ảnh lên",
  },
  { name: "supplierUrl", label: "Link nguồn hàng", type: "url" },
  { name: "referenceUrl", label: "Link nội dung tham khảo", type: "url" },
  ...currencyFields,
  { name: "price", label: "Giá bán dự kiến", type: "number" },
  { name: "cost", label: "Giá vốn / sản phẩm", type: "number" },
  { name: "shipping", label: "Chi phí giao hàng / đơn", type: "number" },
  { name: "fees", label: "Phí thanh toán và nền tảng / đơn", type: "number", help: "Theo tiền tệ chung." },
  { name: "buffer", label: "Dự phòng lỗi và hoàn trả / đơn", type: "number", help: "Theo tiền tệ chung." },
  {
    name: "proofUrl",
    label: "Link video hoặc bằng chứng đã kiểm",
    type: "url",
    full: true,
  },
  {
    name: "proofNotes",
    label: "Kết quả kiểm mẫu sản phẩm và giới hạn công dụng",
    type: "textarea",
    full: true,
    help: "Ghi điều hàng thật làm được, trong điều kiện nào. Không dùng cảnh AI làm bằng chứng.",
  },
  {
    name: "sampleVerified",
    label: "Đã kiểm mẫu sản phẩm và ghi bằng chứng",
    type: "checkbox",
    full: true,
  },
];
const creativeFields: FieldDef[] = [
  { name: "name", label: "Tên ý tưởng" },
  { name: "angle", label: "Góc nội dung" },
  { name: "hook", label: "Câu mở đầu", type: "textarea", full: true },
  { name: "script", label: "Kịch bản theo cảnh", type: "textarea", full: true },
  {
    name: "prompt",
    label: "Prompt cho công cụ tạo video",
    type: "textarea",
    full: true,
  },
  { name: "caption", label: "Chú thích", type: "textarea", full: true },
  {
    name: "mediaUrl",
    label: "Video thành phẩm",
    type: "url",
    upload: "video",
    full: true,
    help: "Có thể tải video thủ công trong lúc chờ nối API. Sửa nội dung sẽ bỏ trạng thái đã duyệt.",
  },
];
const statusNames: Record<string, string> = {
  draft: "Bản nháp",
  running: "Đang thử",
  paused: "Tạm dừng",
  review: "Đang đánh giá",
  closed: "Đã kết thúc",
  ready: "Chờ duyệt",
  approved: "Đã duyệt",
  awaiting_provider: "Chờ nối API",
  cancelled: "Đã hủy",
};
function recordId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return (
    "r_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}
const stageNames = ["Ý tưởng", "Kiểm chứng", "Nội dung", "Đo nhu cầu"];
const categoryNames: Record<string, string> = {
  sample: "Mẫu sản phẩm",
  video: "Sản xuất video",
  ads: "Phân phối",
  tool: "Công cụ",
  other: "Khác",
};
type Editor = {
  kind: Kind;
  record?: LabRecord;
  initial: Record<string, any>;
  title: string;
  id: string;
};
export default function LabApp() {
  const [editorSaving, setEditorSaving] = useState(false);
  const [real, setReal] = useState<LabRecord[]>([]),
    [samples, setSamples] = useState<LabRecord[]>(() => demoRecords()),
    [demo, setDemo] = useState(true),
    [view, setView] = useState("production"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState("all"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [lastSync, setLastSync] = useState(0),
    [notice, setNotice] = useState<{ text: string; tone: string } | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [dirty, setDirty] = useState(false),
    [archiveTarget, setArchiveTarget] = useState<LabRecord | null>(null),
    [help, setHelp] = useState(false),
    [busy, setBusy] = useState(""),
    [selected, setSelected] = useState(""),
    [studioTab, setStudioTab] = useState("concepts"),
    [offline, setOffline] = useState(false);
  const initialModeApplied = useRef(false);
  const req = useRef(0),
    abort = useRef<AbortController | null>(null),
    pending = useRef(false);
  const records = demo ? samples : real;
  const notify = useCallback(
    (text: string, tone = "success") => setNotice({ text, tone }),
    [],
  );
  const load = useCallback(async (initial = false) => {
    const n = ++req.current;
    abort.current?.abort();
    const c = new AbortController();
    abort.current = c;
    if (initial) setLoading(true);
    const timer = setTimeout(() => c.abort(), 20000);
    try {
      const r = await api("/api/lab", { signal: c.signal });
      if (req.current !== n) return;
      setReal(r.records);
      setLastSync(Date.now());
      setError("");
      if (!initialModeApplied.current) {
        const pref = localStorage.getItem("product-lab-mode");
        setDemo(pref ? pref === "demo" : r.records.length === 0);
        initialModeApplied.current = true;
      }
    } catch (e) {
      if (req.current === n && !c.signal.aborted)
        setError((e as Error).message);
      else if (req.current === n)
        setError(
          "Kết nối quá lâu. Thử tải lại; dữ liệu đang xem có thể chưa mới nhất.",
        );
    } finally {
      clearTimeout(timer);
      if (req.current === n) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(location.search);
      const v = p.get("view") || "production";
      setView(navigation.some((n) => n.id === v) ? v : "production");
      setQuery(p.get("q") || "");
      setPage(Math.max(1, Number(p.get("page")) || 1));
    };
    sync();
    window.addEventListener("popstate", sync);
    void load(true);
    const workspaceChanged = () => void load();
    window.addEventListener("product-lab:workspace-changed", workspaceChanged);
    const off = () => setOffline(!navigator.onLine);
    off();
    window.addEventListener("online", off);
    window.addEventListener("offline", off);
    return () => {
      abort.current?.abort();
      window.removeEventListener("popstate", sync);
      window.removeEventListener("online", off);
      window.removeEventListener("offline", off);
      window.removeEventListener("product-lab:workspace-changed", workspaceChanged);
    };
  }, [load]);
  useEffect(() => {
    document.title = `${navigation.find((n) => n.id === view)?.label || "Hermes Clip"} · Hermes Clip`;
  }, [view]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const allProducts = records.filter((r) => r.kind === "product"),
    products = allProducts.filter((r) => !r.data.archived),
    experiments = records.filter(
      (r) => r.kind === "experiment" && !r.data.archived,
    ),
    creatives = records.filter(
      (r) => r.kind === "creative" && !r.data.archived,
    ),
    jobs = records.filter((r) => r.kind === "job"),
    metrics = records.filter((r) => r.kind === "metric"),
    costs = records.filter((r) => r.kind === "cost"),
    signals = records.filter((r) => r.kind === "signal");
  const settings =
    records.find((r) => r.kind === "settings")?.data ?? emptySettings;
  const spent = costs.reduce((n, c) => n + c.data.amount, 0);
  const exp = experiments.find((r) => r.id === selected) ?? experiments[0];
  useEffect(() => {
    if (experiments.length && !experiments.some((r) => r.id === selected))
      setSelected(experiments[0].id);
  }, [demo, real.length, samples.length, selected]);
  function urlState(v = view, q = query, p = page) {
    const u = new URL(location.href);
    u.searchParams.set("view", v);
    if (v !== view) {
      for (const key of ["stage", "p_q", "p_page"]) u.searchParams.delete(key);
    }
    if (q) u.searchParams.set("q", q);
    else u.searchParams.delete("q");
    if (p > 1) u.searchParams.set("page", String(p));
    else u.searchParams.delete("page");
    return u;
  }
  function navigate(v: string) {
    setView(v);
    setQuery("");
    setPage(1);
    setFilter("all");
    history.pushState({}, "", urlState(v, "", 1));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function search(q: string) {
    setQuery(q);
    setPage(1);
    history.replaceState({}, "", urlState(view, q, 1));
  }
  function changePage(p: number) {
    setPage(p);
    history.replaceState({}, "", urlState(view, query, p));
  }
  function switchMode(value: boolean) {
    initialModeApplied.current = true;
    setDemo(value);
    localStorage.setItem("product-lab-mode", value ? "demo" : "real");
    setPage(1);
    setQuery("");
    setFilter("all");
    history.replaceState({}, "", urlState(view, "", 1));
    notify(
      value
        ? "Đã mở không gian mẫu. Thay đổi ở đây chỉ nằm trong phiên này."
        : desktopBridge() ? "Đang dùng dữ liệu của bạn. Dữ liệu lưu trên máy này." : "Đang dùng dữ liệu của bạn. Dữ liệu được lưu riêng trên máy chủ.",
      "info",
    );
  }
  function putMemory(rs: LabRecord[]) {
    setSamples((prev) => [
      ...rs,
      ...prev.filter((r) => !rs.some((x) => x.id === r.id)),
    ]);
  }
  async function persist(
    kind: Kind,
    id: string,
    data: Record<string, any>,
    revision = 0,
    action = "save",
  ): Promise<LabRecord> {
    if (offline && !demo)
      throw new ClientError(
        "Đang ngoại tuyến. Giữ biểu mẫu rồi thử lại khi có mạng.",
      );
    if (demo) {
      const previous = samples.find((r) => r.id === id);
      if (kind === 'product' && action === 'promote' && previous) return previous;
      if (previous && previous.revision !== revision)
        throw new ClientError("Dữ liệu mẫu đã thay đổi. Mở lại để chỉnh sửa.");
      let d = { ...data };
      if (kind === "creative") {
        const p = products.find((r) => r.id === d.productId);
        if (action === "approve") {
          const gate = p ? productGate(p.data) : "Không có sản phẩm.";
          if (gate) throw new ClientError(gate);
          if (!d.mediaUrl)
            throw new ClientError("Gắn video đã xem trước khi duyệt.");
          d.status = "approved";
          d.approvedAt = Date.now();
        } else {
          d.status = d.mediaUrl ? "ready" : "draft";
          d.approvedAt = null;
        }
      }
      if (
        kind === "experiment" &&
        (d.status === "running" || d.decision === "pilot")
      ) {
        const p = products.find((r) => r.id === d.productId);
        const gate = p ? productGate(p.data) : "Chọn sản phẩm.";
        if (gate) throw new ClientError(gate);
        if (settings.paused) throw new ClientError("Hermes Clip đang tạm dừng.");
      }
      const r = {
        id,
        kind,
        data: d,
        revision: revision + 1,
        updatedAt: Date.now(),
      };
      putMemory([r]);
      return r;
    }
    const result = await api("/api/lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind, data, revision, action }),
    });
    setReal((prev) => [
      result.record,
      ...prev.filter((r) => r.id !== result.record.id),
    ]);
    void load();
    return result.record;
  }
  function openEditor(kind: Kind, record?: LabRecord, productId?: string) {
    setDirty(false);
    let initial: Record<string, any> = {};
    let title = "";
    if (kind === "product") {
      initial = { ...emptyProduct };
      title = "Thêm sản phẩm";
    }
    if (kind === "experiment") {
      const experimentProduct = products.find(r => r.id === (productId || products[0]?.id));
      initial = {
        name: "",
        productId: productId || products[0]?.id || "",
        market: experimentProduct?.data.market || emptyProduct.market,
        hypothesis: "",
        offerUrl: "",
        status: "draft",
        targetSessions: 100,
        decision: "pending",
        decisionNotes: "",
        archived: false,
      };
      title = "Tạo bài test";
    }
    if (kind === "creative") {
      title = "Chỉnh ý tưởng";
    }
    if (kind === "metric") {
      initial = {
        experimentId: exp?.id || "",
        views: 0,
        sessions: 0,
        leads: 0,
        orders: 0,
        delivered: 0,
        returned: 0,
        netRevenue: 0,
        totalCosts: 0,
        sourceUrl: "",
        notes: "",
      };
      title = "Ghi số liệu bài test";
    }
    if (kind === "cost") {
      initial = {
        name: "",
        category: "video",
        amount: 0,
        notes: "",
        productId: productId || "",
      };
      title = "Ghi khoản chi · USD";
    }
    if (kind === "settings") {
      initial = { ...emptySettings };
      title = "Cài đặt Hermes Clip";
    }
    if (kind === "signal") {
      initial = {
        experimentId: exp?.id || "",
        text: "",
        labels: [],
        source: "Nhập tay",
      };
      title = "Ghi một bình luận";
    }
    if (record) {
      initial = kind === "product" ? productFinancials(record.data) : { ...record.data };
      title =
        kind === "product"
          ? "Hồ sơ sản phẩm"
          : kind === "experiment"
            ? "Chi tiết bài test"
            : kind === "creative"
              ? "Kịch bản & video"
              : kind === "settings"
                ? "Cài đặt Hermes Clip"
                : title;
    }
    setEditor({
      kind,
      record,
      initial,
      title,
      id:
        record?.id ||
        (kind === "settings"
          ? "workspace"
          : kind === "metric"
            ? `metric_${exp?.id}`
            : recordId()),
    });
  }
  async function saveEditor(data: Record<string, any>, action?: string) {
    if (!editor) return;
    setEditorSaving(true);
    try {
      if (editor.kind === "product") data.proofNotes = String(data.proofNotes ?? "").replace(/(?:cost|shipping|price) chưa biết, hồ sơ tạm ghi 0.?/g, "").trim();
      if (editor.kind === "signal") data.labels = classifyComment(data.text);
      await persist(
        editor.kind,
        editor.id,
        data,
        editor.record?.revision ?? 0,
        action,
      );
      setDirty(false);
      setEditor(null);
      notify(
        demo
          ? "Đã lưu trong không gian mẫu."
          : action === "approve"
            ? "Đã duyệt phiên bản video này."
            : "Đã lưu thay đổi.",
      );
    } finally {
      setEditorSaving(false);
    }
  }
  function fieldDefs(): FieldDef[] {
    if (!editor) return [];
    switch (editor.kind) {
      case "product":
        return productFields.map(field => ["price", "cost", "shipping", "fees", "buffer"].includes(field.name) ? {...field, nullable: true, help: "Để trống nếu chưa biết. Nhập 0 khi đã xác nhận bằng 0."} : field);
      case "creative":
        return creativeFields;
      case "experiment":
        return [
          { name: "name", label: "Tên bài test" },
          {
            name: "productId",
            label: "Sản phẩm",
            type: "select",
            options: [
              { value: "", label: "Chọn sản phẩm" },
              ...products.map((p) => ({ value: p.id, label: p.data.name })),
            ],
          },
          {
            name: "market",
            label: "Thị trường mục tiêu",
            placeholder: "Ví dụ: Việt Nam hoặc US",
          },
          {
            name: "targetSessions",
            label: "Mốc rà soát · phiên trang",
            type: "number",
            help: "Mốc quan sát tự đặt, không phải bảo đảm đủ bằng chứng.",
          },
          {
            name: "hypothesis",
            label: "Giả thuyết muốn kiểm tra",
            type: "textarea",
            full: true,
          },
          {
            name: "offerUrl",
            label: "Link trang có giá",
            type: "url",
            full: true,
          },
          {
            name: "status",
            label: "Trạng thái",
            type: "select",
            options: ["draft", "running", "paused", "review", "closed"].map(
              (v) => ({ value: v, label: statusNames[v] }),
            ),
          },
          {
            name: "decision",
            label: "Quyết định hiện tại",
            type: "select",
            options: [
              { value: "pending", label: "Chưa quyết định" },
              { value: "iterate", label: "Thử lại có điều chỉnh" },
              { value: "pilot", label: "Cân nhắc pilot đơn thật" },
              { value: "stop", label: "Dừng" },
            ],
          },
          {
            name: "decisionNotes",
            label: "Lý do và bằng chứng cho quyết định",
            type: "textarea",
            full: true,
          },
        ];
      case "metric": {
        const p = products.find((p) => p.id === exp?.data.productId);
        return [
          { name: "views", label: "Lượt xem", type: "number" },
          {
            name: "sessions",
            label: "Phiên trang đủ điều kiện",
            type: "number",
          },
          {
            name: "leads",
            label: "Lead quan tâm sau khi thấy giá",
            type: "number",
          },
          { name: "orders", label: "Đơn đã thanh toán", type: "number" },
          { name: "delivered", label: "Đơn đã giao", type: "number" },
          { name: "returned", label: "Đơn hoàn sau giao", type: "number" },
          {
            name: "netRevenue",
            label: `Doanh thu thuần · ${p?.data.currency || "USD"}`,
            type: "number",
            help: "Đã trừ giảm giá và hoàn, không gồm thuế thu hộ.",
          },
          {
            name: "totalCosts",
            label: `Tổng chi phí nhóm đo lường · ${p?.data.currency || "USD"}`,
            type: "number",
            help: "Bao gồm acquisition, hàng, giao, phí; đừng trừ tiền hoàn hai lần.",
          },
          {
            name: "sourceUrl",
            label: "Link nguồn số liệu",
            type: "url",
            full: true,
          },
          {
            name: "notes",
            label: "Ghi chú và kỳ quan sát",
            type: "textarea",
            full: true,
            help: "Số lũy kế của cùng bài test. Lưu lần sau thay bản lưu cũ, không cộng dồn.",
          },
        ];
      }
      case "cost":
        return [
          { name: "name", label: "Nội dung khoản chi" },
          {
            name: "category",
            label: "Loại chi",
            type: "select",
            options: Object.entries(categoryNames).map(([value, label]) => ({
              value,
              label,
            })),
          },
          { name: "amount", label: "Số tiền · USD", type: "number" },
          {
            name: "productId",
            label: "Sản phẩm liên quan",
            type: "select",
            options: [
              { value: "", label: "Chi phí chung" },
              ...allProducts.map((p) => ({ value: p.id, label: p.data.name })),
            ],
          },
          { name: "notes", label: "Ghi chú", type: "textarea", full: true },
        ];
      case "settings":
        return [
          {
            name: "budgetUsd",
            label: "Ngân sách vận hành · USD",
            type: "number",
            help: "Để 0 nếu chưa chốt. V1 không tự gọi API trả phí.",
          },
          {
            name: "providerName",
            label: "Công cụ tạo video dự kiến",
            placeholder: "Tên công cụ tạo",
          },
          {
            name: "providerDocs",
            label: "Link tài liệu API chính thức",
            type: "url",
            full: true,
          },
          {
            name: "notes",
            label: "Yêu cầu kết nối",
            type: "textarea",
            full: true,
            help: "Model, độ dài, ảnh tham chiếu… Không dán API key vào đây.",
          },
          {
            name: "paused",
            label: "Tạm dừng tạo bản yêu cầu, tác vụ và thử nghiệm",
            type: "checkbox",
            full: true,
          },
        ];
      case "signal":
        return [
          {
            name: "text",
            label: "Nội dung bình luận",
            type: "textarea",
            full: true,
            help: "Một bình luận mỗi lần. Bỏ tên và thông tin cá nhân trước khi lưu.",
          },
          {
            name: "source",
            label: "Nguồn mẫu bình luận",
            placeholder: "Nhập tay, Apify…",
          },
        ];
      default:
        return [];
    }
  }
  async function generate() {
    if (!exp) {
      notify("Tạo bài test trước để có sản phẩm và giả thuyết.", "error");
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy("brief");
    try {
      if (settings.paused) throw new ClientError("Hermes Clip đang tạm dừng.");
      if (demo) {
        const p = products.find((p) => p.id === exp.data.productId)!;
        const existing = new Set(creatives.map((c) => c.id));
        putMemory(
          makeBriefs(p, exp)
            .filter((b) => !existing.has(b.id))
            .map((b) => ({ ...b, revision: 1, updatedAt: Date.now() })),
        );
      } else {
        await api("/api/briefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId: exp.id }),
        });
        await load();
      }
      notify(
        "Đã lưu 6 kịch bản nháp để bạn chỉnh sửa.",
        "info",
      );
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  async function prepare(c: LabRecord) {
    if (pending.current) return;
    pending.current = true;
    setBusy(c.id);
    try {
      if (settings.paused) throw new ClientError("Hermes Clip đang tạm dừng.");
      if (demo) {
        const id = `job_${c.id}_${c.revision}`;
        if (!jobs.some((j) => j.id === id))
          putMemory([
            {
              id,
              kind: "job",
              revision: 1,
              updatedAt: Date.now(),
              data: {
                creativeId: c.id,
                creativeRevision: c.revision,
                status: "awaiting_provider",
                payload: JSON.stringify(
                  {
                    schema_version: 1,
                    client_request_id: id,
                    creative_id: c.id,
                    creative_revision: c.revision,
                    prompt: c.data.prompt,
                    aspect_ratio: "9:16",
                    reference_media: [],
                  },
                  null,
                  2,
                ),
              },
            },
          ]);
      } else {
        await api("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creativeId: c.id }),
        });
        await load();
      }
      notify(
        "Đã chuẩn bị tác vụ. Chờ nối API; chưa tạo file và chưa phát sinh phí.",
        "info",
      );
      setStudioTab("jobs");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  function download(name: string, data: unknown) {
    const url = URL.createObjectURL(
      new Blob(
        [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportData() {
    download(`product-lab-${demo ? "mau" : "workspace"}.json`, {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      mode: demo ? "demo" : "real",
      records,
    });
    notify("Đã tải bản sao dữ liệu. Không chứa API key.");
  }
  const label = navigation.find((n) => n.id === view)?.label || "Tổng quan";
  function sectionTitle(title: string, sub: string, action?: React.ReactNode) {
    return (
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        {action}
      </div>
    );
  }
  const pipeline = stageNames.map((name, i) => ({
    name,
    items: products.filter((p) => productStage(p, records) === i),
  }));
  function productVisual(p: LabRecord, cls = "") {
    const reference = records.filter(record => record.kind === 'production' && record.data.productId === p.id).flatMap(record => record.data.references ?? []).find(ref => ref.role === 'product');
    const imageUrl = p.data.imageUrl || (reference?.assetId ? '/api/assets/' + reference.assetId : '');
    return imageUrl ? (
      <div className={`product-art image-art ${cls}`}>
        <img
          src={imageUrl}
          alt={p.data.name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      </div>
    ) : (
      <ProductArt type={p.data.name} className={cls} />
    );
  }
  function productCard(p: LabRecord) {
    const margin = unitMargin(p.data);
    const details = productCardDetails(p, records);
    const next = productNextStep(p, records);
    const sampleState = sampleCheckState(p.data);
    const openNextStep = () => {
      if (next.actionView === "products") return openEditor("product", p);
      const url = urlState(next.actionView, "", 1);
      for (const key of ["production", "stage", "ops_id", "ig_tab", "ig_plan", "new_product"]) url.searchParams.delete(key);
      if (next.actionView === "social") url.searchParams.set("ops_id", p.id);
      else {
        const latest = latestProductProduction(p, records);
        if (latest) {
          url.searchParams.set("production", latest.id);
          url.searchParams.set("stage", next.stage);
        } else url.searchParams.set("new_product", p.id);
      }
      history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    return (
      <article className="product-card" key={p.id}>
        {productVisual(p)}
        <div className="product-card-body">
          <div className="card-eyebrow">
            <span>{p.data.niche || "Chưa chọn nhóm"}</span>
            <Badge
              tone={
                p.data.archived
                  ? "neutral"
                  : sampleState === "verified"
                    ? "success"
                    : "warning"
              }
            >
              {p.data.archived
                ? "Đang lưu trữ"
                : sampleState === "verified"
                  ? "Đã kiểm mẫu sản phẩm"
                  : sampleState === "legacy"
                    ? "Đã kiểm mẫu (bản cũ) – cần xác nhận khớp video"
                    : "Chờ kiểm mẫu sản phẩm"}
            </Badge>
          </div>
          <h3>
            <button onClick={() => openEditor("product", p)}>
              {p.data.name}
            </button>
          </h3>
          <p className="clamp-two">
            {p.data.problem ||
              "Ghi vấn đề khách hàng để bắt đầu đánh giá sản phẩm."}
          </p>
          <p className="product-card-summary">{details.costLabel} · {details.accountCount} tài khoản · {stageNames[details.stage]}</p>
          <p className="product-card-summary" title={next.detail}>Bước tiếp theo: {next.title}</p>
          <div className="product-finance">
            <div>
              <span>Giá dự kiến</span>
              <strong>{productFinancials(p.data).price === null ? "Chưa biết" : formatMoney(p.data.price, p.data.currency)}</strong>
            </div>
            <div>
              <span>Biên trước acquisition</span>
              <strong className={margin !== null && margin > 0 ? "success-text" : "warning-text"}>
                {productMarginLabel(p.data)}
              </strong>
            </div>
          </div>
          <div className="product-card-footer">
            <Button tone="neutral" onClick={openNextStep} title={next.detail} aria-label={`${next.title} · ${p.data.name}`}>
              Tiếp tục
              <ArrowUpRight size={15} />
            </Button>
            <button
              className="icon-button"
              aria-label={
                p.data.archived
                  ? `Khôi phục ${p.data.name}`
                  : `Lưu trữ ${p.data.name}`
              }
              onClick={() =>
                p.data.archived
                  ? void persist(
                      "product",
                      p.id,
                      { ...p.data, archived: false },
                      p.revision,
                    )
                      .then(() => notify("Đã khôi phục sản phẩm."))
                      .catch((e) => notify(e.message, "error"))
                  : setArchiveTarget(p)
              }
            >
              {p.data.archived ? (
                <RotateCcw size={17} />
              ) : (
                <Archive size={17} />
              )}
            </button>
          </div>
        </div>
      </article>
    );
  }
  function toolbar() {
    return (
      <div className="list-toolbar">
        <SearchBox
          value={query}
          onChange={search}
          placeholder={
            view === "products"
              ? "Tìm tên, nhóm hoặc vấn đề…"
              : "Tìm tên bài test hoặc thị trường…"
          }
        />
        <label className="filter-control">
          <span className="sr-only">Lọc trạng thái</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả trạng thái</option>
            {view === "products" ? (
              <>
                <option value="verified">Đã kiểm mẫu sản phẩm</option>
                <option value="unverified">Chờ kiểm mẫu sản phẩm</option>
                <option value="archived">Đang lưu trữ</option>
              </>
            ) : (
              <>
                <option value="running">Đang thử</option>
                <option value="draft">Bản nháp</option>
                <option value="review">Đang đánh giá</option>
              </>
            )}
          </select>
        </label>
      </div>
    );
  }
  function filtered(rows: LabRecord[]) {
    return rows
      .filter((r) =>
        JSON.stringify([
          r.data.name,
          r.data.niche,
          r.data.problem,
          r.data.market,
        ])
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .filter((r) =>
        view === "products"
          ? filter === "archived"
            ? r.data.archived
            : !r.data.archived &&
              (filter === "all" ||
                (filter === "verified"
                  ? sampleCheckState(r.data) === "verified"
                  : sampleCheckState(r.data) !== "verified"))
          : filter === "all" || r.data.status === filter,
      );
  }
  function pageRows(rows: LabRecord[]) {
    const pg = Math.min(page, Math.max(1, Math.ceil(rows.length / 8)));
    return { rows: rows.slice((pg - 1) * 8, pg * 8), page: pg };
  }
  function experimentRows(rows: LabRecord[], compact = false) {
    return (
      <div className="table-scroll">
        <table className="lab-table">
          <caption className="sr-only">Danh sách bài test</caption>
          <thead>
            <tr>
              <th scope="col">Bài test / sản phẩm</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Nhu cầu sau giá</th>
              {!compact && <th scope="col">Ý tưởng</th>}
              <th scope="col">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const p = allProducts.find((p) => p.id === e.data.productId),
                m = metrics.find((m) => m.data.experimentId === e.id);
              return (
                <tr key={e.id}>
                  <td>
                    <div className="table-product">
                      {p && productVisual(p, "tiny-art")}
                      <div>
                        <button
                          className="row-title"
                          onClick={() => openEditor("experiment", e)}
                        >
                          {e.data.name}
                        </button>
                        <small>
                          {p?.data.name || "Sản phẩm đã lưu trữ"}
                          <span>·</span>
                          {e.data.market}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge
                      tone={
                        e.data.status === "running"
                          ? "info"
                          : e.data.status === "closed"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {statusNames[e.data.status]}
                    </Badge>
                  </td>
                  <td>
                    <div className="demand-cell">
                      <strong>
                        {m ? `${m.data.leads} lead` : "Chưa có dữ liệu"}
                      </strong>
                      <small>
                        {m
                          ? `${m.data.sessions} phiên trang`
                          : "Ghi số liệu có nguồn"}
                      </small>
                    </div>
                  </td>
                  {!compact && (
                    <td>
                      {
                        creatives.filter((c) => c.data.experimentId === e.id)
                          .length
                      }
                    </td>
                  )}
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Mở bài test ${e.data.name}`}
                      onClick={() => {
                        setSelected(e.id);
                        navigate("results");
                      }}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  function overview() {
    const leads = metrics.reduce((n, m) => n + m.data.leads, 0);
    const needsProof = products.find((p) => sampleCheckState(p.data) !== "verified");
    const focus = !products.length
      ? {
          label: "BẮT ĐẦU MỘT VÒNG THỬ",
          title: "Đặt sản phẩm đầu tiên lên bàn thử.",
          detail:
            "Ghi nguồn hàng, giá và điều muốn kiểm chứng. Mọi bằng chứng sẽ theo sản phẩm suốt vòng thử.",
          action: "Thêm sản phẩm",
          run: () => openEditor("product"),
        }
      : needsProof
        ? {
            label: "BƯỚC TIẾP THEO · KIỂM CHỨNG",
            title: `Hoàn tất hồ sơ: ${needsProof.data.name}.`,
            detail:
              "Kiểm mẫu sản phẩm và ghi kết quả thật trước khi khởi chạy bài test. Một bước nhỏ để nội dung bám đúng sản phẩm.",
            action: "Mở hồ sơ sản phẩm",
            run: () => openEditor("product", needsProof),
          }
        : !experiments.length
          ? {
              label: "BƯỚC TIẾP THEO · THIẾT KẾ TEST",
              title: "Biến sản phẩm thành một giả thuyết.",
              detail:
                "Chốt khách, thị trường và điều kiện thử trước khi sản xuất nội dung.",
              action: "Tạo bài test",
              run: () => openEditor("experiment"),
            }
          : {
              label: "BƯỚC TIẾP THEO · NỘI DUNG",
              title: "Đưa ý tưởng tiếp theo vào Studio.",
              detail:
                "Rà kịch bản, hoàn thiện prompt và duyệt video theo đúng phiên bản. Tất cả nằm trong bài test đã chọn.",
              action: "Mở Studio video",
              run: () => navigate("studio"),
            };
    return (
      <>
        <section
          className="focus-workbench"
          aria-label="Việc cần làm tiếp"
        >
          <div className="focus-copy">
            <span className="focus-kicker">
              <span />
              {focus.label}
            </span>
            <h2>{focus.title}</h2>
            <p>{focus.detail}</p>
            <Button onClick={focus.run}>
              {focus.action}
              <ArrowUpRight size={16} />
            </Button>
          </div>
          <div className="focus-art" aria-hidden="true">
            <div className="focus-frame frame-back">
              <span>01 / Ý TƯỞNG</span>
              <Package size={30} />
              <i />
            </div>
            <div className="focus-frame frame-front">
              <span>02 / BẰNG CHỨNG</span>
              <div className="focus-proof">
                <Check size={24} />
              </div>
              <i />
              <i />
            </div>
            <span className="focus-note">MỖI VÒNG THỬ, MỘT ĐIỀU HỌC.</span>
          </div>
        </section>
        <div className="overview-stats">
          <div className="stat-cell">
            <span>Sản phẩm đang quản lý</span>
            <div>
              <strong>{products.length.toString().padStart(2, "0")}</strong>
              <span className="stat-icon purple">
                <Package size={19} />
              </span>
            </div>
            <small>
              {products.filter((p) => sampleCheckState(p.data) === "verified").length} đã kiểm
              mẫu sản phẩm
            </small>
          </div>
          <div className="stat-cell">
            <span>Ý tưởng đang chuẩn bị</span>
            <div>
              <strong>{creatives.length.toString().padStart(2, "0")}</strong>
              <span className="stat-icon blue">
                <Clapperboard size={19} />
              </span>
            </div>
            <small>
              {creatives.filter((c) => c.data.status === "approved").length}{" "}
              video đã duyệt
            </small>
          </div>
          <div className="stat-cell">
            <span>Quan tâm sau khi thấy giá</span>
            <div>
              <strong>{leads.toString().padStart(2, "0")}</strong>
              <span className="stat-icon green">
                <Target size={19} />
              </span>
            </div>
            <small>Lead từ số liệu {demo ? "mẫu" : "đã nhập"}</small>
          </div>
          <div className="stat-cell">
            <span>Chi phí vận hành · USD</span>
            <div>
              <strong>{formatMoney(spent)}</strong>
              <span className="stat-icon peach">
                <Wallet size={19} />
              </span>
            </div>
            <small>
              {settings.budgetUsd
                ? `Ngân sách ${formatMoney(settings.budgetUsd)}`
                : "Chưa đặt ngân sách"}
            </small>
          </div>
        </div>
        <section className="pipeline-panel">
          {sectionTitle(
            "Từ ý tưởng đến bằng chứng",
            "Mỗi sản phẩm có một bước tiếp theo.",
            <button className="text-link" onClick={() => setHelp(true)}>
              Xem quy trình
              <ArrowUpRight size={15} />
            </button>,
          )}
          <div className="pipeline-grid">
            {pipeline.map((s, i) => (
              <div className="pipeline-stage" key={s.name}>
                <div className="pipeline-stage-title">
                  <span className="stage-number">0{i + 1}</span>
                  <h3>{s.name}</h3>
                  <span className="stage-count">{s.items.length}</span>
                  {i < 3 && (
                    <ChevronRight size={16} className="stage-chevron" />
                  )}
                </div>
                <div className="stage-items">
                  {s.items.length ? (
                    s.items.slice(0, 2).map((p) => (
                      <button
                        className="pipeline-item"
                        key={p.id}
                        onClick={() => openEditor("product", p)}
                      >
                        <span
                          className={`stage-product-icon ${i === 3 ? "green" : ""}`}
                        >
                          <Package size={15} />
                        </span>
                        <span>{p.data.name}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))
                  ) : (
                    <span className="stage-empty">Chưa có sản phẩm</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="workbench-grid">
          <section className="panel experiments-panel">
            {sectionTitle(
              "Thử nghiệm đang mở",
              `${experiments.length} bài test · theo dõi từng giả thuyết`,
              <button
                className="text-link"
                onClick={() => navigate("experiments")}
              >
                Xem tất cả
                <ArrowRight size={15} />
              </button>,
            )}
            {experiments.length ? (
              experimentRows(experiments.slice(0, 4), true)
            ) : (
              <Empty
                title="Một sản phẩm. Một giả thuyết."
                text="Thêm sản phẩm rồi tạo bài test đầu tiên để bắt đầu học từ dữ liệu."
                action={
                  <Button onClick={() => openEditor("product")}>
                    <Plus size={16} />
                    Thêm sản phẩm đầu tiên
                  </Button>
                }
              />
            )}
          </section>
          <aside className="decision-panel">
            <div className="decision-title">
              <span className="stat-icon purple">
                <Lightbulb size={19} />
              </span>
              <h2>Việc cần quyết định</h2>
            </div>
            <button
              className="decision-row"
              onClick={() => navigate("products")}
            >
              <span>
                <strong>
                  {products.filter((p) => sampleCheckState(p.data) !== "verified").length} sản
                  phẩm chờ bằng chứng
                </strong>
                <small>Kiểm mẫu sản phẩm trước khi chạy test.</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button className="decision-row" onClick={() => navigate("studio")}>
              <span>
                <strong>
                  {creatives.filter((c) => c.data.status !== "approved").length}{" "}
                  ý tưởng chưa duyệt
                </strong>
                <small>Hoàn thiện script và gắn video.</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button
              className="decision-row"
              onClick={() => navigate("settings")}
            >
              <span>
                <strong>Chọn công cụ tạo video</strong>
                <small>Cần link tài liệu API chính thức.</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <div className="founder-note">
              <ShieldCheck size={17} />
              <p>
                Quyết định theo nhu cầu sau giá, đơn giao được và tiền còn lại.
              </p>
            </div>
          </aside>
        </div>
        <section className="overview-products">
          {sectionTitle(
            "Trên bàn thử nghiệm",
            "Hàng thật trước. Nội dung theo sau.",
            <button className="text-link" onClick={() => navigate("products")}>
              Quản lý sản phẩm
              <ArrowRight size={15} />
            </button>,
          )}
          <div className="product-grid overview-product-grid">
            {products.slice(0, 2).map(productCard)}
            {products.length === 0 && (
              <Empty
                title="Chưa có sản phẩm"
                text="Bắt đầu bằng món hàng bạn có thể kiểm chứng và giao được."
                action={
                  <Button onClick={() => openEditor("product")}>
                    Thêm sản phẩm
                  </Button>
                }
              />
            )}
          </div>
        </section>
      </>
    );
  }
  function workspaceNotice(productScreen = false) {
    const visible = showWorkspaceBanner(records, demo, loading);
    if (!productScreen && !visible) return null;
    const storage = demo ? "Dữ liệu mẫu để xem thử." : desktopBridge() ? "Dữ liệu của bạn · lưu trên máy này." : "Dữ liệu của bạn · lưu riêng trên máy chủ.";
    return <div className={productScreen ? "info-strip product-info" : "workspace-mode"}>
      <div className="mode-label">
        {demo ? <Sparkles size={15}/> : <ShieldCheck size={15}/>}
        <span>{productScreen ? `${visible ? storage + " " : ""}Nguồn hàng, bằng chứng và chi phí theo sản phẩm.` : storage}</span>
      </div>
      {visible && <Button tone="neutral" onClick={() => switchMode(!demo)}>
        {demo ? "Dùng dữ liệu của bạn" : "Khám phá bản mẫu"}<ArrowRight size={14}/>
      </Button>}
    </div>;
  }
  function productsView() {
    const rows = filtered(allProducts),
      paged = pageRows(rows);
    return (
      <>
        {workspaceNotice(true)}
        {toolbar()}
        {rows.length ? (
          <>
            <div className="product-grid">{paged.rows.map(productCard)}</div>
            <Pagination
              page={paged.page}
              total={rows.length}
              onPage={changePage}
            />
          </>
        ) : (
          <Empty
            title={
              query
                ? "Không tìm thấy sản phẩm"
                : "Chưa có sản phẩm ở trạng thái này"
            }
            text="Thêm sản phẩm hoặc điều chỉnh bộ lọc để tiếp tục."
            action={
              <Button
                tone="neutral"
                onClick={() => {
                  search("");
                  setFilter("all");
                }}
              >
                Xóa bộ lọc
              </Button>
            }
          />
        )}
      </>
    );
  }
  function experimentsView() {
    const rows = filtered(experiments),
      paged = pageRows(rows);
    return (
      <>
        <div className="info-strip">
          <FlaskConical size={18} />
          <span>
            Giữ giá, kêu gọi hành động và thị trường ổn định khi thử mở đầu. Mỗi bài test có một
            giả thuyết.
          </span>
        </div>
        <section className="panel">
          {toolbar()}
          {rows.length ? (
            experimentRows(paged.rows)
          ) : (
            <Empty
              title={query ? "Không có bài test phù hợp" : "Chưa có bài test"}
              text="Chọn sản phẩm, đặt giả thuyết và ghi điều kiện thử."
              action={
                <Button onClick={() => openEditor("experiment")}>
                  <Plus size={16} />
                  Tạo bài test
                </Button>
              }
            />
          )}
          <Pagination
            page={paged.page}
            total={rows.length}
            onPage={changePage}
          />
        </section>
      </>
    );
  }
  function studioView() {
    const list = creatives.filter(
        (c) => !exp || c.data.experimentId === exp.id,
      ),
      jobList = jobs.filter((j) =>
        list.some((c) => c.id === j.data.creativeId),
      );
    return (
      <>
        <div className="studio-topbar">
          <div className="segmented" aria-label="Nội dung Studio">
            <button
              aria-pressed={studioTab === "concepts"}
              onClick={() => setStudioTab("concepts")}
            >
              <Layers size={16} />
              Ý tưởng<span>{list.length}</span>
            </button>
            <button
              aria-pressed={studioTab === "jobs"}
              onClick={() => setStudioTab("jobs")}
            >
              <Video size={16} />
              Hàng đợi<span>{jobList.length}</span>
            </button>
          </div>
          <label className="experiment-select">
            <span className="sr-only">Chọn bài test cho Studio</span>
            <select
              value={exp?.id || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {experiments.length ? (
                experiments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.data.name}
                  </option>
                ))
              ) : (
                <option value="">Chưa có bài test</option>
              )}
            </select>
          </label>
          <Button
            onClick={() => void generate()}
            busy={busy === "brief"}
            disabled={!exp || settings.paused}
          >
            <Sparkles size={16} />
            Tạo 6 khung kịch bản
          </Button>
        </div>
        {exp && (
          <section
            className="studio-context"
            aria-label="Tóm tắt bài test đang chọn"
          >
            <div className="studio-context-name">
              <span className="context-icon">
                <FlaskConical size={20} />
              </span>
              <div>
                <span>BÀI TEST ĐANG CHỌN</span>
                <strong>{exp.data.name}</strong>
                <small>
                  {
                    allProducts.find((p) => p.id === exp.data.productId)?.data
                      .name
                  }{" "}
                  · {exp.data.market}
                </small>
              </div>
            </div>
            <div className="studio-counters">
              <div>
                <strong>{list.length.toString().padStart(2, "0")}</strong>
                <span>Ý tưởng</span>
              </div>
              <div>
                <strong>
                  {list
                    .filter((c) => !c.data.mediaUrl)
                    .length.toString()
                    .padStart(2, "0")}
                </strong>
                <span>Chờ video</span>
              </div>
              <div>
                <strong>
                  {list
                    .filter((c) => c.data.status === "approved")
                    .length.toString()
                    .padStart(2, "0")}
                </strong>
                <span>Đã duyệt</span>
              </div>
              <div>
                <strong>{jobList.length.toString().padStart(2, "0")}</strong>
                <span>Tác vụ chuẩn bị</span>
              </div>
            </div>
          </section>
        )}
        <MuseConnectionStrip onNavigate={navigate} />
        {studioTab === "concepts" ? (
          list.length ? (
            <div className="creative-grid">
              {list.map((c, i) => {
                const p = allProducts.find((p) => p.id === c.data.productId);
                const duration = creativeDuration(c.data.script);
                return (
                  <article key={c.id} className="creative-card">
                    <button
                      className={`storyboard storyboard-${i % 3}`}
                      onClick={() => openEditor("creative", c)}
                      aria-label={`Mở ý tưởng ${c.data.name}`}
                    >
                      <div className="storyboard-top">
                        <span>Ý TƯỞNG {String(i + 1).padStart(2, "0")}</span>
                        <span>{duration === null ? "Chưa rõ thời lượng" : `${duration}s · theo kịch bản`}</span>
                      </div>
                      {c.data.mediaUrl ? (
                        /^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(c.data.mediaUrl)
                          ? <img src={`${c.data.mediaUrl}?thumbnail=1`} loading="lazy" alt={`Ảnh xem trước ${c.data.name}`}/>
                          : <div className="storyboard-copy"><span>Video đã gắn</span><strong>Chọn để xem video</strong></div>
                      ) : (
                        <>
                          <div className="storyboard-copy">
                            <span>{c.data.angle}</span>
                            <strong>{c.data.hook}</strong>
                          </div>
                          {p && (
                            <ProductArt
                              type={p.data.name}
                              className="storyboard-art"
                            />
                          )}
                        </>
                      )}
                      <span className="storyboard-open">
                        {c.data.mediaUrl ? (
                          <Play size={15} />
                        ) : (
                          <FileText size={15} />
                        )}
                        Mở ý tưởng
                      </span>
                    </button>
                    <div className="creative-info">
                      <div>
                        <h3>{c.data.name}</h3>
                        <Badge
                          tone={
                            c.data.status === "approved"
                              ? "success"
                              : c.data.status === "ready"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {statusNames[c.data.status]}
                        </Badge>
                      </div>
                      <p>
                        {p?.data.name} ·{" "}
                        {c.data.source === "template"
                          ? "Khung mẫu, chưa gọi LLM"
                          : c.data.source === "manual"
                            ? "Nhập thủ công"
                            : "Từ công cụ tạo"}
                      </p>
                      {c.data.source === "template" && (
                        <div
                          className="scene-strip"
                          aria-label="Cấu trúc kịch bản mẫu"
                        >
                          <span>
                            <i />
                            Mở đầu
                          </span>
                          <ChevronRight size={12} />
                          <span>
                            <i />
                            Bản mẫu
                          </span>
                          <ChevronRight size={12} />
                          <span>
                            <i />
                            Kêu gọi hành động
                          </span>
                        </div>
                      )}
                      <div className="creative-actions">
                        <Button
                          tone="neutral"
                          onClick={() => openEditor("creative", c)}
                        >
                          <Pencil size={14} />
                          Chỉnh sửa
                        </Button>
                        <Button
                          tone="ghost"
                          onClick={() => void prepare(c)}
                          busy={busy === c.id}
                          disabled={!!busy || settings.paused}
                        >
                          Chuẩn bị tác vụ nháp
                          <ArrowRight size={14} />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Tạo kịch bản đầu tiên"
              text="Chọn bài test rồi tạo 3 góc nội dung × 2 cách mở đầu. Bạn có thể sửa toàn bộ kịch bản và prompt."
              action={
                exp ? (
                  <Button
                    onClick={() => void generate()}
                    busy={busy === "brief"}
                  >
                    Tạo 6 khung kịch bản
                  </Button>
                ) : (
                  <Button onClick={() => openEditor("experiment")}>
                    Tạo bài test
                  </Button>
                )
              }
            />
          )
        ) : (
          <section className="panel">
            {sectionTitle(
              "Hàng đợi tạo video",
              "Tác vụ được lưu để nối công cụ tạo và đối soát về sau.",
            )}{" "}
            {jobList.length ? (
              <div className="job-list">
                {jobList.map((j) => {
                  const c = creatives.find((c) => c.id === j.data.creativeId);
                  return (
                    <article key={j.id} className="job-row">
                      <span className="stat-icon purple">
                        <Video size={20} />
                      </span>
                      <div>
                        <strong>
                          {c?.data.name || "Concept"} · v
                          {j.data.creativeRevision}
                        </strong>
                        <small>
                          {formatTime(j.updatedAt)} · Chưa gửi API · Chi phí 0
                          USD
                        </small>
                      </div>
                      <Badge tone="warning">Chờ nối API</Badge>
                      <Button
                        tone="neutral"
                        onClick={() => download(`${j.id}.json`, j.data.payload)}
                      >
                        <Download size={15} />
                        Tải payload
                      </Button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty
                title="Chưa có tác vụ"
                text="Mở một ý tưởng và chọn Chuẩn bị tác vụ nháp. Mỗi phiên bản chỉ có một tác vụ, tránh tạo trùng."
                action={
                  <Button
                    tone="neutral"
                    onClick={() => setStudioTab("concepts")}
                  >
                    Xem ý tưởng
                  </Button>
                }
              />
            )}
          </section>
        )}
      </>
    );
  }
  function resultsView() {
    if (!exp)
      return (
        <Empty
          title="Chưa có bài test để đo"
          text="Tạo bài test trước khi ghi số liệu."
          action={
            <Button onClick={() => openEditor("experiment")}>
              Tạo bài test
            </Button>
          }
        />
      );
    const m = metrics.find((m) => m.data.experimentId === exp.id),
      p = allProducts.find((p) => p.id === exp.data.productId),
      advice = metricAdvice(m?.data, exp.data.targetSessions),
      ss = signals.filter((s) => s.data.experimentId === exp.id);
    return (
      <>
        <div className="results-toolbar">
          <label>
            <span>Bài test đang xem</span>
            <select
              value={exp.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {experiments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.data.name}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => openEditor("metric", m)}>
            <Plus size={16} />
            {m ? "Cập nhật số liệu" : "Ghi số liệu"}
          </Button>
        </div>
        <div className={`advice-banner ${advice.tone}`}>
          <Target size={22} />
          <div>
            <strong>{advice.label}</strong>
            <p>{advice.text}</p>
          </div>
          <Badge tone={demo ? "warning" : "neutral"}>
            {demo ? "Số liệu mẫu" : "Nhập tay · có nguồn"}
          </Badge>
        </div>
        <div className="funnel-grid">
          {[
            {
              label: "Phiên trang",
              v: m?.data.sessions,
              sub: "Lượt tới trang đủ điều kiện",
            },
            {
              label: "Quan tâm sau giá",
              v: m?.data.leads,
              sub: "Chưa phải khách thanh toán",
            },
            {
              label: "Đơn thanh toán",
              v: m?.data.orders,
              sub: "Cần theo dõi hủy và hoàn",
            },
            {
              label: "Đơn đã giao",
              v: m?.data.delivered,
              sub: "Kiểm thời gian giữ hàng",
            },
          ].map((x, i) => (
            <div className="funnel-step" key={x.label}>
              <span className="funnel-index">0{i + 1}</span>
              <span>{x.label}</span>
              <strong>{x.v ?? "—"}</strong>
              <small>{x.sub}</small>
            </div>
          ))}
        </div>
        <div className="results-grid">
          <section className="panel">
            {sectionTitle(
              "Đọc số liệu đúng ngữ cảnh",
              m
                ? `Cập nhật ${formatTime(m.updatedAt)} · ${exp.data.market}`
                : "Chưa có bản lưu",
            )}
            <div className="result-metrics">
              <div>
                <span>Lead / phiên trang</span>
                <strong>
                  {m && m.data.sessions
                    ? `${m.data.leads}/${m.data.sessions} · ${((m.data.leads / m.data.sessions) * 100).toFixed(1)}%`
                    : "Chưa xác định"}
                </strong>
              </div>
              <div>
                <span>Đơn / phiên trang</span>
                <strong>
                  {m && m.data.sessions
                    ? `${m.data.orders}/${m.data.sessions} · ${((m.data.orders / m.data.sessions) * 100).toFixed(1)}%`
                    : "Chưa xác định"}
                </strong>
              </div>
              <div>
                <span>Doanh thu thuần</span>
                <strong>
                  {m ? formatMoney(m.data.netRevenue, p?.data.currency) : "—"}
                </strong>
              </div>
              <div>
                <span>Còn lại theo chi phí đã nhập</span>
                <strong>
                  {m
                    ? formatMoney(
                        m.data.netRevenue - m.data.totalCosts,
                        p?.data.currency,
                      )
                    : "—"}
                </strong>
              </div>
            </div>
            <div className="panel-note">
              <Info size={16} />
              <p>
                Bản lưu lũy kế thay thế số cũ. Số liệu nhập tay chưa được nền
                tảng xác minh; chi phí thiếu sẽ làm lợi nhuận nhìn tốt hơn thực
                tế.
              </p>
            </div>
            {m?.data.sourceUrl && (
              <a
                className="source-link"
                href={m.data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Mở nguồn số liệu
                <ExternalLink size={14} />
              </a>
            )}
          </section>
          <section className="panel">
            {sectionTitle(
              "Tín hiệu trong bình luận",
              "Phân nhóm bằng quy tắc, cần bạn rà lại.",
              <Button tone="ghost" onClick={() => openEditor("signal")}>
                <Plus size={15} />
                Ghi bình luận
              </Button>,
            )}
            {ss.length ? (
              <div className="signal-list">
                {ss.slice(0, 20).map((s) => (
                  <article key={s.id}>
                    <MessageSquare size={16} />
                    <div>
                      <p>“{s.data.text}”</p>
                      <div className="signal-tags">
                        {s.data.labels.map((l: string) => (
                          <Badge key={l}>{l}</Badge>
                        ))}
                      </div>
                      <small>
                        {s.data.source} · {formatTime(s.updatedAt)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="Chưa ghi mẫu bình luận"
                text="Lưu câu hỏi về giá, ship hoặc độ phù hợp. Từ khóa và emoji được tách riêng."
              />
            )}
          </section>
        </div>
      </>
    );
  }
  function settingsView() {
    return (
      <>
        <div className="connection-hero">
          <div className="connection-hero-icon">
            <PlugZap size={32} />
          </div>
          <div>
            <span className="eyebrow">CẤU HÌNH LÀM VIỆC</span>
            <h2>Kết nối và cài đặt</h2>
            <p>
              Nhà cung cấp, ngân sách vận hành và bản sao dữ liệu. Các dịch vụ
              chưa kết nối được ghi rõ bên dưới.
            </p>
          </div>
          <Button
            onClick={() =>
              openEditor(
                "settings",
                records.find((r) => r.kind === "settings"),
              )
            }
          >
            <Pencil size={16} />
            Cập nhật cài đặt
          </Button>
        </div>
        <MuseConnectionStrip onNavigate={navigate} />
        <ManualMediaSettings demo={demo}/><AssistantSettings demo={demo}/><InstagramSettings records={records} demo={demo}/>
        <div className="connection-grid">
          {[
            {
              icon: BarChart3,
              title: "Mạng xã hội và số liệu",
              status: "Instagram Login",
              copy: "Cấu hình từng tài khoản ở trên. API đọc số liệu; comment → DM chỉ chạy theo quy tắc đã duyệt khi app mở.",
            },
          ].map((x) => (
            <article className="connection-card" key={x.title}>
              <span className="connection-card-icon">
                <x.icon size={24} />
              </span>
              <Badge tone="warning">{x.status}</Badge>
              <h3>{x.title}</h3>
              <p>{x.copy}</p>
            </article>
          ))}
        </div>
        <div className="settings-grid">
          <section className="panel">
            {sectionTitle("Tạo ảnh và video với Muse", "Quản lý phiên đăng nhập và hạn mức tại Tài khoản.")}
            <p>Mở hồ sơ để đăng nhập Muse, kiểm tra VPN và đo hạn mức trước khi tạo ảnh hoặc video.</p>
            <p>Mỗi tài khoản có tối đa 3 lần gửi tạo ảnh/video trong một đợt. Bắt đầu đợt mới tại Tài khoản khi các tác vụ đang chạy đã kết thúc.</p>
            <Button tone="neutral" onClick={() => navigate("accounts")}>Quản lý tài khoản Muse</Button>
            {settings.providerDocs && (
              <a
                className="source-link"
                href={settings.providerDocs}
                target="_blank"
                rel="noopener noreferrer"
              >
                Mở tài liệu đã ghi
                <ExternalLink size={14} />
              </a>
            )}
          </section>
          <section className="panel budget-panel">
            {sectionTitle(
              "Ngân sách vận hành",
              "Một tiền tệ cho chi phí Lab: USD.",
            )}
            <div className="budget-number">
              {formatMoney(spent)}
              <small>
                /{" "}
                {settings.budgetUsd
                  ? formatMoney(settings.budgetUsd)
                  : "chưa đặt trần"}
              </small>
            </div>
            <div className="budget-track">
              <span
                style={{
                  width: `${settings.budgetUsd ? Math.min(100, (spent / settings.budgetUsd) * 100) : 0}%`,
                }}
              />
            </div>
            <p>
              {settings.budgetUsd
                ? `Còn lại ${formatMoney(settings.budgetUsd - spent)}`
                : "Đặt mức ngân sách trước khi kết nối API trả phí."}
            </p>
            <Button tone="neutral" onClick={() => openEditor("cost")}>
              <Plus size={16} />
              Ghi khoản chi
            </Button>
            <div className="budget-costs">
              {costs.slice(0, 6).map((c) => (
                <div key={c.id}>
                  <span>
                    {c.data.name}
                    <small>{categoryNames[c.data.category]}</small>
                  </span>
                  <strong>{formatMoney(c.data.amount)}</strong>
                </div>
              ))}
            </div>
            <div className="backup-line">
              <div>
                <strong>Bản sao dữ liệu</strong>
                <small>Tải JSON để giữ một bản riêng.</small>
              </div>
              <Button tone="ghost" onClick={exportData}>
                <Download size={17} />
                Xuất dữ liệu
              </Button>
            </div>
          </section>
        </div>
      </>
    );
  }
  return (
    <div className={`lab-shell workbench-shell ${["production","images","library"].includes(view)?"is-production-route":""}`}>
      <a href="#lab-main" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="?view=production"
          onClick={(e) => {
            e.preventDefault();
            navigate("production");
          }}
        >
          <span className="brand-mark">
            <img src="/favicon.svg" width={25} height={25} alt="Hermes Clip" />
          </span>
          <span>
            Hermes<span className="brand-light"> Clip</span>
            
          </span>
        </a>
        <div className="sidebar-navigation">
          <nav aria-label="Tạo nội dung">
            {navigation.filter(item => !businessViews.has(item.id) && item.id !== "settings" && item.id !== "images").map(item => (
              <a key={item.id} href={`?view=${item.id}`} aria-current={view === item.id ? "page" : undefined}
                className={view === item.id ? "active" : ""}
                onClick={event => { event.preventDefault(); navigate(item.id); }}>
                <item.icon size={19}/><span>{item.label}</span>
              </a>
            ))}
          </nav>
          <details className="business-navigation" key={businessViews.has(view) ? "business-active" : "creation-active"} open={businessViews.has(view)}>
            <summary><BarChart3 size={18}/><span>Kinh doanh</span><ChevronDown size={14}/></summary>
            <nav aria-label="Kinh doanh">
              {navigation.filter(item => businessViews.has(item.id)).map(item => (
                <a key={item.id} href={`?view=${item.id}`} aria-current={view === item.id ? "page" : undefined}
                  className={view === item.id ? "active" : ""}
                  onClick={event => { event.preventDefault(); navigate(item.id); }}>
                  <item.icon size={17}/><span>{item.label}</span>
                </a>
              ))}
            </nav>
          </details>
        </div>
        <div className="sidebar-bottom">
          <nav aria-label="Tiện ích">
            <a href="?view=settings" aria-current={view === "settings" ? "page" : undefined} className={view === "settings" ? "active" : ""}
              onClick={event => { event.preventDefault(); navigate("settings"); }}><PlugZap size={18}/><span>Cài đặt</span></a>
          </nav>
          <button className="sidebar-help" onClick={() => setHelp(true)}><BookOpen size={18}/><span>Hướng dẫn</span></button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Không gian làm việc</span>
            <ChevronRight size={14} />
            <strong>{label}</strong>
          </div>
          <div className="topbar-right">
            <span className="sync-label">
              <span
                className={
                  demo ? "demo-dot" : lastSync ? "sync-dot" : "pending-dot"
                }
              />
              {demo
                ? "Đang xem mẫu"
                : loading
                  ? "Đang kết nối"
                  : lastSync
                    ? "Đã đồng bộ"
                    : "Chưa đồng bộ"}
            </span>
            <button
              className="icon-button"
              aria-label="Tải lại dữ liệu"
              disabled={loading}
              onClick={() => void load(true)}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <span className="topbar-divider" />
            <span className="user-avatar small">CD</span>
          </div>
        </header>
        <main id="lab-main" tabIndex={-1}>
          <div className="page-heading" hidden={["research", "social", "landing", "accounts", "queue", "chat", "library"].includes(view)}>
            <div>
              {view !== "products" && <div className="page-eyebrow">
                HERMES CLIP <span>/</span>{" "}
                {demo ? "KHÔNG GIAN MẪU" : "KHÔNG GIAN RIÊNG TƯ"}
              </div>}
              <h1>{view === "overview" ? "Bàn thử nghiệm" : label}</h1>
              <p>
                {view === "overview"
                  ? "Biến ý tưởng thành những bài test có thể đo được."
                  : view === "products"
                    ? "Những món hàng đáng để kiểm chứng."
                    : view === "experiments"
                      ? "Mỗi bài test trả lời một câu hỏi cụ thể."
                      : view === "studio"
                        ? "Từ góc nội dung đến video được duyệt."
                        : view === "results"
                          ? "Nhìn rõ tín hiệu. Quyết định có bằng chứng."
                          : view === "production"
                            ? "Từ tham chiếu chuẩn đến từng cảnh, phiên bản và biến thể có thể truy vết."
                          : view === "chat" ? "Hội thoại với Muse qua hồ sơ đã đăng nhập."
                          : view === "accounts" ? "Đăng nhập, kiểm tra phiên và hạn mức Muse."
                          : "Quản lý công cụ, ngân sách và dữ liệu."}
              </p>
            </div>
            <div className="page-actions">
              {view === "overview" || view === "products" ? (
                <Button onClick={() => openEditor("product")}>
                  <Plus size={17} />
                  Thêm sản phẩm
                </Button>
              ) : view === "experiments" ? (
                <Button onClick={() => openEditor("experiment")}>
                  <Plus size={17} />
                  Tạo bài test
                </Button>
              ) : view === "settings" ? (
                <Button tone="neutral" onClick={exportData}>
                  <Download size={16} />
                  Xuất dữ liệu
                </Button>
              ) : null}
            </div>
          </div>
          {view !== "products" && workspaceNotice()}
          {offline && (
            <div className="persistent-error" role="status">
              <Info size={18} />
              Đang ngoại tuyến. Dữ liệu đã mở vẫn xem được; giữ biểu mẫu và thử
              lưu khi có mạng.
            </div>
          )}
          {error && (!demo || !initialModeApplied.current) && (
            <div className="persistent-error" role="alert">
              <Info size={18} />
              <span>{error}</span>
              {!desktopBridge() && <a href="/signin-with-chatgpt?return_to=/" target="_top">
                Đăng nhập
              </a>}
              <button onClick={() => void load()}>Thử lại</button>
            </div>
          )}
          {settings.paused && (
            <div className="pause-banner">
              <Pause size={17} />
              Hermes Clip đang tạm dừng tạo bản yêu cầu, tác vụ và thử nghiệm.
              <button onClick={() => navigate("settings")}>Mở cài đặt</button>
            </div>
          )}
          {error && !initialModeApplied.current ? (
            <Empty title="Chưa mở được không gian làm việc" text="Thử tải lại để mở dữ liệu đã lưu trên app."/>
          ) : loading && real.length === 0 ? (
            <div className="loading-region" role="status">
              <Loader2 className="spin" />
              Đang mở không gian làm việc…
            </div>
          ) : view === "overview" ? (
            overview()
          ) : view === "products" ? (
            productsView()
          ) : ["research", "social", "landing"].includes(view) ? (
            <OperationsPanel key={`${demo}-${view}`} view={view as "research" | "social" | "landing"} records={records} demo={demo} offline={offline} persist={persist} notify={notify} reload={() => void load()} onRecords={rows=>{if(demo)putMemory(rows);else setReal(previous=>[...rows,...previous.filter(row=>!rows.some(next=>next.id===row.id))]);}}/>
          ) : view === "chat" ? (
            null
          ) : view === "experiments" ? (
            experimentsView()
          ) : view === "studio" ? (
            studioView()
          ) : view === "results" ? (
            resultsView()
          ) : view === "library" ? (<WorkspaceLibrary key={demo ? 'demo-library' : 'real-library'} records={records} demo={demo}/>) : view === "queue" ? (<DesktopConsole mode="queue" records={records} demo={demo}/>) : ["production","images"].includes(view) ? null : view === "accounts" ? (
            <section className="accounts-view"><DesktopConsole active={view==="accounts"}/></section>
          ) : (
            settingsView()
          )}
          <div hidden={!["production","images"].includes(view) || !initialModeApplied.current}><ProductionStudio key={demo ? "demo-production" : "real-production"} surface={view==="images"?"images":view==="library"?"library":"production"} active={["production","images"].includes(view) && initialModeApplied.current} onSwitchMode={()=>switchMode(!demo)} records={records} demo={demo} offline={offline} paused={settings.paused} onRecord={(r)=>{if(demo)putMemory([r]);else setReal(prev=>[r,...prev.filter(x=>x.id!==r.id)]);}} reload={()=>void load()} notify={notify}/></div>
          <div hidden={view !== "chat" || !initialModeApplied.current}><MuseChatPanel key={demo ? 'demo-chat' : 'real-chat'} demo={demo} active={view === "chat" && initialModeApplied.current} records={records} onCompose={(mode, prompt, projectId) => {
            sessionStorage.setItem('hermes-composer-transfer', JSON.stringify({mode, prompt, projectId}));
            const nextView = mode === 'image' ? 'images' : 'production';
            setView(nextView);
            history.pushState({}, '', '?view=' + nextView + '&production=' + encodeURIComponent(projectId) + '&stage=scenes');
            window.dispatchEvent(new PopStateEvent('popstate'));
            window.dispatchEvent(new Event('hermes-compose'));
          }}/></div>
          <footer className="app-footer">
            <span>
              <FlaskConical size={14} />
              Hermes Clip
            </span>
            <span>
              {demo
                ? "Bản mẫu tương tác · thay đổi không lưu sau khi tải lại"
                : lastSync
                  ? `Đồng bộ ${formatTime(lastSync)} · giờ Việt Nam`
                  : "Dữ liệu chỉ được xác nhận sau khi máy chủ phản hồi"}
            </span>
          </footer>
        </main>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <Modal
        open={!!editor}
        onClose={() => {
          setEditor(null);
          setDirty(false);
        }}
        title={editor?.title || ""}
        description={
          demo
            ? "Đang chỉnh dữ liệu mẫu; không lưu vào dữ liệu của bạn."
            : "Thông tin được lưu trong không gian làm việc của bạn."
        }
        dirty={dirty}
        locked={editorSaving}
      >
        {editor && (
          <RecordForm
            key={editor.id}
            kind={editor.kind}
            initial={editor.initial}
            fields={fieldDefs()}
            extra={editor.kind === "product" ? (values, change, errors) => <SampleCheckFields values={values} change={change} errors={errors} records={records}/> : undefined}
            onSave={saveEditor}
            onCancel={() => {
              setEditor(null);
              setDirty(false);
            }}
            onDirty={setDirty}
            approve={editor.kind === "creative"}
            demo={demo}
          />
        )}
      </Modal>
      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title={`Lưu trữ “${archiveTarget?.data.name || ""}”?`}
        description="Hồ sơ và dữ liệu liên quan vẫn được giữ, có thể khôi phục."
      >
        <div className="modal-body">
          <p>
            Sản phẩm sẽ rời danh sách đang hoạt động. Đây là thao tác có thể
            khôi phục từ bộ lọc Đang lưu trữ.
          </p>
        </div>
        <div className="form-actions">
          <Button tone="neutral" onClick={() => setArchiveTarget(null)}>
            Giữ sản phẩm
          </Button>
          <Button
            busy={busy === "archive"}
            onClick={async () => {
              if (!archiveTarget) return;
              setBusy("archive");
              try {
                await persist(
                  "product",
                  archiveTarget.id,
                  { ...archiveTarget.data, archived: true },
                  archiveTarget.revision,
                );
                setArchiveTarget(null);
                notify("Đã lưu trữ sản phẩm. Có thể khôi phục trong bộ lọc.");
              } catch (e) {
                notify((e as Error).message, "error");
              } finally {
                setBusy("");
              }
            }}
          >
            <Archive size={16} />
            Lưu trữ sản phẩm
          </Button>
        </div>
      </Modal>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title="Một vòng Hermes Clip"
        description="Từ ý tưởng tới bằng chứng, với điểm dừng ở mỗi chặng."
      >
        <div className="modal-body flow-help">
          {[
            "Chốt khách, thị trường, giá và mức lỗ có thể chấp nhận.",
            "Tìm hàng, kiểm supplier và biên lợi nhuận dự kiến.",
            "Kiểm mẫu sản phẩm, ghi điều kiện và giới hạn công dụng.",
            "Khóa giả thuyết, trang có giá và biến muốn thử.",
            "Tạo kịch bản, video; bạn duyệt phiên bản cuối.",
            "Đo đúng tệp và quan tâm sau khi thấy giá.",
            "Thử đơn thật khi nguồn hàng, giao và support đã sẵn sàng.",
            "Đối soát giao, hoàn, chi phí; tăng từng bước khi lặp lại có lãi.",
          ].map((s, i) => (
            <div key={s}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <p>{s}</p>
            </div>
          ))}
          <div className="info-strip">
            <Info size={17} />
            <span>
              V1 quản lý và đo thủ công. Kết nối video, social và bán hàng sẽ bổ
              sung theo API được xác minh.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
