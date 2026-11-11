Đây là kiểm máy móc. Vẫn cần review nội dung theo skill hermes-night-review trước khi áp vào app chính.

# Tự review đêm

Phạm vi: `origin/main..HEAD`; SHA đã chốt: `0e1571627d75b29cf918ea5c14cc683b08a973a1..a35780130b334d6045a642b5cf5988471b995f14`.
Mỗi dòng là một commit; báo cáo được đọc tại commit đó. Cờ là dấu hiệu cần đọc diff, không phải kết luận chất lượng. Không kiểm GUI, Muse, Instagram hoặc tiêu chí nghiệp vụ.
Log chỉ được gắn khi có mã task và SHA commit; dùng lượt cuối trước dòng hoàn tất. Không suy trạng thái từ log khác lượt hoặc chỉ từ thời gian.

| Task | Commit | Trạng thái máy đọc | Cờ | Báo cáo |
| --- | --- | --- | --- | --- |
| T01 | `709280ebd343` | done | Muse workflows: 7272 → 7926 ký tự (+654) | `ops/night/out/reports/T01.md` |
| T02 | `7286960fc9c0` | done | Muse workflows: 7926 → 8294 ký tự (+368)<br>Mặc định 0 ngoài test: lib/lab/research-quality.ts:37, lib/lab/research-quality.ts:41 | `ops/night/out/reports/T02.md` |
| T11 | `74c88f7f62e1` | partial | Muse workflows: 8294 → 8599 ký tự (+305)<br>Mặc định 0 ngoài test: components/lab/research-sources.tsx:30, components/lab/research-sources.tsx:40, desktop/src/integrations.mjs:41 | `ops/night/out/reports/T11.md` |
| T03 | `f45e8f6fc8c8` | done | Không | `ops/night/out/reports/T03.md` |
| T05 | `593e4298ba01` | done | Không | `ops/night/out/reports/T05.md` |
| T12 | `a83d5b964c9d` | Đã bỏ | Mặc định 0 ngoài test: desktop/src/integrations.mjs:45, desktop/src/reference-structure.mjs:54, desktop/src/reference-youtube.mjs:63 | `ops/night/out/reports/T12.md` |
| T06 | `3f2bb10df041` | Chưa làm | Không | `ops/night/out/reports/T06.md` |
| T04 | `b84917dc8b53` | Chưa làm | Không | `ops/night/out/reports/T04.md` |
| T07 | `8207b99e6983` | Chưa làm | Không | `ops/night/out/reports/T07.md` |
| T08 | `f43849c56b71` | Chưa làm | Không | `ops/night/out/reports/T08.md` |
| T09 | `d4c6ee2b4b98` | Chưa làm | Không | `ops/night/out/reports/T09.md` |
| T10 | `55e6fa543593` | Chưa làm | Không | `ops/night/out/reports/T10.md` |
| T13 | `deb5620f2b4f` | done | Không | `ops/night/out/reports/T13.md` |
| T14 | `11a8f9464aa0` | done | Dòng test bị xóa: 4; desktop/test/research-runner.test.mjs (1), desktop/test/research-sources-ui.test.mjs (1), desktop/test/research-sources.test.mjs (2)<br>Mặc định 0 ngoài test: components/lab/research-sources.tsx:46 | `ops/night/out/reports/T14.md` |
| T06 | `3a80892c7501` | done | Mặc định 0 ngoài test: lib/lab/intelligence.ts:11 | `ops/night/out/reports/T06.md` |
| T12 | `c66140bf780b` | done | Mặc định 0 ngoài test: components/lab/reference-video.tsx:130, desktop/src/reference-structure.mjs:54, desktop/src/reference-youtube.mjs:63 | `ops/night/out/reports/T12.md` |
| T04 | `758c8b207f47` | done | Muse workflows: 8599 → 8687 ký tự (+88)<br>Mặc định 0 ngoài test: scripts/check-research-ui.mjs:39, scripts/check-research-ui.mjs:40 | `ops/night/out/reports/T04.md` |
| T07 | `95c35ad0d012` | done | Không | `ops/night/out/reports/T07.md` |
| T08 | `5dfa6a5fe07d` | done | Không | `ops/night/out/reports/T08.md` |
| T09 | `5f1d4bb53abe` | done | Không | `ops/night/out/reports/T09.md` |
| T10 | `f0ec1e7745df` | done | Không | `ops/night/out/reports/T10.md` |
| T19 | `097830be7d8d` | done | Dòng test bị xóa: 7; desktop/test/local.test.mjs (1), desktop/test/research-sources-ui.test.mjs (2), desktop/test/viral-formulas-ui.test.mjs (2), tests/assistant-api.test.mjs (1), tests/runtime-register.mjs (1) | `ops/night/out/reports/T19.md` |
| T23 | `0aad44c528e7` | done | Muse workflows: 8687 → 9190 ký tự (+503) | `ops/night/out/reports/T23.md` |
| T21 | `e7e823489f5e` | done | Mặc định 0 ngoài test: components/lab/reference-video.tsx:131, scripts/check-formula-analysis-ui.mjs:37, scripts/check-formula-analysis-ui.mjs:38 | `ops/night/out/reports/T21.md` |
| T22 | `a35780130b33` | done | Mặc định 0 ngoài test: components/lab/reference-video.tsx:93, components/lab/reference-video.tsx:145, components/lab/reference-video.tsx:148, lib/lab/reference-muse.ts:16 | `ops/night/out/reports/T22.md` |

## T01 · 709280ebd343

- Commit: night T01: Research: CNY + tien te tung con so.
- Trạng thái máy đọc: **done**.
- Báo cáo: `709280ebd343ea723f618db9d47995eaa4c9d8d2:ops/night/out/reports/T01.md`.
- Spec cần review nội dung: `ops/night/tasks/T01-*.md`.
- File có thay đổi: `components/lab/research-candidates.tsx`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T01-RESEARCH-CURRENCIES.md`, `lib/lab/muse-workflows.ts`, `lib/lab/operations.ts`, `ops/night/out/reports/T01.md`, `tests/operations-api.test.mjs`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Muse workflows: 7272 → 7926 ký tự (+654).
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T02 · 7286960fc9c0

- Commit: night T02: Research: truong quyet dinh + brief + co.
- Trạng thái máy đọc: **done**.
- Báo cáo: `7286960fc9c045e3b00d7722ebf3c4ac174091a9:ops/night/out/reports/T02.md`.
- Spec cần review nội dung: `ops/night/tasks/T02-*.md`.
- File có thay đổi: `components/lab/research-candidates.tsx`, `desktop/src/research-runner.mjs`, `desktop/test/research-runner.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T02-RESEARCH-QUALITY.md`, `lib/lab/muse-workflows.ts`, `lib/lab/operations.ts`, `lib/lab/research-quality.ts`, `ops/night/out/reports/T02.md`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Muse workflows: 7926 → 8294 ký tự (+368).
- Cờ: Mặc định 0 ngoài test: lib/lab/research-quality.ts:37, lib/lab/research-quality.ts:41.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T11 · 74c88f7f62e1

- Commit: night T11: Agent Reach: kiem listing + tin hieu canh tranh.
- Trạng thái máy đọc: **partial**.
- Báo cáo: `74c88f7f62e12c616c3ec39ef77b1f60cc0fd675:ops/night/out/reports/T11.md`.
- Spec cần review nội dung: `ops/night/tasks/T11-*.md`.
- File có thay đổi: `components/lab/integrations.tsx`, `components/lab/operations.tsx`, `components/lab/research-candidates.tsx`, `components/lab/research-launcher.tsx`, `components/lab/research-sources.tsx`, `desktop/src/integrations.mjs`, `desktop/src/listing-check.mjs`, `desktop/src/main.mjs`, `desktop/src/preload.cjs`, `desktop/src/research-runner.mjs`, `desktop/src/research-sources.mjs`, `desktop/test/research-runner.test.mjs`, `desktop/test/research-sources-ui.test.mjs`, `desktop/test/research-sources.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T11-AGENT-REACH-RESEARCH.md`, `lib/lab/muse-workflows.ts`, `lib/lab/operations.ts`, `ops/night/out/reports/T11.md`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Muse workflows: 8294 → 8599 ký tự (+305).
- Cờ: Mặc định 0 ngoài test: components/lab/research-sources.tsx:30, components/lab/research-sources.tsx:40, desktop/src/integrations.mjs:41.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T03 · f45e8f6fc8c8

- Commit: night T03: Sua buoc tien do san pham.
- Trạng thái máy đọc: **done**.
- Báo cáo: `f45e8f6fc8c817e9549d225424314e4be484321d:ops/night/out/reports/T03.md`.
- Spec cần review nội dung: `ops/night/tasks/T03-*.md`.
- File có thay đổi: `components/lab/app.tsx`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T03-PRODUCT-STAGE.md`, `lib/lab/product-stage.ts`, `ops/night/out/reports/T03.md`, `tests/domain.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T05 · 593e4298ba01

- Commit: night T05: Thu vien cong thuc viral.
- Trạng thái máy đọc: **done**.
- Báo cáo: `593e4298ba01d584d173d279b93d798d017d3b61:ops/night/out/reports/T05.md`.
- Spec cần review nội dung: `ops/night/tasks/T05-*.md`.
- File có thay đổi: `app/api/lab/route.ts`, `components/lab/operations.tsx`, `components/lab/viral-formulas.tsx`, `desktop/test/local.test.mjs`, `desktop/test/viral-formulas-ui.test.mjs`, `docs/VIRAL-FORMULAS.md`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `lib/lab/domain.ts`, `lib/lab/viral-formulas.seed.json`, `lib/lab/viral-formulas.ts`, `ops/night/out/reports/T05.md`, `scripts/build-local-server.mjs`, `scripts/build-local.mjs`, `tests/domain.test.mjs`, `tests/operations-api.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T12 · a83d5b964c9d

- Commit: night T12: Nap video mau vao thu vien cong thuc.
- Trạng thái máy đọc: **Đã bỏ**.
- Báo cáo: `a83d5b964c9d37dc149c7bbabad400322604f422:ops/night/out/reports/T12.md`.
- Spec cần review nội dung: `ops/night/tasks/T12-*.md`.
- File có thay đổi: `app/api/lab/route.ts`, `desktop/src/integrations.mjs`, `desktop/src/reference-structure.mjs`, `desktop/src/reference-youtube.mjs`, `lib/lab/domain.ts`, `lib/lab/viral-reference.ts`, `ops/night/out/reports/T12.md`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Lý do: Thiếu dòng === BAO CAO T12 === trong báo cáo tại commit.
- Lý do: Thiếu dòng TRANG THAI: sau đầu báo cáo.
- Lý do: Báo cáo có 401/403/hết hạn.
- Lý do: Bị revert bởi 6942d89ab91f97b438aff76c58a2ecfb1964c6e2.
- Cờ: Mặc định 0 ngoài test: desktop/src/integrations.mjs:45, desktop/src/reference-structure.mjs:54, desktop/src/reference-youtube.mjs:63.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T06 · 3f2bb10df041

- Commit: night T06: report only.
- Trạng thái máy đọc: **Chưa làm**.
- Báo cáo: `3f2bb10df0419ee1ae0f0a8c429f8e79fd6d3876:ops/night/out/reports/T06.md`.
- Spec cần review nội dung: `ops/night/tasks/T06-*.md`.
- File có thay đổi: `ops/night/out/reports/T06.md`.
- Có thay đổi ngoài báo cáo/tài liệu: không.
- Lý do: Commit report only.
- Lý do: Thiếu dòng === BAO CAO T06 === trong báo cáo tại commit.
- Lý do: Thiếu dòng TRANG THAI: sau đầu báo cáo.
- Lý do: Báo cáo có 401/403/hết hạn.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T04 · b84917dc8b53

- Commit: night T04: report only.
- Trạng thái máy đọc: **Chưa làm**.
- Báo cáo: `b84917dc8b537019e4c2882e6fce37cc583ae3ef:ops/night/out/reports/T04.md`.
- Spec cần review nội dung: `ops/night/tasks/T04-*.md`.
- File có thay đổi: `ops/night/out/reports/T04.md`.
- Có thay đổi ngoài báo cáo/tài liệu: không.
- Lý do: Commit report only.
- Lý do: Thiếu dòng === BAO CAO T04 === trong báo cáo tại commit.
- Lý do: Thiếu dòng TRANG THAI: sau đầu báo cáo.
- Lý do: Báo cáo có 401/403/hết hạn.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T07 · 8207b99e6983

- Commit: night T07: report only.
- Trạng thái máy đọc: **Chưa làm**.
- Báo cáo: `8207b99e698397afe92f2884519c8d9a297953e8:ops/night/out/reports/T07.md`.
- Spec cần review nội dung: `ops/night/tasks/T07-*.md`.
- File có thay đổi: `ops/night/out/reports/T07.md`.
- Có thay đổi ngoài báo cáo/tài liệu: không.
- Lý do: Commit report only.
- Lý do: Thiếu dòng === BAO CAO T07 === trong báo cáo tại commit.
- Lý do: Thiếu dòng TRANG THAI: sau đầu báo cáo.
- Lý do: Báo cáo có 401/403/hết hạn.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T08 · f43849c56b71

- Commit: night T08: report only.
- Trạng thái máy đọc: **Chưa làm**.
- Báo cáo: `f43849c56b712036037f10cbebbb86f28e470542:ops/night/out/reports/T08.md`.
- Spec cần review nội dung: `ops/night/tasks/T08-*.md`.
- File có thay đổi: `ops/night/out/reports/T08.md`.
- Có thay đổi ngoài báo cáo/tài liệu: không.
- Lý do: Commit report only.
- Lý do: Thiếu dòng === BAO CAO T08 === trong báo cáo tại commit.
- Lý do: Thiếu dòng TRANG THAI: sau đầu báo cáo.
- Lý do: Báo cáo có 401/403/hết hạn.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T09 · d4c6ee2b4b98

- Commit: night T09: report only.
- Trạng thái máy đọc: **Chưa làm**.
- Báo cáo: `d4c6ee2b4b98f2447f43267d40572c92d8859139:ops/night/out/reports/T09.md`.
- Spec cần review nội dung: `ops/night/tasks/T09-*.md`.
- File có thay đổi: `ops/night/out/reports/T09.md`.
- Có thay đổi ngoài báo cáo/tài liệu: không.
- Lý do: Commit report only.
- Lý do: Thiếu dòng === BAO CAO T09 === trong báo cáo tại commit.
- Lý do: Thiếu dòng TRANG THAI: sau đầu báo cáo.
- Lý do: Báo cáo có 401/403/hết hạn.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T10 · 55e6fa543593

- Commit: night T10: report only.
- Trạng thái máy đọc: **Chưa làm**.
- Báo cáo: `55e6fa5435930087380c6335e03eb98f859cbc82:ops/night/out/reports/T10.md`.
- Spec cần review nội dung: `ops/night/tasks/T10-*.md`.
- File có thay đổi: `ops/night/out/reports/T10.md`.
- Có thay đổi ngoài báo cáo/tài liệu: không.
- Lý do: Commit report only.
- Lý do: Thiếu dòng === BAO CAO T10 === trong báo cáo tại commit.
- Lý do: Thiếu dòng TRANG THAI: sau đầu báo cáo.
- Lý do: Báo cáo có 401/403/hết hạn.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T13 · deb5620f2b4f

- Commit: night T13: Sua T01: promote + form tien te.
- Trạng thái máy đọc: **done**.
- Báo cáo: `deb5620f2b4f88775b534cdb1e2a747fbbf15559:ops/night/out/reports/T13.md`.
- Spec cần review nội dung: `ops/night/tasks/T13-*.md`.
- File có thay đổi: `components/lab/app.tsx`, `components/lab/currency-fields.ts`, `components/lab/operations.tsx`, `components/lab/primitives.tsx`, `desktop/test/local.test.mjs`, `desktop/test/product-currencies-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T13-PROMOTE-CURRENCIES.md`, `lib/lab/domain.ts`, `ops/night/out/reports/T13-a1.md`, `ops/night/out/reports/T13.md`, `tests/domain.test.mjs`, `tests/operations-api.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T14 · 11a8f9464aa0

- Commit: night T14: Sua T11: trang thai + heuristic.
- Trạng thái máy đọc: **done**.
- Báo cáo: `11a8f9464aa0c1f9896fec16ed97307a8b02abf0:ops/night/out/reports/T14.md`.
- Spec cần review nội dung: `ops/night/tasks/T14-*.md`.
- File có thay đổi: `components/lab/research-sources.tsx`, `desktop/src/integrations.mjs`, `desktop/src/listing-check.mjs`, `desktop/src/research-sources.mjs`, `desktop/test/fixtures/listing-related.html`, `desktop/test/fixtures/listing-showroom.html`, `desktop/test/integrations.test.mjs`, `desktop/test/research-runner.test.mjs`, `desktop/test/research-sources-ui.test.mjs`, `desktop/test/research-sources.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T11-AGENT-REACH-RESEARCH.md`, `docs/context/T14-SOURCE-STATUS-HEURISTICS.md`, `lib/lab/operations.ts`, `ops/night/out/reports/T14-a1.md`, `ops/night/out/reports/T14.md`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Dòng test bị xóa: 4; desktop/test/research-runner.test.mjs (1), desktop/test/research-sources-ui.test.mjs (1), desktop/test/research-sources.test.mjs (2).
- Cờ: Mặc định 0 ngoài test: components/lab/research-sources.tsx:46.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T06 · 3a80892c7501

- Commit: night T06: Mau kich ban theo cong thuc.
- Trạng thái máy đọc: **done**.
- Báo cáo: `3a80892c750161d240ea28bac9e72fe074edc8b6:ops/night/out/reports/T06.md`.
- Spec cần review nội dung: `ops/night/tasks/T06-*.md`.
- File có thay đổi: `components/lab/production-desk.tsx`, `components/lab/production-intelligence.tsx`, `components/lab/production.tsx`, `desktop/test/local.test.mjs`, `desktop/test/viral-formulas-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T06-FORMULA-STORYBOARD.md`, `lib/lab/formula-storyboard.ts`, `lib/lab/intelligence.ts`, `lib/lab/media-catalog.ts`, `lib/lab/package.ts`, `lib/lab/production.ts`, `ops/night/out/reports/T06-a1.md`, `ops/night/out/reports/T06.md`, `tests/contracts.test.mjs`, `tests/intelligence.test.mjs`, `tests/production-api.test.mjs`, `tests/production.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Mặc định 0 ngoài test: lib/lab/intelligence.ts:11.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T12 · c66140bf780b

- Commit: night T12: Nap video mau vao thu vien cong thuc.
- Trạng thái máy đọc: **done**.
- Báo cáo: `c66140bf780baead3e468195fd44a67cedda231f:ops/night/out/reports/T12.md`.
- Spec cần review nội dung: `ops/night/tasks/T12-*.md`.
- File có thay đổi: `app/api/lab/route.ts`, `components/lab/integrations.tsx`, `components/lab/operations.tsx`, `components/lab/reference-video.tsx`, `components/lab/viral-formulas.tsx`, `desktop/src/integrations.mjs`, `desktop/src/main.mjs`, `desktop/src/preload.cjs`, `desktop/src/reference-process.mjs`, `desktop/src/reference-structure.mjs`, `desktop/src/reference-youtube.mjs`, `desktop/test/local.test.mjs`, `desktop/test/reference-video.test.mjs`, `desktop/test/viral-formulas-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T12-REFERENCE-VIDEO.md`, `lib/lab/domain.ts`, `lib/lab/viral-reference.ts`, `ops/night/out/reports/T12-a1.md`, `ops/night/out/reports/T12.md`, `scripts/build-local.mjs`, `tests/operations-api.test.mjs`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Mặc định 0 ngoài test: components/lab/reference-video.tsx:130, desktop/src/reference-structure.mjs:54, desktop/src/reference-youtube.mjs:63.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T04 · 758c8b207f47

- Commit: night T04: Giao dien Nghien cuu.
- Trạng thái máy đọc: **done**.
- Báo cáo: `758c8b207f4712edad636ed3d429aa844e43090f:ops/night/out/reports/T04.md`.
- Spec cần review nội dung: `ops/night/tasks/T04-*.md`.
- File có thay đổi: `app/workbench.css`, `components/lab/app.tsx`, `components/lab/operations.tsx`, `components/lab/research-candidates.tsx`, `components/lab/research-launcher.tsx`, `desktop/test/research-sources-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T04-RESEARCH-COMPARISON.md`, `lib/lab/muse-workflows.ts`, `lib/lab/research-selection.ts`, `lib/lab/research-view.ts`, `ops/night/out/T04-research-form-1080.png`, `ops/night/out/T04-research-table-1080.png`, `ops/night/out/T04-research-table-1366.png`, `ops/night/out/T04-research-table-390.png`, `ops/night/out/T04-research-table-800.png`, `ops/night/out/T04-ui-check.json`, `ops/night/out/reports/T04-a1.md`, `ops/night/out/reports/T04.md`, `scripts/check-research-ui.mjs`, `tests/operations-api.test.mjs`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Muse workflows: 8599 → 8687 ký tự (+88).
- Cờ: Mặc định 0 ngoài test: scripts/check-research-ui.mjs:39, scripts/check-research-ui.mjs:40.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T07 · 95c35ad0d012

- Commit: night T07: Instagram tong quan theo tai khoan.
- Trạng thái máy đọc: **done**.
- Báo cáo: `95c35ad0d012a76b53b3eb4956d8a3614495b594:ops/night/out/reports/T07.md`.
- Spec cần review nội dung: `ops/night/tasks/T07-*.md`.
- File có thay đổi: `app/workbench.css`, `components/lab/instagram-overview.tsx`, `components/lab/instagram-panel.tsx`, `components/lab/operations.tsx`, `desktop/src/ui-copy.mjs`, `desktop/test/instagram-overview-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T07-INSTAGRAM-OVERVIEW.md`, `lib/lab/instagram-summary.ts`, `ops/night/out/T07-instagram-1366.png`, `ops/night/out/T07-instagram-1920.png`, `ops/night/out/T07-instagram-390.png`, `ops/night/out/T07-instagram-800.png`, `ops/night/out/T07-ui-check.json`, `ops/night/out/reports/T07-a1.md`, `ops/night/out/reports/T07.md`, `scripts/check-instagram-ui.mjs`, `tests/fixtures/instagram-overview.mjs`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T08 · 5dfa6a5fe07d

- Commit: night T08: Sua UI nho.
- Trạng thái máy đọc: **done**.
- Báo cáo: `5dfa6a5fe07ddd288187d2a6f96ea91391673d07:ops/night/out/reports/T08.md`.
- Spec cần review nội dung: `ops/night/tasks/T08-*.md`.
- File có thay đổi: `DESIGN.md`, `app/studio.css`, `app/workbench.css`, `components/lab/app.tsx`, `components/lab/production-desk.tsx`, `components/lab/production.tsx`, `components/lab/queue-board.tsx`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T08-SMALL-UI.md`, `lib/lab/ui-state.ts`, `ops/night/out/T08-compose-1920.png`, `ops/night/out/T08-empty-products-1920.png`, `ops/night/out/T08-preview-1366.png`, `ops/night/out/T08-preview-1536.png`, `ops/night/out/T08-preview-1920.png`, `ops/night/out/T08-preview-390.png`, `ops/night/out/T08-preview-800.png`, `ops/night/out/T08-products-1366.png`, `ops/night/out/T08-products-1920.png`, `ops/night/out/T08-products-390.png`, `ops/night/out/T08-products-800.png`, `ops/night/out/T08-queue-1920.png`, `ops/night/out/T08-ui-check.json`, `ops/night/out/reports/T08-a1.md`, `ops/night/out/reports/T08.md`, `scripts/check-small-ui.mjs`, `tests/contracts.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T09 · 5f1d4bb53abe

- Commit: night T09: Nhan AI Instagram (fixture only).
- Trạng thái máy đọc: **done**.
- Báo cáo: `5f1d4bb53abed47c1a968e10cf692f887d5668e7:ops/night/out/reports/T09.md`.
- Spec cần review nội dung: `ops/night/tasks/T09-*.md`.
- File có thay đổi: `components/lab/instagram-panel.tsx`, `components/lab/operations.tsx`, `desktop/local/instagram-workspace.mjs`, `desktop/src/instagram-adapter.mjs`, `desktop/src/instagram-ai-label.mjs`, `desktop/src/instagram.mjs`, `desktop/test/instagram-ai-label.test.mjs`, `desktop/test/instagram-overview-ui.test.mjs`, `desktop/test/instagram-workspace.test.mjs`, `docs/INSTAGRAM-AI-LABEL.md`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/T09-INSTAGRAM-AI-LABEL.md`, `lib/lab/instagram-client.ts`, `lib/lab/operations.ts`, `ops/night/out/reports/T09-a1.md`, `ops/night/out/reports/T09.md`, `tests/operations-api.test.mjs`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T10 · f0ec1e7745df

- Commit: night T10: Tai lieu + tong ket.
- Trạng thái máy đọc: **done**.
- Báo cáo: `f0ec1e7745df7f28e3564dbab886ec4a2774ab37:ops/night/out/reports/T10.md`.
- Spec cần review nội dung: `ops/night/tasks/T10-*.md`.
- File có thay đổi: `AGENTS.md`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `ops/night/out/CHANGES.md`, `ops/night/out/reports/T10-a1.md`, `ops/night/out/reports/T10.md`.
- Có thay đổi ngoài báo cáo/tài liệu: không.
- Cờ: Không.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T19 · 097830be7d8d

- Commit: night T19: Thong nhat harness test desktop.
- Trạng thái máy đọc: **done**.
- Báo cáo: `097830be7d8d8a08c71d90c0bf7bba81853ec8a9:ops/night/out/reports/T19.md`.
- Spec cần review nội dung: `ops/night/tasks/T19-*.md`.
- File có thay đổi: `desktop/package.json`, `desktop/test/fixtures/local-build-probe.mjs`, `desktop/test/helpers/local-server.mjs`, `desktop/test/import-worker.test.mjs`, `desktop/test/local-server-helper.test.mjs`, `desktop/test/local.test.mjs`, `desktop/test/research-runner.test.mjs`, `desktop/test/research-sources-ui.test.mjs`, `desktop/test/storage-policy.test.mjs`, `desktop/test/viral-formulas-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `ops/night/out/T19-integrity.json`, `ops/night/out/T19.md`, `ops/night/out/reports/T19-a1.md`, `ops/night/out/reports/T19.md`, `package.json`, `scripts/build-local-server.mjs`, `scripts/build-local-ui.mjs`, `scripts/build-local.mjs`, `scripts/run-source-tests.mjs`, `tests/assistant-api.test.mjs`, `tests/codex-api.test.mjs`, `tests/operations-api.test.mjs`, `tests/production-api.test.mjs`, `tests/runtime-register.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Dòng test bị xóa: 7; desktop/test/local.test.mjs (1), desktop/test/research-sources-ui.test.mjs (2), desktop/test/viral-formulas-ui.test.mjs (2), tests/assistant-api.test.mjs (1), tests/runtime-register.mjs (1).
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T23 · 0aad44c528e7

- Commit: night T23: Hermes tu kiem san pham.
- Trạng thái máy đọc: **done**.
- Báo cáo: `0aad44c528e75e5952d2feae4cc9f3dc88396473:ops/night/out/reports/T23.md`.
- Spec cần review nội dung: `ops/night/tasks/T23-*.md`.
- File có thay đổi: `app/workbench.css`, `components/lab/operations.tsx`, `components/lab/product-check-fields.tsx`, `components/lab/product-check.tsx`, `components/lab/research-candidates.tsx`, `components/lab/research-launcher.tsx`, `desktop/src/research-runner.mjs`, `desktop/test/research-runner.test.mjs`, `desktop/test/research-sources-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `lib/lab/muse-workflows.ts`, `lib/lab/operations.ts`, `lib/lab/product-check.ts`, `lib/lab/research-view.ts`, `ops/night/out/T23-check-1080.png`, `ops/night/out/T23-check-1366.png`, `ops/night/out/T23-form-1080.png`, `ops/night/out/T23-ip-form-1080.png`, `ops/night/out/T23-questions-links-1080.png`, `ops/night/out/T23-table-1080.png`, `ops/night/out/T23-table-1366.png`, `ops/night/out/T23-ui-check.json`, `ops/night/out/T23.md`, `ops/night/out/reports/T23-a1.md`, `ops/night/out/reports/T23.md`, `scripts/check-product-check-ui.mjs`, `tests/operations-api.test.mjs`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Muse workflows: 8687 → 9190 ký tự (+503).
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T21 · e7e823489f5e

- Commit: night T21: Hermes tu phan tich video mau.
- Trạng thái máy đọc: **done**.
- Báo cáo: `e7e823489f5e22b20a03c627098e4dce40d01928:ops/night/out/reports/T21.md`.
- Spec cần review nội dung: `ops/night/tasks/T21-*.md`.
- File có thay đổi: `components/lab/operations.tsx`, `components/lab/reference-video.tsx`, `components/lab/viral-formulas.tsx`, `desktop/src/integrations.mjs`, `desktop/src/reference-structure.mjs`, `desktop/test/local.test.mjs`, `desktop/test/reference-video.test.mjs`, `desktop/test/viral-formulas-ui.test.mjs`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `lib/lab/formula-analysis.ts`, `lib/lab/viral-reference.ts`, `ops/night/out/T21-analysis-1080.png`, `ops/night/out/T21-analysis-1366.png`, `ops/night/out/T21-ui-check.json`, `ops/night/out/T21.md`, `ops/night/out/reports/T21-a1.md`, `ops/night/out/reports/T21.md`, `scripts/check-formula-analysis-ui.mjs`, `tests/fixtures/formula-analysis.mjs`, `tests/operations-api.test.mjs`, `tests/operations.test.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Mặc định 0 ngoài test: components/lab/reference-video.tsx:131, scripts/check-formula-analysis-ui.mjs:37, scripts/check-formula-analysis-ui.mjs:38.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

## T22 · a35780130b33

- Commit: night T22: Muse dinh kem anh phan tich video.
- Trạng thái máy đọc: **done**.
- Báo cáo: `a35780130b334d6045a642b5cf5988471b995f14:ops/night/out/reports/T22.md`.
- Spec cần review nội dung: `ops/night/tasks/T22-*.md`.
- File có thay đổi: `components/lab/reference-video.tsx`, `desktop/src/main.mjs`, `desktop/src/muse-chat-attachments.mjs`, `desktop/src/muse-chat-ipc.mjs`, `desktop/src/muse-chat.mjs`, `desktop/src/muse.mjs`, `desktop/test/muse-chat-attachments.test.mjs`, `desktop/test/viral-formulas-ui.test.mjs`, `docs/MUSE-ANALYSIS.md`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `lib/lab/desktop-client.ts`, `lib/lab/reference-muse.ts`, `ops/night/out/T22-analysis-1080.png`, `ops/night/out/T22-analysis-1366.png`, `ops/night/out/T22-ui-check.json`, `ops/night/out/T22.md`, `ops/night/out/reports/T22-a1.md`, `ops/night/out/reports/T22.md`, `scripts/check-muse-analysis-ui.mjs`.
- Có thay đổi ngoài báo cáo/tài liệu: có.
- Cờ: Mặc định 0 ngoài test: components/lab/reference-video.tsx:93, components/lab/reference-video.tsx:145, components/lab/reference-video.tsx:148, lib/lab/reference-muse.ts:16.
- Log đối soát: không cung cấp --runs; chưa xác minh exit code.

Đối chiếu trước/sau: Trước [HEAD=`a35780130b334d6045a642b5cf5988471b995f14`; nhánh=`night-20261111`; git stash list=`(trống)`]; Sau [HEAD=`a35780130b334d6045a642b5cf5988471b995f14`; nhánh=`night-20261111`; git stash list=`(trống)`]. Xác nhận HEAD, nhánh và git stash list không đổi.
