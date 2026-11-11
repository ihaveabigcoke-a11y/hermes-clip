#!/usr/bin/env python3
"""Measure short-form videos for viral-formula analysis (free, local).

For each MP4: duration, size, fps, scene-cut timestamps, and a contact sheet
(1 frame every 0.8 s, 9 columns) you can open as an image to read on-screen
text. Needs ffmpeg + ffprobe on PATH. Standard library only.

Usage:
  python measure_video.py OUT_DIR video1.mp4 [video2.mp4 ...] [--threshold 0.3] [--dense]
Writes OUT_DIR/measure.json and OUT_DIR/<name>-sheet.jpg per video.
--dense also writes <name>-dense.jpg at 4 frames/s (11 per row) to confirm that a
video really has no on-screen text, or to read text that flashes briefly.
"""
import json
import math
import os
import re
import subprocess
import sys


def run(args):
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")


def probe(path):
    r = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "format=duration:stream=width,height,r_frame_rate",
             "-of", "json", path])
    data = json.loads(r.stdout or "{}")
    stream = (data.get("streams") or [{}])[0]
    num, _, den = (stream.get("r_frame_rate") or "0/1").partition("/")
    fps = round(float(num) / float(den or 1), 2) if float(den or 1) else None
    return {
        "durationSec": round(float(data.get("format", {}).get("duration", 0)), 2),
        "width": stream.get("width"),
        "height": stream.get("height"),
        "fps": fps,
    }


def scene_cuts(path, threshold):
    r = run(["ffmpeg", "-hide_banner", "-i", path, "-vf",
             f"select='gt(scene,{threshold})',showinfo", "-an", "-f", "null", "-"])
    times = [round(float(m), 2) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)]
    return sorted(set(times))


def contact_sheet(path, out_path, duration, fps=1.25, cols=9, width=240):
    frames = max(1, math.ceil(duration * fps))
    rows = max(1, math.ceil(frames / cols))
    r = run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-i", path, "-vf",
             f"fps={fps},scale={width}:-1,tile={cols}x{rows}:padding=4",
             "-frames:v", "1", out_path])
    return {"path": out_path, "secondsPerFrame": round(1 / fps, 2), "columns": cols,
            "rows": rows, "ok": r.returncode == 0 and os.path.exists(out_path)}


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    threshold = 0.3
    if "--threshold" in argv:
        i = argv.index("--threshold")
        threshold = float(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    dense = "--dense" in argv
    argv = [a for a in argv if a != "--dense"]
    out_dir, videos = argv[1], argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    results = []
    for v in videos:
        name = os.path.splitext(os.path.basename(v))[0][:60]
        info = {"file": v, "name": name}
        try:
            info.update(probe(v))
            info["cuts"] = scene_cuts(v, threshold)
            info["cutCount"] = len(info["cuts"])
            info["sheet"] = contact_sheet(v, os.path.join(out_dir, f"{name}-sheet.jpg"), info["durationSec"])
            if dense:
                info["denseSheet"] = contact_sheet(v, os.path.join(out_dir, f"{name}-dense.jpg"),
                                                   info["durationSec"], fps=4, cols=11, width=200)
        except Exception as e:  # keep going for the other videos
            info["error"] = str(e)
        results.append(info)
        print(f"{name}: {info.get('durationSec')}s, {info.get('cutCount')} cuts", file=sys.stderr)
    with open(os.path.join(out_dir, "measure.json"), "w", encoding="utf-8") as f:
        json.dump({"threshold": threshold, "videos": results}, f, ensure_ascii=False, indent=2)
    print(os.path.join(out_dir, "measure.json"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
