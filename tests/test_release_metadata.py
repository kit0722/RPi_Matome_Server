"""Ensure the kit-tool latest-version badge cannot silently lag releases.

These checks run in UPDATE_ONLY.sh before either systemd service is stopped.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ReleaseMetadataTests(unittest.TestCase):
    def test_latest_json_matches_server_health(self):
        latest = json.loads((ROOT / "latest.json").read_text(encoding="utf-8"))
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        match = re.search(r'"version"\s*:\s*"([^"]+)"\s*,\s*"build"\s*:\s*(\d+)', server)
        self.assertIsNotNone(match, "server health version/build missing")
        self.assertEqual(latest["version"], match.group(1),
                         "kitツールの最新表示がサーバー版数と不一致")
        self.assertEqual(int(latest["build"]), int(match.group(2)))

    def test_kit_tool_source_target_is_main(self):
        latest = json.loads((ROOT / "latest.json").read_text(encoding="utf-8"))
        self.assertEqual(latest["repository"], "kit0722/RPi_Matome_Server")
        self.assertEqual(latest["branch"], "main")
        self.assertEqual(latest["update_mode"], "repository-source")

    def test_update_only_checks_same_release(self):
        latest = json.loads((ROOT / "latest.json").read_text(encoding="utf-8"))
        script = (ROOT / "UPDATE_ONLY.sh").read_text(encoding="utf-8")
        self.assertIn('d.get("version")=="' + latest["version"] + '"', script)
        self.assertIn('d.get("build")==' + str(latest["build"]), script)
        self.assertIn('反映確認: v' + latest["version"] + ' OK', script)


if __name__ == "__main__":
    unittest.main()
