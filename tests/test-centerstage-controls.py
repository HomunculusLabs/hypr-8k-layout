#!/usr/bin/env python3
"""Sizing controls must preserve layout shape, focus, and chosen center height."""
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("smoothness", Path(__file__).with_name("test-centerstage-smoothness.py"))
assert spec and spec.loader
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
client = base.client


class ControlsTest(unittest.TestCase):
    clients: Path
    log: Path
    state: Path
    env: dict[str, str]
    setUp = base.LayoutTest.setUp
    run_script = base.LayoutTest.run_script
    seed = base.LayoutTest.seed
    calls = base.LayoutTest.calls

    def test_width_cycle_does_not_change_fixed_pip_geometry_or_state(self):
        self.seed([client("0xa1", zone="center", at=[80, 100], size=[3680, 1960])])
        self.state.joinpath("centerstage-pip-workspace-mode").write_text("on")
        self.state.joinpath("centerstage-center-width").write_text("2560")
        before = self.clients.read_text()
        result = self.run_script("centerstage-resize.sh", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.clients.read_text(), before)
        self.assertEqual(self.state.joinpath("centerstage-center-width").read_text(), "2560")

    def test_failed_ipc_does_not_publish_size_state(self):
        self.seed([client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200])])
        self.state.joinpath("centerstage-center-width").write_text("2560")
        self.state.joinpath("centerstage-center-height-1").write_text("1200")
        self.env["CENTERSTAGE_TEST_EVAL_FAIL"] = "1"
        for script in ("centerstage-resize.sh", "centerstage-height.sh"):
            result = self.run_script(script, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(self.state.joinpath("centerstage-center-width").read_text(), "2560")
            self.assertEqual(self.state.joinpath("centerstage-center-height-1").read_text(), "1200")
            self.assertEqual(list(self.state.glob(".centerstage-*")), [])

    def test_width_cycle_uses_live_center_width_not_persisted_width(self):
        self.seed([client("0xa1", zone="center", at=[2690, 480], size=[2300, 1200])])
        self.state.joinpath("centerstage-center-width").write_text("2560")

        self.run_script("centerstage-resize.sh")

        after = json.loads(self.clients.read_text())[0]
        self.assertEqual(after["size"], [1920, 1200])
        self.assertEqual(self.state.joinpath("centerstage-center-width").read_text().strip(), "1920")

    def test_size_state_is_not_published_when_a_target_is_skipped(self):
        original = [client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200]),
                    client("0xa2", zone="right", position=1)]
        self.seed(original)
        self.state.joinpath("centerstage-center-width").write_text("2560")
        self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa1": {"fullscreen": 2}})

        result = self.run_script("centerstage-resize.sh", check=False)

        self.assertNotEqual(result.returncode, 0)
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[0]["size"], original[0]["size"])
        self.assertNotEqual(after[1]["size"], original[1]["size"])
        self.assertEqual(self.state.joinpath("centerstage-center-width").read_text(), "2560")
        self.assertEqual(list(self.state.glob(".centerstage-*")), [])

    def test_primary_swap_cancels_both_halves_if_one_window_changes_workspace(self):
        self.state.joinpath("centerstage-left-layout").write_text("obsidian-grid")
        original = [client("0xa1", zone="left-primary"), client("0xa2", zone="center")]
        self.seed(original)
        self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa2": {"workspace": {"id": 2}}})
        self.run_script("centerstage-swap-primary-center.sh")
        self.assertEqual(json.loads(self.clients.read_text()), [original[0], dict(original[1], workspace={"id": 2})])

    def test_primary_swap_is_one_batch_with_one_deliberate_focus_change(self):
        self.state.joinpath("centerstage-left-layout").write_text("obsidian-grid")
        self.state.joinpath("centerstage-center-height-1").write_text("1200")
        self.seed([client("0xa1", zone="left-primary", at=[80, 100], size=[1140, 1960]),
                   client("0xa2", zone="center", at=[2560, 480], size=[2560, 1200]), client("0xa3")])
        self.env["CENTERSTAGE_TEST_ACTIVE"] = "0xa3"
        self.run_script("centerstage-swap-primary-center.sh")
        focus_count = sum(call[1].count("hl.dsp.focus") for call in self.calls("eval"))
        self.assertEqual(focus_count, 1, "only focus the newly promoted center window once")
        self.assertEqual(len(self.calls("eval")), 1)
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[0]["size"], [2560, 1200])
        self.assertEqual(after[1]["size"], [1140, 1960])
        self.assertIn("centerstage-center", after[0]["tags"])
        self.assertIn("centerstage-left-primary", after[1]["tags"])
        self.run_script("centerstage-retile.sh", "left", "1")
        self.run_script("centerstage-retile.sh", "center", "1")
        self.assertEqual(json.loads(self.clients.read_text()), after)

    def test_height_choice_survives_reflow_and_does_not_steal_focus(self):
        self.seed([client("0xa1", zone="center", at=[2560, 100], size=[2560, 1960]),
                   client("0xa2")])
        self.env["CENTERSTAGE_TEST_ACTIVE"] = "0xa2"
        self.run_script("centerstage-height.sh")
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")))
        self.assertEqual(json.loads(self.clients.read_text())[0]["size"], [2560, 1080])
        self.run_script("centerstage-reflow.sh", "1")
        self.assertEqual(json.loads(self.clients.read_text())[0]["size"], [2560, 1080])
        self.run_script("centerstage-move.sh", "center", "0xa2")
        self.run_script("centerstage-resize.sh")
        after = json.loads(self.clients.read_text())
        self.assertTrue(all(w["size"] == [(3000 - 100) // 2, 1080] for w in after))
        self.assertTrue(all(w["at"][1] == (2160 - 1080) // 2 for w in after))
        self.assertEqual(self.state.joinpath("centerstage-center-height-1").read_text().strip(), "1080")

    def test_width_cycle_preserves_sidebar_grid_and_focus(self):
        self.seed([client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200]),
                   *[client(f"0xb{i}", position=i) for i in range(1, 5)]])
        self.run_script("centerstage-retile.sh", "right", "1")
        self.log.write_text("")
        self.run_script("centerstage-resize.sh")
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[0]["size"], [3000, 1200])
        self.assertEqual(after[0]["at"], [(7680 - 3000) // 2, (2160 - 1200) // 2])
        self.assertEqual(len({w["at"][0] for w in after[1:]}), 2, "retain the two-column sidebar")
        self.assertEqual(len({w["at"][1] for w in after[1:]}), 2)
        self.assertEqual(len(self.calls("eval")), 1)
        self.assertNotIn("hl.dsp.focus", self.calls("eval")[0][1])
        self.assertEqual(self.state.joinpath("centerstage-center-width").read_text().strip(), "3000")


if __name__ == "__main__":
    unittest.main()
