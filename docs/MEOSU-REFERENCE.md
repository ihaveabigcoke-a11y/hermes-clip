# Meosu reference · updated 2026-11-04

The six audit texts in the user's 2026-11-04 handoff supersede the initial static study below. The cloud builder has read the supplied text, not the 110 screenshots, 16 PNG or 29 MP4 still on Windows. Current evidence, source-document provenance, lessons and unverified claims are normalized in [MEOSU-HANDOFF.md](MEOSU-HANDOFF.md) and shown in Xưởng sản xuất → Bài học Meosu. No credential, license or user machine ID is retained.

## UI screenshot source · 2026-11-04

The user attached `MEOSU-UI-REFERENCE.zip` in the next message. All 20 original PNG screenshots were viewed, with overview images used as an index. The selected set covers image/video forms and modes, running/results, first-last, long video, storyboard, model/products, characters, library/order, accounts/settings, remix/clone, film dialog, menus and validation. This is distinct from independently reading the full Windows audit media bundle, which remains unavailable here.

The frontend refinement adopts the 92px icon rail, single compact project header, 430/588/400 flexible pane proportions, segmented modes, dense job rows and pinned preview actions. Existing API/domain semantics and audience are preserved. Meosu screenshots, brand, ads and account identifiers are not shipped as product assets. Unsupported modes remain visibly unavailable; screenshot controls are not evidence that Product Lab has those engines.

## Initial static-only study · historical 2026-11-03

Source: user-supplied MeosuVideoQTshop-latest.zip, folder MeosuVideoQTshop-v5.2. The supplied license is not stored here or in source. No activation, account login, vendor request or executable execution was performed.

## Evidence levels

- Verified from the included HUONG-DAN.txt: Windows 10/11 x64 application; first-use license activation; add account then sign in with Chrome; separate image/video tabs; output folder; settings; update notice; one key per machine. These are statements in the app's guide, not runtime verification.
- Static packaged resource strings indicate: tasks tied to project IDs, queued/running/error/stopped/idle states, task actions, pause/stop endpoints, reference-media reuse, per-account client sessions, account quota handling and resume of unfinished work. This establishes design intent/implementation hints; it does not verify runtime correctness.
- No reliable screenshot or active UI was obtained. The package contains a Windows executable and runtime dependencies rather than editable application source. Do not claim its live appearance or execution was audited.

## Patterns to carry forward

| Reference pattern                    | Value for Product Lab                                   | This visual refresh                                                                                     |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Jobs tied to projects                | Prevent confusion when producing many videos            | Selected experiment and product are visible above Studio                                                |
| Task lifecycle and queue             | Make unfinished work and recovery understandable        | Explicit job waiting status, concept/video/approval/job counts, no invented rendering percentages       |
| Reusable image/video references      | Keep the same product/character consistent across clips | Retain existing reference/upload workflow; future asset-library extension needs separate work           |
| Account-specific sessions and quotas | Identify which execution resource owns a job            | Recorded for later account/provider architecture; no account connections or fake account controls added |
| Retry/pause/resume                   | Recover from partial batch failures                     | Future engine implementation; not claimed as active in this UI refresh                                  |

The guide describes browser-mediated account login. This must not be assumed to be a documented public API. A web API engine and a local browser session runner are different execution adapters. A future browser/session adapter needs an explicit supported runtime, credential boundary and job contract before integration.

## Scope retained

This change improves presentation, hierarchy, contrast, typography and visibility of existing state. Product schemas, APIs, permissions, real records, approvals, costs, queue semantics and integrations are preserved. No external code, branding or activation logic is copied into Product Lab.
