import { emptyProduct, makeBriefs, type LabRecord } from "./domain";
export function demoRecords(): LabRecord[] {
  const now = Date.UTC(2026, 10, 2, 9, 0);
  const r = (
    id: string,
    kind: LabRecord["kind"],
    data: Record<string, any>,
  ): LabRecord => ({ id, kind, data, revision: 1, updatedAt: now });
  const p = r("demo-brush", "product", {
    ...emptyProduct,
    name: "Lược tạo kiểu",
    niche: "Chăm sóc tóc",
    customer: "Người muốn rút gọn thời gian tạo kiểu buổi sáng",
    problem: "Tốn thời gian chuẩn bị tóc trước khi ra ngoài.",
    price: 49,
    cost: 17,
    shipping: 6,
    fees: 3,
    buffer: 4,
    sampleVerified: true,
    proofNotes:
      "DỮ LIỆU MẪU: minh họa trạng thái đã kiểm sample, không phải bằng chứng thực tế.",
  });
  const q = r("demo-lamp", "product", {
    ...emptyProduct,
    name: "Đèn đọc sách",
    niche: "Không gian sống",
    customer: "Người đọc sách buổi tối",
    problem: "Đèn phòng làm phiền người bên cạnh.",
    price: 29,
    cost: 10,
    shipping: 5,
    fees: 2,
    buffer: 2,
  });
  const e = r("demo-morning", "experiment", {
    name: "Một buổi sáng bớt vội",
    productId: p.id,
    market: "US · minh họa",
    hypothesis:
      "Người cần chuẩn bị nhanh sẽ quan tâm sau khi thấy thao tác thật và giá 49 USD.",
    offerUrl: "",
    status: "running",
    targetSessions: 100,
    decision: "pending",
    decisionNotes: "",
    archived: false,
  });
  const f = r("demo-reading", "experiment", {
    name: "Góc đọc sách riêng",
    productId: q.id,
    market: "Chưa chọn",
    hypothesis:
      "Thử xem nhóm đọc sách buổi tối có quan tâm tới sản phẩm ở mức giá dự kiến.",
    offerUrl: "",
    status: "draft",
    targetSessions: 100,
    decision: "pending",
    decisionNotes: "",
    archived: false,
  });
  const creatives = makeBriefs(p, e).map((b, i) => ({
    ...b,
    revision: 1,
    updatedAt: now - i * 1000,
  }));
  return [
    p,
    q,
    e,
    f,
    ...creatives,
    r("metric_demo-morning", "metric", {
      experimentId: e.id,
      views: 8420,
      sessions: 184,
      leads: 13,
      orders: 0,
      delivered: 0,
      returned: 0,
      netRevenue: 0,
      totalCosts: 0,
      sourceUrl: "",
      notes: "SỐ LIỆU MẪU: chỉ để khám phá giao diện.",
    }),
    r("workspace", "settings", {
      budgetUsd: 150,
      paused: false,
      providerName: "Chưa chọn provider",
      providerDocs: "",
      notes: "",
    }),
  ];
}
