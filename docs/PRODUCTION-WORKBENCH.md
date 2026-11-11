# Production workbench v3

## Compatibility and storage

Same Sites project, owner-private audience, D1 table and R2 binding. Existing product/experiment/creative/job/result/signal/cost/settings/asset records remain readable. No destructive migration, replacement seed or hard deletion. New product fields (SKU, market, locale, allowed claims, invariants) default safely when older rows are edited. Legacy Studio remains available.

`lib/lab/production.ts` owns schema-versioned product-scoped production aggregates. Each owner-scoped record holds references, scenes, attempts, takes, bodies, variants, measurements, exports, events and receipts. Commands require expected record revision and a client command ID; the existing D1 CAS makes the entire transition atomic. Invalid imports do not partially save.

Deliberate solo-workspace bounds: 30 scenes; 50 attempts and 50 takes per scene; 120 reference versions; 30 bodies; 60 variants/measurement snapshots; 100 exports; 300 recent events; 500 receipts; 280K serialized characters/project. Existing workspace 2,000-record bound remains. Normalize/paginate server records and introduce a worker queue before scaling beyond this scope.

## Lifecycle

Concepts from the same product can seed editable scene drafts by splitting existing script text; this is deterministic text transformation, not an LLM call. Original concepts remain unchanged. CSV supports quoted commas/newlines, explicit header mapping, up to 30 rows and atomic save; optional product IDs must match and all reference IDs must belong to the project. Import never creates attempts automatically.

Reference updates append versions and invalidate dependent storyboard approvals. Scene edits increment revision while preserving attempts/takes. Product changes require explicit synchronization, invalidating storyboards and making old takes stale without removing media. Attempts snapshot prompt, product/scene/reference revisions and parameters. Pause stays active when drafts are added. Cancel means local pending-dispatch cancellation, not provider refund. Retry keeps old takes. Unknown provider outcome blocks blind retry in the domain contract.

Body locks an ordered list of approved body-role video takes. A variant references that body plus optional approved hook/CTA; stale/rejected inputs block export. No regeneration is performed to reuse a body. Locale is a tracking label, not automatic translation, dubbing or voice consistency. Manual per-variant measurements replace cumulative snapshots rather than adding them; source/cohort is required and denominator/currency rules are explicit.

## Media and approval

Limits: 8MB image / 25MB video. Browser decodes the image or a first video frame before upload. Server checks signatures/container structure, extracts image dimensions or MP4 video-track dimensions/duration and computes SHA-256 before saving immutable R2 bytes. Existing authenticated owner checks and Range reads remain.

Production take metadata comes from the owned stored asset, never request-provided dimensions/hash. Approval requires current storyboard/reference/product versions, verified sample/positive economics per the existing policy, matching media kind, ratio within 1% and duration within 0.25s. Human review still owns SKU, continuity, voice and content quality. Container parsing/browser first-frame decode is not full video decoding or lip-sync analysis. Legacy assets need re-upload for new metadata/hash. WebM remains supported in legacy Studio uploads but lacks a production metadata reader and cannot pass new take approval.

## Real outputs and renderer boundary

The hosted app assembles an actual ZIP after fetching original media and verifying each byte size and SHA-256. It contains real source files, manifest, captions, README, and optional FFmpeg shell/PowerShell scripts. Media total is limited to 60MB per ZIP. Manifest JSON downloads separately. Names and `media/01_<take>.mp4` paths are actual ZIP entries. Browser download location is controlled by the user/browser; the app does not invent a Windows path or assert disk-save completion.

Scripts normalize with aspect-preserving padding and concatenate in manifest order. Existing audio is preserved, silence added when absent. FFmpeg/ffprobe must be installed separately. `output.mp4` exists only after successful local execution. There is no hosted transcoder. A real merged MP4 can be attached afterward; the server checks ratio and total duration (0.5s tolerance), not full content/order/audio identity.

## Desktop Muse automation

The Windows local app supports Tạo và chạy from the production form. That action saves and accepts the entered scene snapshot, queues that scene, selects an enabled profile and checks its Muse session. It reuses the profile browser and minimizes its window while generation continues. Mở Muse restores the browser for manual sign-in.

Expired sessions return an unsent job to the local queue and try another enabled profile once. If every profile needs attention, the job remains queued with a login action. Unconfirmed delivery retains the job for reconciliation. A click on one scene dispatches only that scene. Independent drafts stay queued.

Downloaded output is fully decoded and checked against requested media type, ratio and duration. Local import uses a stable desktop job command ID, checksum verification and project/scene revision checks. Success refreshes the app and its inline preview. The bottom activity log displays persisted job checkpoints with Vietnam time and the profile used for each event.

### Canonical UI map

| Capability | Owner | Verification |
| --- | --- | --- |
| Form | ProductionDesk and shared primitives with production schemas | Empty prompt, one-click generation, duplicate protection |
| Table Selection | workbench-controls | Existing page-selection UI tests |
| Select/Listbox | Existing native selects in ProductionDesk and RecordForm | Project-owned labels and keyboard interaction |
| Scrollbar | app/workbench.css and app/globals.css | 390 px viewport and log scrolling |
| Toast | App notify callback | Saved and dispatched feedback |
| CRUD | API production revision and command receipts | Domain and local API tests |
| Background status | useDesktopStatus and WorkerActivity | Desktop regression tests and real Muse one-click test |

## Hosted provider adapter and outstanding acceptance

`lib/lab/provider.ts` defines submit/poll/fetchOutput/cancel/usage. Its disconnected implementation refuses generation; capabilities remain unknown. No credentials are collected or provider requests sent. Before enabling paid generation, implement provider-specific capability verification, server-side secrets, authorized reference transfer, atomic budget reservation, durable provider ID, uncertain-submit reconciliation, idempotency and authenticated callbacks/polling. Muse balance/Gemini key from another chat is not a configuration value.

Meosu external crash-safe/duplicate-charge-safe behavior and precise voice/lip-sync remain NOT VERIFIED. Product Lab's isolated SQLite/R2 tests establish internal transitions/ownership/CAS/replay only. Tests use explicit non-AI synthetic geometric video fixtures, not the unattached Meosu media. Browser/production verification scope is recorded in QA.md.
