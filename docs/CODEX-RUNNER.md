# Run directly in Codex

The user requested Codex execution instead of a Windows installation. `scripts/run-codex.mjs` runs the existing Agent Reach/OpenMontage adapters directly in Node 24. Electron, GUI profiles and Windows are not needed.

```sh
node scripts/run-codex.mjs --mission /path/mission.json --config /path/tools.json --state /path/run-directory
```

tools.json contains only `python`, `reach` executable paths and absolute `montage` checkout path, no API keys. Install the pinned upstreams listed in desktop/integrations-lock.json and lightweight dependencies from desktop/integrations-requirements.txt in an isolated Python environment.

Mission shape:

```json
{
  "id": "reference-pass",
  "projectId": "research-workspace",
  "steps": [
    {"id": "preflight", "type": "doctor"},
    {"id": "research", "type": "research", "channel": "web", "query": "observable product problem"},
    {"id": "reference", "type": "reference", "path": "reference.mp4"},
    {"id": "render", "type": "compose", "ratio": "9:16", "clips": [{"path": "approved-clip.mp4", "duration": 3}]}
  ]
}
```

Paths resolve relative to the mission file. Composing requires actual source clips; it does not invent missing media. A CLI composition checks file validity and does not assert that the sources passed the hosted storyboard/product review gates. Use approved exports for production; synthetic/reference inputs are technical fixtures only.

Each successful step retains its native local job ID and source paths. Re-running the same mission/config/input hashes reuses completed results only after checking output content hashes, including extracted frame bytes. Missing, modified or pre-upgrade receipts are rerun in new local jobs; prior job history/files remain. `--refresh` deliberately reruns. Failures preserve existing receipts and stop execution. Preflight always reruns. A state-directory lock prevents two simultaneous runners; stale locks require explicit review after confirming the previous process has ended. These are restart checkpoints, not a continuously running cloud service.

Outputs: run-report.json, per-step research/keyframes/MP4 and native SQLite state. Runs occur in the active Codex environment; there is no claim of execution while Codex is stopped, credit is exhausted, or the environment has been pruned. Hosted Product Lab records are not automatically modified by this CLI.

## Import into the existing app

1. In **Tạo video → Nghiên cứu & dựng**, select the real production project and copy its displayed mission project ID. The ID belongs to the production project, not the Site or product.
2. Use that exact ID as `mission.projectId` and run the mission. A successful run with research/reference/compose steps also writes `codex-exchange.json` beside `run-report.json`.
3. Choose `codex-exchange.json` in that same project. Review counts and source links, then choose **Lưu báo cáo vào dự án**. Demo can preview but never save. A mismatched project is rejected; do not edit the ID to misattribute another product's evidence.

The portable file allows at most 80 steps and 384,000 UTF-8 bytes. It contains query/channel, up to five HTTPS sources per research step (300-character excerpts), technical media dimensions/frame counts and local-result hashes. It excludes local paths, executable configuration and raw provider fields. Report hashes identify transferred metadata; the hosted app has not re-read those local files and does not certify their contents.

Imports are immutable owner-scoped `codex_run` records. The server derives product mapping from the owned project. Canonical report content determines the receipt ID; concurrent/repeated submission returns the same record at revision 1. A later run with different timestamps/content is a separate report. No asset, scene, approval, product verification, metric or paid job is created. Re-open original sources and review media separately. Source URLs and search hits are not independent proof of demand. Media still needs its existing authenticated upload and review flow.

Only completed mission reports are portable. A doctor-only run writes no exchange. Errors do not turn a previous report into new success; inspect run-error.json, report timestamps and mission status. A successful retry removes the stale error report. Report files are replaced atomically after assembly.
