# Generation integration boundary

## Current direction · 04 Nov 2026

User clarified that MeoQT drives logged-in Muse browser profiles. Product Lab now adds a local Windows desktop worker; see DESKTOP-WORKER.md. A Muse API key/public generation endpoint is not required or assumed. Actual Muse selector/ID/download contract remains disabled pending the supplied signed-in flow clip and local acceptance.

Image/video API adapter interfaces below remain retained for a future supported provider. They are not the active execution route for Muse. LLM prompt rewriting is separate: optional Gemini Interactions endpoint with TEXT_API_KEY, TEXT_MODEL and TEXT_DAILY_LIMIT; no runtime key is configured by this build.

## Historical API boundary


V3 scene adapter: `lib/lab/provider.ts` defines the independent submit/poll/fetchOutput/cancel/usage interface and disconnected implementation. Capabilities (including model IDs, supported ratios and durations) remain unknown until documented; attempts store immutable scene/reference/asset snapshots. This complements the retained legacy Studio job contract below. See PRODUCTION-WORKBENCH.md for the new lifecycle and unverified acceptance requirements.

Status: awaiting exact provider and official documentation. Muse is ambiguous. No live submit, model call, polling or provider billing exists in v1. A prepared job is a durable internal request awaiting connection, not a provider-generated video.

The UI records a provider display name/docs URL. Secrets are configured with Sites runtime environment tools and never pasted into notes, source or the browser. Proposed variable names: VIDEO_API_KEY, VIDEO_API_BASE_URL, VIDEO_MODEL, TEXT_API_KEY, TEXT_API_BASE_URL, TEXT_MODEL. These are names only; no values exist in the application.

Prepared contract:

```json
{
  "schema_version": 1,
  "client_request_id": "job_<creative>_<revision>",
  "creative_id": "...",
  "creative_revision": 1,
  "aspect_ratio": "9:16",
  "prompt": "...",
  "reference_media": [],
  "callback_mode": "poll"
}
```

The provider adapter must map this contract to the provider's real schema. This is not a claim that any provider accepts it directly. Images uploaded privately need a documented authorized transfer/signed-URL mechanism before sending references to a provider; private asset routes cannot be fetched anonymously by providers.

Before enabling paid generation: inspect auth/header format, exact submit/status/cancel contracts, model IDs, reference-media requirements, duration/resolution support, pricing, rate limits, expiry, signed callbacks or polling, retention/rights. Implement atomic budget reservation, persistent request IDs, no blind retry after uncertain submit, durable provider job ID, safe error redaction and output storage. Confirm estimates and final request before any paid submission. Never call arbitrary user-entered URLs from the server.

Text scripts and video generation may be separate APIs. The six current scripts are deterministic editable templates, explicitly labeled. Manual video uploads are supported while integration is pending.
