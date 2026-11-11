# Research and visual production integrations · 2026-11-07

The user authorized implementation after reviewing Agent Reach and OpenMontage. Continue the same Site, records and owner-only audience; no database migration or credential change.

## Ownership

Product Lab owns project/scene revisions, storyboard approval, takes, bodies, variants and export receipts. Its desktop shell runs separate local dependencies pinned in `desktop/integrations-lock.json`. Third-party source is not vendored. Upstream licenses: Agent Reach MIT; OpenMontage AGPLv3.

This adapter uses OpenMontage's FrameSampler and VideoCompose primitives, not the complete upstream agent-directed production pipeline. It does not generate original footage, perform semantic vision review, predict retention, or operate social accounts. No model API keys are collected.

## User path

1. Tạo video → Hook 3 giây: supply an observable inconvenience, one product action, a demonstrable result. Preview three opening hypotheses and explicitly save three unapproved scene drafts through the existing atomic import API. Body/CTA should remain constant when comparing. Templates are labeled; they are not LLM output or proven winners.
2. Download the updated desktop source package. `SETUP-INTEGRATIONS.ps1` needs Git, Python 3.12+ and FFmpeg/ffprobe. It downloads exact upstream revisions and installs a lightweight isolated Python environment. Agent Reach is installed from its source checkout, never the unrelated PyPI package. Different/dirty existing checkouts are preserved and rejected.
3. Start Desktop. The existing exact-origin top-frame IPC gate is retained. Fixed local setup paths load automatically, or enter paths in Nghiên cứu & dựng. Health checks verify local availability, not every remote channel/account.
4. Research: one query, at most five public-web results. Web uses Exa; other channels explicitly use public-web. No automatic channel installation, login import or browser-session reuse. Instagram means account search, not arbitrary Reel search. Errors are persisted; raw sources/timestamps remain unreviewed.
5. Reference: choose an owned MP4 asset. Fetch authenticated bytes, verify checksum, limit 25 MB / 180 seconds. Native extraction samples 0 / 0.75 / 1.5 / 2.9 seconds, midpoint and end (clamped/deduplicated for short media). Frames use revoked-on-close Blob URLs. Semantic interpretation remains pending, with no invented transcript or hook score.
6. Biến thể & xuất → Dựng bằng OpenMontage: existing approval/version gates run first; source bytes/checksums are verified; native FFmpeg composition produces MP4; full decode, ratio/duration/checksum checks run; real bytes upload through the existing owned-asset API and the export receipt is saved. This is a local renderer, not a hosted Python service.

## Local job contract

States: running → done / failed; restart converts running to interrupted without replay. One task at a time; up to 100 records; reruns use new directories and preserve old files. Local project IDs link work to projects. Research reports are inspectable locally, not automatically synchronized to D1 or passed to an LLM.

Subprocesses use fixed operations/argv, no shell, bounded JSON, size/time limits and process-tree termination on timeout. Paid provider dispatch is not exposed. This does not establish full OS crash safety or provider exactly-once/billing guarantees. Windows GUI/process acceptance is still required on the user's computer.

## Verification

- 49 domain/contract/intelligence/guidance/hook tests passed.
- 3 actual route tests against isolated SQLite/R2 passed; owner isolation/CAS SQL checks passed.
- 7 integration contract tests passed: argv, error persistence, interruption recovery, checksum rejection, timeout/error envelopes, batch bounds and frame path confinement.
- Real pinned OpenMontage acceptance passed: keyframes, real MP4, ordered pixel checks, full decode, duration tolerance, checksum, unchanged original bytes and retained previous render.
- 12 supplied reference MP4s passed: 6 frames each, 72 total; opening timestamps 0 / 0.75 / 1.5 / 2.9 seconds. These are reference analyses, not generated ads.
- Real Agent Reach web query returned source results. This verifies that query path, not universal platform access or demand.

No paid generation, account login, publishing, product purchase, real performance test or user-machine installation was performed. Final build/browser and packaging evidence is in QA.md.
