"""Regression checks for the offline-first Ethernet tutorial index."""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
CATALOG = ROOT / "courses.json"
EMBEDDED = re.compile(
    r'<script id="embeddedCourses" type="application/json">\s*([\s\S]*?)\s*</script>'
)


class OfflineIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = INDEX.read_text(encoding="utf-8")
        cls.metadata = json.loads(CATALOG.read_text(encoding="utf-8"))
        matches = EMBEDDED.findall(cls.html)
        if len(matches) != 1:
            raise AssertionError("Expected exactly one embeddedCourses JSON block")
        cls.embedded_raw = matches[0]
        cls.embedded = json.loads(cls.embedded_raw)

    def test_embedded_data_matches_canonical_json(self):
        self.assertEqual(self.embedded, self.metadata)

    def test_json_safe_to_embed_in_script(self):
        # Avoid future metadata accidentally terminating the HTML script element.
        self.assertNotIn("<", self.embedded_raw)

    def test_chapter_links_resolve_locally(self):
        chapters = self.metadata["chapters"]
        self.assertEqual(self.metadata["chapterCount"], len(chapters))
        self.assertEqual(len(chapters), 28)
        files = [item["file"] for item in chapters]
        self.assertEqual(len(set(files)), len(files))
        for filename in files:
            with self.subTest(filename=filename):
                self.assertRegex(filename, r"^[0-9]{2}\.html$")
                self.assertTrue((ROOT / filename).is_file())

    def test_local_index_has_no_network_catalog_dependency(self):
        self.assertNotIn("fetch('courses.json')", self.html)
        self.assertIn("document.getElementById('embeddedCourses').textContent", self.html)

    def test_local_file_in_headless_browser_when_available(self):
        chrome = next((shutil.which(exe) for exe in
                       ("chromium", "chromium-browser", "google-chrome")
                       if shutil.which(exe)), None)
        if not chrome:
            self.skipTest("Chromium not available; static checks still run")
        try:
            result = subprocess.run(
                [chrome, "--headless", "--no-sandbox", "--disable-gpu",
                 "--disable-dev-shm-usage", "--virtual-time-budget=1500",
                 "--dump-dom", INDEX.resolve().as_uri()],
                capture_output=True, text=True, timeout=12, check=True,
            )
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, OSError) as exc:
            self.skipTest("Chromium cannot run in this environment: " + type(exc).__name__)
        self.assertEqual(result.stdout.count('class="card"'), 28)
        self.assertNotIn("课程数据加载失败", result.stdout)


if __name__ == "__main__":
    unittest.main()
