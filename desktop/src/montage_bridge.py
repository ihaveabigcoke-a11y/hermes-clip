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


def single_pass(cuts, width, height, subtitle, out):
    """One accurate seek per input, one encode including captions and audio."""
    args = ["ffmpeg", "-y", "-v", "error", "-xerror", "-filter_complex_threads", "1"]
    filters, inputs = [], []
    duration = sum(c["out_seconds"] - c["in_seconds"] for c in cuts)
    for i, cut in enumerate(cuts):
        length = cut["out_seconds"] - cut["in_seconds"]
        args += ["-ss", str(cut["in_seconds"]), "-t", str(length), "-i", cut["source"]]
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", cut["source"]], text=True))
        filters.append(f"[{i}:v]setpts=PTS-STARTPTS,scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,trim=duration={length},format=yuv420p[v{i}]")
        audio = f"[{i}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad" if any(s["codec_type"] == "audio" for s in probe["streams"]) else "anullsrc=r=48000:cl=stereo"
        filters.append(f"{audio},atrim=duration={length},asetpts=PTS-STARTPTS[a{i}]")
        inputs.append(f"[v{i}][a{i}]")
    filters.append("".join(inputs) + f"concat=n={len(cuts)}:v=1:a=1[base][audio]")
    filters.append("[base]ass=overlays.ass[video]" if subtitle else "[base]null[video]")
    rate = max(32000, int(.88 * 6 * 1024 * 1024 * 8 / duration - 96000))
    args += ["-filter_complex", ";".join(filters), "-map", "[video]", "-map", "[audio]", "-t", str(duration),
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-threads", "2", "-maxrate", str(rate), "-bufsize", str(rate),
             "-c:a", "aac", "-b:a", "96k", "-map_metadata", "-1", "-movflags", "+faststart", str(out / "output.mp4")]
    subprocess.run(args, cwd=out, check=True, capture_output=True, timeout=240)


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
            start = float(clip.get("inSec", 0))
            end = float(clip.get("outSec", duration))
            if not math.isfinite(start) or not math.isfinite(end) or not 0 <= start < end <= duration + .001:
                raise ValueError("Cut outside source duration.")
            cuts.append({"id": str(i), "source": str(source), "in_seconds": start, "out_seconds": end})
        width, height = request["size"]
        decisions = {"version": "1.0", "render_runtime": "ffmpeg", "cuts": cuts, "metadata": {"compose_target": {"width": width, "height": height, "fit": "pad"}}}
        (out / "edit_decisions.json").write_text(json.dumps(decisions, indent=2), encoding="utf-8")
        options = {"operation": "compose", "edit_decisions": decisions, "output_path": str(out / "output.mp4"), "preset": "fast"}
        subtitle = request.get("subtitlePath")
        if subtitle:
            subtitle = Path(subtitle).resolve(strict=True)
            if subtitle.parent != out or subtitle.name != "overlays.ass":
                raise ValueError("Subtitle must be inside this job.")
            options.update({"subtitle_path": str(subtitle), "subtitle_style": {"font": "Arial", "font_size": 70, "alignment": 8, "margin_v": 90, "outline_width": 3}})
        if request.get("singlePass"):
            single_pass(cuts, width, height, subtitle, out)
            return {"output": str(out / "output.mp4"), "engine": "hermes_ffmpeg_single_pass", "commit": head, "cutCount": len(cuts), "usageUsd": 0, "creativeReview": "pending"}
        # No audio_path: upstream keeps each source's audio instead of replacing it.
        result = VideoCompose().execute(options)
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
