"""Adapter checks with fake subprocess; no packages, provider or real video required."""
import importlib.util
import json
from pathlib import Path
import tempfile
import uuid
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('rea_bridge', ROOT / 'desktop/src/rea_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
COMMIT = '2f50ab340ab09da334c0dbffc55244ddbaa52e44'


class BridgeTest(unittest.TestCase):
    def test_compact_twelve(self):
        total = 0
        for folder in sorted((ROOT / 'desktop/test/fixtures/rea-video').glob('V*')):
            b = bridge.compact(json.loads((folder / 'breakdown.json').read_text(encoding='utf-8')))
            total += len(b['shots'])
            text = json.dumps(b)
            self.assertLess(len(text.encode()), 4 * 1024 * 1024)
            for forbidden in ['"label_probs"', '"verdict"', '"material"', '"made~"']:
                self.assertNotIn(forbidden, text)
        self.assertEqual(total, 116)

    def test_cli_pinned_and_no_shell(self):
        temp = str(ROOT / 'outputs' / ('T-008-bridge-' + str(uuid.uuid4())))
        Path(temp).mkdir()
        with patch.object(bridge.sys, 'version_info', (3, 12)):
            out = Path(temp)
            b = json.loads((ROOT / 'desktop/test/fixtures/rea-video/V01/breakdown.json').read_text(encoding='utf-8'))
            (out / 'breakdown.json').write_text(json.dumps(b), encoding='utf-8')
            source = out / 'source.mp4'
            source.write_bytes(b'fixture')
            calls = []

            def run(argv, **options):
                calls.append((argv, options))
                self.assertFalse(options['shell'])
                return types.SimpleNamespace(stdout=COMMIT if 'rev-parse' in argv else '', returncode=0)

            with patch.object(bridge.subprocess, 'run', run):
                r = bridge.main({'checkout': temp, 'expectedCommit': COMMIT, 'operation': 'decompose', 'source': str(source), 'outputDir': temp})
            self.assertEqual(len(r['breakdown']['shots']), 10)
            argv, options = calls[-1]
            self.assertEqual(options['env']['REA_VIDEO_MODELS'], str(Path(temp).parent / 'rea-models'))
            self.assertEqual(argv[1:4], ['-m', 'rea_video', 'decompose'])
            self.assertIn('--no-vlm', argv)
            self.assertNotIn('OPENAI_API_KEY', options['env'])
            self.assertEqual(options['stdout'], bridge.subprocess.DEVNULL)
            with patch.object(bridge.subprocess, 'run', run):
                with self.assertRaisesRegex(ValueError, 'revision'):
                    bridge.main({'checkout': temp, 'expectedCommit': 'wrong', 'operation': 'doctor'})


if __name__ == '__main__':
    unittest.main()
