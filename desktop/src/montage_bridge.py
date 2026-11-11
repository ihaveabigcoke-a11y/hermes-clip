"""Bounded local OpenMontage adapter. JSON stdin/stdout; no generation APIs.

Uses upstream analysis/composition primitives, not an autonomous production agent.
The caller owns job persistence, revisions, approval and full media validation.
"""
import contextlib
import io
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path


def execute(request):
    root = Path(request["checkout"]).resolve()
    expected = request["expectedCommit"]
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    if head != expected:
        raise ValueError("OpenMontage checkout differs from the tested revision. Re-run setup with the pinned version.")
    sys.path.insert(0, str(root))
    from tools.analysis.frame_sampler import FrameSampler
    from tools.video.video_compose import VideoCompose

    op = request["operation"]
    if op == "doctor":
        return {"commit": head, "ffmpeg": bool(shutil.which("ffmpeg")), "ffprobe": bool(shutil.which("ffprobe")),
                "capabilities": ["reference_keyframes", "video_only_composition"], "generation": False}
    out = Path(request["outputDir"]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if op == "analyze":
        source = Path(request["source"]).resolve(strict=True)
        meta = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(source)], text=True))
        duration = float(meta["format"]["duration"])
        if not math.isfinite(duration) or not 0 < duration <= 180:
            raise ValueError("Reference duration must be between 0 and 180 seconds.")
        video = next(s for s in meta["streams"] if s["codec_type"] == "video")
        timestamps = sorted(set(round(min(t, max(0, duration-.08)), 3) for t in [0, .75, 1.5, 2.9, duration*.5, duration-.2]))
        result = FrameSampler().execute({"input_path": str(source), "strategy": "timestamps", "timestamps": timestamps, "output_dir": str(out / "frames"), "format": "jpg"})
        if not result.success or len(result.data.get("frames", [])) != len(timestamps):
            raise ValueError(result.error or "Frame extraction did not return every requested frame.")
        frames = result.data["frames"]
        for f in frames:
            if not Path(f["path"]).is_file():
                raise ValueError("A reported keyframe does not exist.")
        return {"source": {"duration": duration, "width": video["width"], "height": video["height"]}, "frames": frames,
                "semanticReview": "pending", "hookPerformance": None,
                "note": "Technical frame extraction only. A person/vision agent must interpret the visuals; no retention prediction or fabricated transcript."}
    if op == "compose":
        clips = request["clips"]
        if not 1 <= len(clips) <= 30:
            raise ValueError("Expected 1–30 approved clips.")
        cuts = []
        for i, clip in enumerate(clips):
            duration = float(clip["duration"])
            if not math.isfinite(duration) or not 0 < duration <= 120:
                raise ValueError("Invalid clip duration.")
            source = Path(clip["path"]).resolve(strict=True)
            cuts.append({"id": str(i), "source": str(source), "in_seconds": 0, "out_seconds": duration})
        width, height = request["size"]
        decisions = {"version": "1.0", "render_runtime": "ffmpeg", "cuts": cuts, "metadata": {"compose_target": {"width": width, "height": height, "fit": "pad"}}}
        (out / "edit_decisions.json").write_text(json.dumps(decisions, indent=2), encoding="utf-8")
        result = VideoCompose().execute({"operation": "compose", "edit_decisions": decisions, "output_path": str(out / "output.mp4"), "preset": "fast"})
        if not result.success:
            raise ValueError(result.error or "Composition failed.")
        return {"output": str(out / "output.mp4"), "engine": "openmontage_ffmpeg", "commit": head, "cutCount": len(cuts), "usageUsd": 0, "creativeReview": "pending"}
    raise ValueError("Unsupported integration operation.")


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        with contextlib.redirect_stdout(io.StringIO()):
            result = execute(request)
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)[:600]}, ensure_ascii=False))
        sys.exit(1)
