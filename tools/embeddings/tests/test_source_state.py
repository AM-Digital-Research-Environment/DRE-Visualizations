from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "source_state.py"
SPEC = importlib.util.spec_from_file_location("dre_source_state", SCRIPT)
assert SPEC and SPEC.loader
state_module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = state_module
SPEC.loader.exec_module(state_module)

SITE = "https://example.org/s/amira"
STATE = {"siteId": 1, "revision": "r1", "profile": "p", "sourceChange": "c1"}


class SourceStateTests(unittest.TestCase):
    def test_capture_reads_scope_and_published_change_token(self) -> None:
        answers = {
            SITE + "/dre-data/source.json": {"siteId": 1, "revision": "r1", "profile": "p"},
            SITE + "/dre-data/current.json": {"revision": "r1", "sourceChange": "c1", "generationId": "g"},
        }
        self.assertEqual(state_module.capture(SITE, answers.get), STATE)

    def test_capture_tolerates_a_withdrawn_snapshot(self) -> None:
        answers = {SITE + "/dre-data/source.json": {"siteId": 1, "revision": "r2", "profile": "p"}}
        self.assertIsNone(state_module.capture(SITE, answers.get)["sourceChange"])

    def test_capture_requires_a_revision(self) -> None:
        with self.assertRaises(ValueError):
            state_module.capture(SITE, lambda url: None)

    def test_first_build_is_due(self) -> None:
        self.assertTrue(state_module.decide(STATE, None, "p")[0])

    def test_unchanged_site_skips_the_build(self) -> None:
        self.assertEqual(state_module.decide(STATE, dict(STATE), "p"), (False, "Nothing changed since the last build."))

    def test_new_revision_or_snapshot_triggers_a_build(self) -> None:
        for key in ("revision", "sourceChange"):
            build, reason = state_module.decide(STATE, {**STATE, key: "old"}, "p")
            self.assertTrue(build)
            self.assertIn(key, reason)

    def test_profile_mismatch_waits_for_the_deploy(self) -> None:
        self.assertFalse(state_module.decide(STATE, None, "other")[0])


if __name__ == "__main__":
    unittest.main()
