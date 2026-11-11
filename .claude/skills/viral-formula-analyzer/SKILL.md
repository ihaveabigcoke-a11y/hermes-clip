---
name: viral-formula-analyzer
description: Turn reference short-form product videos (MP4 Reels/TikTok/Shorts) into structured viral-formula JSON for Hermes Clip using local ffmpeg contact sheets and a fixed taxonomy. Use whenever the user sends or points to reference/competitor videos, asks why a product video went viral, wants hooks, on-screen text or CTA patterns extracted, or wants Hermes formulas updated, even if they never say "formula".
---
# Viral formula analyzer (free, local)

Goal: turn each reference video into data Hermes Clip can reuse (beats, hook type, on-screen text, CTA keyword, product traits), so new scripts copy the *structure* of what works. Everything runs locally with ffmpeg; no paid APIs. Audio is not transcribed: say so, and rely on on-screen text, which these videos are built around (they are made to work muted).

## 1. Measure

Save the script at the end of this skill as `measure_video.py` in the working folder (or use `scripts/measure_video.py` if the skill folder has it). It needs Python 3 and ffmpeg/ffprobe on PATH; Hermes ships ffmpeg under `desktop\tools\ffmpeg\bin` of the installed app, so add that folder to PATH if `ffmpeg` is not found.

```
python measure_video.py <out_dir> video1.mp4 video2.mp4 ...
```

You get `<out_dir>/measure.json` (duration, size, fps, scene-cut timestamps, cut count) and one contact sheet per video, `<name>-sheet.jpg`: one frame every 0.8 s, 9 per row, read left→right, top→bottom, so frame *k* (0-based) sits at about `k × 0.8 s`.

**Open every contact sheet as an image** and copy the overlay text exactly (emojis and casing included). Use the frame times plus the cut timestamps to place beat boundaries.

**Before concluding a video has no on-screen text** (or no CTA), rerun that video with `--dense`. It writes `<name>-dense.jpg` at 4 frames/s, which catches text that flashes for under a second. One sparse sheet is not enough evidence for "none".

## 2. Find the CTA source

Creators often put the CTA ("Comment LED for the link") only in the post caption, not on screen. So ask for, or look at, the caption and the original file name when they are available, and record where the CTA came from in `ctaSource`: `overlay`, `caption`, `filename` or `none`. Never copy a caption CTA into `hookText` or pretend it was on screen.

## 3. Classify with the fixed taxonomy

Use only these labels so analyses stay comparable across runs. If nothing fits, use `other` and explain in `notes`.

- **role**: `hook`, `body`, `cta`
- **beat kind**: `problem` (visible failure, risk, ugly DIY), `versus_unbox` (hands unboxing or installing, "Vs..."), `result` (the payoff shot), `cta`
- **hookType**: `problem_label` ("The problem / The idea / The risk / The concept"), `pov_share_bait` ("POV: you send this to your … buddies"), `do_not_show` ("DO NOT show this to a …"), `think_vs_actually` ("What people think we sell / What we actually sell"), `authority_check` (police or an official checks the product), `audience_callout` ("If you do X, watch this"), `emotional_story` (first-person drama)
- **ctaType**: `comment_keyword`, `send_keyword_dm`, `link_in_bio`, `none_visible`
- **product traits**: `night_glow`, `pet`, `safety`, `running`, `cycling`, `family`, `senior`, `beauty`, `apparel`, `vehicle_fit`, `battery`, `bulky`, `visual_payoff_one_frame`

Per video record: product, hookText (verbatim, or null if none), ctaType, ctaText, ctaKeyword, ctaSource, durationSec, cutCount (copy from measure.json), beats (`kind`, `role`, `label`, `fromSec`, `toSec`), the one frame that sells (visualPayoff), effects that may exceed what the real product does (huge glow trails, laser patterns, instant alerts that need an app), traits, the matched formula, and notes. For first-person stories ("My dad fell…"), note that Hermes should rebuild them as POV, because a story told by a person who doesn't exist reads as a fake testimonial.

## 4. Match Hermes formulas

Existing ids (read `lib/lab/viral-formulas.seed.json` or `ops/night/input/formula-seed.json` when you have the repo):

| id | shape |
|---|---|
| `problem-vs-result-cta` | problem 0–4 s → Vs/unbox 4–8 s → result 8–15 s → comment-keyword CTA last ~3 s |
| `pov-share-bait` | "POV: you send this to your … buddies" over a scene, unbox, result, CTA |
| `do-not-show` | "DO NOT show this to a …" over install → results on several targets |
| `think-vs-actually` | "What people think we sell" → Vs → "What we actually sell" → CTA |
| `audience-callout` | "If you do X, watch this" → product on → use → "Would you try it? Comment …" |
| `emotional-story-pov` | risky situation with emotion → product → it works → CTA (POV, not first-person) |

Beat order and hook type decide the match; small timing differences don't. Propose a new formula only when 2+ videos share a pattern none of these cover; with a single video, list it as a candidate and say it needs another example.

## 5. Output

Write `formula-update-<YYYYMMDD>.json`:

```json
{
  "version": "<seed version + 1, or 1 if unknown>",
  "createdAt": "<ISO time>",
  "source": "<videos analyzed; sampling used; audio not transcribed>",
  "references": [ { "id": "R1", "file": "...", "product": "...", "hookType": "...", "hookText": "...",
      "ctaType": "...", "ctaText": "...", "ctaKeyword": "...", "ctaSource": "overlay",
      "durationSec": 0, "cutCount": 0,
      "beats": [ {"kind": "problem", "role": "hook", "label": "...", "fromSec": 0, "toSec": 4} ],
      "visualPayoff": "...", "effectsBeyondProduct": ["..."], "traits": ["..."],
      "formulaId": "problem-vs-result-cta", "notes": "..." } ],
  "formulaChanges": [ { "id": "...", "change": "new | candidate | add-label-variant | add-cta-pattern | adjust-timing", "detail": "..." } ]
}
```

Do not overwrite the Hermes seed: the user approves the update first.

Then a short Vietnamese summary: patterns repeated in 3+ videos, what is new, which products could plausibly fit a landed cost of 20 USD or less (label it an estimate), and which effects look exaggerated against a real product. When a reference later becomes a Hermes script, keep structure, pacing and shot language, and swap brand names, logos, packaging text and people for the user's own; copied brand assets get videos taken down.

## measure_video.py

```python
#!/usr/bin/env python3
"""python measure_video.py OUT_DIR v1.mp4 [...] [--threshold 0.3] [--dense]"""
import json, math, os, re, subprocess, sys

def run(a): return subprocess.run(a, capture_output=True, text=True, encoding="utf-8", errors="replace")

def probe(p):
    d = json.loads(run(["ffprobe","-v","error","-select_streams","v:0","-show_entries",
        "format=duration:stream=width,height,r_frame_rate","-of","json",p]).stdout or "{}")
    s = (d.get("streams") or [{}])[0]; n,_,den = (s.get("r_frame_rate") or "0/1").partition("/")
    return {"durationSec": round(float(d.get("format",{}).get("duration",0)),2), "width": s.get("width"),
            "height": s.get("height"), "fps": round(float(n)/float(den or 1),2) if float(den or 1) else None}

def cuts(p, t):
    e = run(["ffmpeg","-hide_banner","-i",p,"-vf",f"select='gt(scene,{t})',showinfo","-an","-f","null","-"]).stderr
    return sorted({round(float(x),2) for x in re.findall(r"pts_time:([0-9.]+)", e)})

def sheet(p, out, dur, fps=1.25, cols=9, width=240):
    rows = max(1, math.ceil(max(1, math.ceil(dur*fps))/cols))
    r = run(["ffmpeg","-hide_banner","-v","error","-y","-i",p,"-vf",
             f"fps={fps},scale={width}:-1,tile={cols}x{rows}:padding=4","-frames:v","1",out])
    return {"path": out, "secondsPerFrame": round(1/fps,2), "columns": cols, "rows": rows,
            "ok": r.returncode == 0 and os.path.exists(out)}

def main(a):
    t = 0.3; dense = "--dense" in a; a = [x for x in a if x != "--dense"]
    if "--threshold" in a: i = a.index("--threshold"); t = float(a[i+1]); a = a[:i]+a[i+2:]
    out, vids = a[1], a[2:]; os.makedirs(out, exist_ok=True); res = []
    for v in vids:
        name = os.path.splitext(os.path.basename(v))[0][:60]; info = {"file": v, "name": name}
        try:
            info.update(probe(v)); info["cuts"] = cuts(v, t); info["cutCount"] = len(info["cuts"])
            info["sheet"] = sheet(v, os.path.join(out, f"{name}-sheet.jpg"), info["durationSec"])
            if dense: info["denseSheet"] = sheet(v, os.path.join(out, f"{name}-dense.jpg"), info["durationSec"], 4, 11, 200)
        except Exception as e: info["error"] = str(e)
        res.append(info); print(f"{name}: {info.get('durationSec')}s, {info.get('cutCount')} cuts", file=sys.stderr)
    with open(os.path.join(out, "measure.json"), "w", encoding="utf-8") as f:
        json.dump({"threshold": t, "videos": res}, f, ensure_ascii=False, indent=2)
    print(os.path.join(out, "measure.json"))

if __name__ == "__main__": main(sys.argv)
```
