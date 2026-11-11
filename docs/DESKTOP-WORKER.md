# Desktop worker + intelligence · implementation and acceptance

User-approved 04 Nov 2026, on the existing private Product Lab Site, not a second Site. Muse is browser-mediated; a public video-generation API is not assumed. Windows Electron shell uses the exact deployed URL and canonical web components. This release supplies source + locked dependencies + setup script, not a tested/signed Windows EXE.

## Implemented capabilities

| Capability | Implementation | Remaining acceptance |
| --- | --- | --- |
| Profiles/proxy | Local persistent Chromium profile per account; HTTP(S)/SOCKS5 authentication; async OS-encrypted proxy password, masked shared form; edit blocked while context open/busy; real IP/session checks | Windows DPAPI/native GUI, actual proxy/Muse sessions |
| Queue/recovery | Local SQLite WAL/FULL; immutable job fingerprint, frozen approved IDs, one job/profile, 1–4 RAM-gated slots; pending-submit checkpoint before click; startup paused; unknown outcome cannot blind retry; resume same result ID; manual reconciliation; retry retains old take | Actual Muse IDs/DOM and kill during live submit; no Muse-side exactly-once/charge guarantee |
| Browser workflow | Semantic submit/download button names, configured DOM locators, unique result ID, bounded waits; ambiguous output stops and captures local diagnostic | Selector contract intentionally unconfigured/disabled until supplied clip and signed-in test; does not solve challenges or alter fingerprints |
| Output quality | ffprobe dimensions/duration; FFmpeg full decode; SHA-256, limits, dark-segment review warning; owned asset import and stale-version rejection | SKU/logo/voice/lip-sync/content still human |
| Prompt assistant | Local structured scene drafts from product facts, claims, locale and versioned references; ratio/time/strong-claim warnings; optional Gemini rewrite with runtime secret/model/daily cap | No runtime key/model/cap configured; no live LLM call made. JSON validity is not factual accuracy |
| Body/variants | Existing approved-body/take graph reused; desktop FFmpeg renderer retains originals, writes actual output.mp4 and uploads through existing private asset API | Native Windows FFmpeg/GUI acceptance; captions remain manifest text, not burned-in subtitles |
| Learning | Approved-attempt efficiency, manual take separation, known/unknown usage; per-variant CTR/orders-per-session; group body×locale×source/cohort; next-test hypotheses | Manual tracking data only. No social analytics connector, automatic winner/causal inference or ad spend |

## Security and data scope

IPC accepts only the top-level configured Site origin and its bound webContents. Renderer Node integration off, sandbox/context isolation/web security on. Preload exposes fixed methods only; no arbitrary path, script, URL fetch or shell execute method. Browser login/session directories and encrypted proxy passwords stay outside repository and outside Sites. No credentials from prior audit are reused. Diagnostics may contain account content and stay local; user opens their file location explicitly.

Application upload authenticates visitor/asset owner, extracts metadata/hash from bytes, then attaches a worker receipt only to matching scene/product revision. Receipt uses stable local job command ID; replay adds neither a take nor attempt. New take is pending review. Uploaded asset IDs are retained locally before attach retry. Production data/schema remains backward compatible; no destructive migration or audience change.

Gemini endpoint is fixed to official Interactions API; stateless store=false, max output 5000 tokens, no tools, explicit paid-action button. Runtime names TEXT_API_KEY (secret), TEXT_MODEL, TEXT_DAILY_LIMIT (1–20) are all required. Atomic per-owner/day admission stored in assistant_run; successful request IDs cache response, pending/unknown IDs cannot auto-replay. Cap counts attempted calls including uncertain failures, does not pretend to be a dollar cost limit. Internal run records are omitted from the workspace list; max 2000 records still applies. Usage money remains unknown. Set provider account billing limits separately before enabling.

## Source and setup

`desktop/` includes Node 24/Electron 45 source, exact npm lockfile, PowerShell setup and tests. `scripts/package-desktop.mjs` packages only 15 explicitly listed files into public/downloads/Product-Lab-Desktop.zip before the Site build. It excludes sessions, secrets, outputs and node_modules. Start via SETUP-WINDOWS.ps1 or npm ci → npm run browser:install → npm start. FFmpeg/ffprobe on PATH required. npm run dist:win on Windows builds an unsigned NSIS installer; not run here.

Authenticated SOCKS5 uses an authenticated HTTP bridge bound only to 127.0.0.1, with random bridge credentials and upstream DNS resolution. Upstream credentials stay inside the worker. A real TCP integration test covers authentication and upstream forwarding; this does not replace a Windows Chromium/proxy acceptance run.

The web app offers Desktop worker and Tài khoản → Desktop & profile, plus setup/download on ordinary browsers. Muse flow configuration requires observed selectors and explicit review. It is not shipped enabled or advertised as live generation.

## Technical sources consulted 04 Nov 2026

- https://www.electronjs.org/docs/latest/tutorial/security — isolation, sandbox and IPC sender boundary.
- https://www.electronjs.org/docs/latest/api/safe-storage — async API and Windows DPAPI semantics.
- https://playwright.dev/docs/api/class-browsertype — persistent profiles/proxy configuration.
- https://playwright.dev/docs/locators and /docs/downloads — locators, waits and persistent downloads.
- https://nodejs.org/api/sqlite.html — local transactional store.
- https://aistudio.google.com/docs/structured-output and /api-reference/interactions-api — Gemini JSON schema and model_output text parsing.

No live Muse, proxy, LLM spending or Windows executable execution is claimed by the automated test doubles.
