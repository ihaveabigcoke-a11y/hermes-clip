"""Pinned rea-video adapter. One bounded JSON response; CLI output never reaches stdout."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

LIMIT = 3 * 1024 * 1024


def read_json(path):
    if path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('Output too large')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def compact(b):
    shots = []
    for s in b.get('shots', []):
        shots.append({k: s.get(k) for k in ('id', 'start', 'end', 'assets', 'narrative')})
        shots[-1]['features'] = {'camera': s.get('features', {}).get('camera')}
        shots[-1]['aspects'] = {'camera': {'result': s.get('aspects', {}).get('camera', {}).get('result', {})}}
        rep = (s.get('review') or {}).get('replication') or (s.get('vlm') or {}).get('replication') or (s.get('replication') or {}).get('capsule') or {}
        shots[-1]['replication'] = {'capsule': {k: rep.get(k) for k in ('image_prompt', 'video_prompt', 'video_prompt_en', 'prompt', 'prompt_en')}}
        if not shots[-1]['narrative']:
            shots[-1]['narrative'] = (s.get('review') or s.get('vlm') or {}).get('narrative')
    a = b.get('audio') or {}
    return {'source': {k: b.get('source', {}).get(k) for k in ('duration', 'width', 'height', 'aspect_ratio')},
            'shots': shots, 'audio': {'music': {'tempo_bpm': (a.get('music') or {}).get('tempo_bpm')}, 'voice': {'present': (a.get('voice') or {}).get('present')}},
            'stems': {'ok': (b.get('stems') or {}).get('ok', False)},
            'packaging': {'text_cues': (b.get('packaging') or {}).get('text_cues', [])},
            'production_plan': {'units': [{k: u.get(k) for k in ('id', 'shots')} for u in (b.get('production_plan') or {}).get('units', [])]}}


def main(d):
    checkout = Path(d['checkout']).resolve(strict=True)
    if not (3, 10) <= sys.version_info[:2] <= (3, 14):
        raise ValueError('Python 3.10-3.14 required')
    head = subprocess.run(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], capture_output=True, check=True, text=True, timeout=15, shell=False).stdout.strip()
    if head != d['expectedCommit']:
        raise ValueError('Pinned revision mismatch')
    dirty = subprocess.run(['git', '-C', str(checkout), 'status', '--porcelain', '--untracked-files=no'], capture_output=True, check=True, text=True, timeout=15, shell=False).stdout.strip()
    if dirty:
        raise ValueError('Checkout modified')
    operation = d['operation']
    if operation == 'doctor':
        subprocess.run([sys.executable, '-c', "import rea_video, cv2, importlib, sys; importlib.import_module('rapidocr' if sys.version_info >= (3,13) else 'rapidocr_onnxruntime')"], cwd=checkout, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30, shell=False)
        return {'ready': bool(shutil.which('ffmpeg') and shutil.which('ffprobe')), 'commit': head}
    out = Path(d['outputDir']).resolve()
    out.mkdir(parents=True, exist_ok=True)
    had_answers = (out / 'review_answers.json').exists()
    env = dict(os.environ, PYTHONPATH=str(checkout), PYTHONIOENCODING='utf-8', REA_VIDEO_HOME=str(out / 'preferences'))
    # No inherited provider credentials or fallback endpoints. Explicit Gemini config only.
    for key in list(env):
        if key.startswith(('REA_VLM_', 'VIDEO_ANALYSIS_', 'GEMINI3_')) or key in ('OPENAI_API_KEY', 'GEMINI_API_KEY'):
            del env[key]
    if operation == 'decompose':
        source = Path(d['source']).resolve(strict=True)
        args = ['decompose', str(source), '--out', str(out), '--lang', 'en', '--no-asr', '--vlm' if d.get('envFile') else '--no-vlm']
        if d.get('envFile'):
            args += ['--env-file', d['envFile']]
    elif operation == 'review':
        args = ['review', str(out)]
    elif operation == 'apply-review':
        # Upstream requires a nonzero distribution even for semantic-only review.
        # A uniform adapter value carries no classification decision into Hermes.
        from importlib import import_module
        sys.path.insert(0, str(checkout))
        labels = import_module('rea_video.classify').LABELS
        answers = d['answers']
        for answer in answers['shots']:
            answer['label_probs'] = {label: 1 / len(labels) for label in labels}
        adapter = out / ('review_adapter_' + d['reviewId'] + '.json')
        adapter.write_text(json.dumps(answers, ensure_ascii=False), encoding='utf-8')
        args = ['apply-review', str(out), str(adapter), '--by', d['by'], '--lang', 'en']
    elif operation == 'read':
        args = None
    else:
        raise ValueError('Unsupported operation')
    if args:
        # Never relay provider output: it may contain a credential or raw response.
        result = subprocess.run([sys.executable, '-m', 'rea_video', *args], cwd=checkout, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=570, shell=False)
        if result.returncode:
            raise ValueError('rea-video command failed')
    if operation == 'review' and not had_answers and (out / 'review_answers.json').exists():
        # CLI creates a blank answer template. Keep it distinct from validated answers.
        (out / 'review_answers.json').rename(out / 'review_answers.template.json')
    result = {'breakdown': compact(read_json(out / 'breakdown.json'))}
    timeline = out / 'packaging/timeline.json'
    result['timeline'] = {'text': read_json(timeline).get('text', [])} if timeline.is_file() else None
    if operation == 'review':
        tasks = read_json(out / 'review_tasks.json')
        result['tasks'] = {'instructions': tasks.get('instructions', ''), 'shots': [
            {k: s.get(k) for k in ('id', 'start', 'end', 'images', 'sheet', 'first_frame', 'last_frame')} for s in tasks.get('shots', [])]}
    return result


if __name__ == '__main__':
    try:
        request = sys.stdin.buffer.read(LIMIT + 1)
        if len(request) > LIMIT:
            raise ValueError('Input too large')
        output = json.dumps({'ok': True, 'result': main(json.loads(request))}, ensure_ascii=False)
        if len(output.encode('utf-8')) > LIMIT:
            raise ValueError('Output too large')
        print(output)
    except Exception:
        print(json.dumps({'ok': False, 'error': {'hint': 'rea-video chưa hoàn tất. Kiểm tra revision đã ghim, Python 3.10–3.14, OCR, FFmpeg và cấu hình; output trước được giữ.'}}, ensure_ascii=False))
        sys.exit(1)
