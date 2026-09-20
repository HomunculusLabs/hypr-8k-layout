#!/usr/bin/env python3
"""Exercise the actual entrypoints with isolated state and Lua-backed IPC."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from typing import Any
import unittest

ROOT = Path(__file__).resolve().parents[1]


def client(address, zone="right", position=1, workspace=1, **overrides):
    item: dict[str, Any] = dict(address=address, workspace={"id": workspace}, floating=True,
                mapped=True, hidden=False, fullscreen=0, pinned=False,
                tags=["centerstage-" + zone], at=[0, 0], size=[800, 600],
                **{"class": "foot", "title": "test", "pid": int(address, 16)})
    if zone == "right":
        item["tags"].append(f"centerstage-right-{position}")
    item.update(overrides)
    return item


class LayoutTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="centerstage-test-")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        config = self.home / ".config/hypr"
        config.mkdir(parents=True)
        (config / "scripts").symlink_to(ROOT / "scripts", target_is_directory=True)
        self.state = config / "state"
        self.state.mkdir()
        bindir = self.home / "bin"
        bindir.mkdir()
        fake = bindir / "hyprctl"
        shutil.copyfile(ROOT / "tests/fixtures/centerstage-hyprctl.py", fake)
        fake.chmod(0o755)
        notify = bindir / "notify-send"
        notify.write_text("#!/bin/sh\nexit 0\n")
        notify.chmod(0o755)
        self.clients = self.home / "clients.json"
        self.log = self.home / "calls.jsonl"
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(bindir) + ":" + os.environ["PATH"],
                        CENTERSTAGE_TEST_CLIENTS=str(self.clients), CENTERSTAGE_TEST_LOG=str(self.log),
                        CENTERSTAGE_TEST_ACTIVE="0xa1")

    def run_script(self, script, *args, check=True):
        started = time.perf_counter()
        result = subprocess.run([str(ROOT / "scripts" / script), *args], env=self.env,
                                text=True, capture_output=True, timeout=15)
        self.elapsed = time.perf_counter() - started
        if check:
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return result

    def calls(self, command):
        return [args for args in map(json.loads, self.log.read_text().splitlines()) if args[0] == command]

    def seed(self, clients):
        self.clients.write_text(json.dumps(clients))
        self.log.write_text("")

    def test_center_preserving_resize_does_not_grow_at_screen_origin(self):
        self.state.joinpath("centerstage-left-layout").write_text("equal-split")
        self.state.joinpath("centerstage-center-width").write_text("3000")
        self.seed([client("0xa1", zone="left-secondary", at=[80, 100], size=[669, 1960])])
        self.run_script("centerstage-retile.sh", "left", "1")
        after = json.loads(self.clients.read_text())[0]
        self.assertEqual(after["size"], [1030, 1960], "avoid CBox edge rounding to 1031")
        self.assertEqual(after["at"], [1210, 100])
        self.assertEqual(len(self.calls("eval")), 1)

    def test_retile_reconciles_left_tags_with_destination_workspace_mode(self):
        for mode, old_zone, new_zone in (("obsidian-grid", "left", "left-secondary"),
                                         ("single", "left-primary", "left")):
            with self.subTest(mode=mode):
                self.state.joinpath("centerstage-left-layout-2").write_text(mode)
                self.seed([client("0xa1", zone=old_zone, workspace=2)])
                self.run_script("centerstage-retile.sh", "left", "2")
                after = json.loads(self.clients.read_text())[0]
                self.assertIn("centerstage-" + new_zone, after["tags"])
                self.assertNotEqual(after["at"], [0, 0], "workspace/PIP transfers must not strand left windows")
                self.assertEqual(len(self.calls("eval")), 1)

    def test_pbp_right_zone_stays_inside_its_4k_viewport(self):
        self.state.joinpath("centerstage-pbp-mode").write_text("on")
        self.seed([client("0xa1")])
        self.run_script("centerstage-retile.sh", "right", "1")
        window = json.loads(self.clients.read_text())[0]
        self.assertGreaterEqual(window["at"][0], 3840 // 2)
        self.assertLessEqual(window["at"][0] + window["size"][0], 3840 - 80)

    def test_resizing_a_cell_preserves_its_top_left_anchor(self):
        self.seed([client("0xa1", at=[6410, 100], size=[1190, 1960]), client("0xa2", position=2)])
        self.run_script("centerstage-retile.sh", "right", "1")
        first = json.loads(self.clients.read_text())[0]
        self.assertEqual(first["at"], [6410, 100], "Hyprland's centered resize must not shift the cell")
        self.assertEqual(first["size"], [1190, 930])

    def test_layout_variants_and_tiled_windows_remain_supported(self):
        for mode in ("single", "obsidian-grid", "grid-obsidian", "equal-split"):
            for pip in ("off", "on"):
                with self.subTest(mode=mode, pip=pip):
                    self.state.joinpath("centerstage-left-layout").write_text(mode)
                    self.state.joinpath("centerstage-pip-workspace-mode").write_text(pip)
                    zone = "left" if mode == "single" else "left-secondary"
                    self.seed([client("0xa1", zone=zone, floating=False), client("0xa2", zone=zone)])
                    self.run_script("centerstage-retile.sh", "left", "1")
                    after = json.loads(self.clients.read_text())
                    self.assertTrue(all(w["floating"] for w in after))
                    self.assertTrue(all(w["size"][0] > 0 and w["size"][1] > 0 for w in after))
                    self.assertNotEqual(after[0]["at"], after[1]["at"])
                    self.log.write_text("")
                    self.run_script("centerstage-retile.sh", "left", "1")
                    self.assertEqual(self.calls("eval"), [])

    def test_right_grid_sizes_and_pip_viewport(self):
        for count in range(1, 10):
            for pip in ("off", "on"):
                with self.subTest(count=count, pip=pip):
                    self.state.joinpath("centerstage-pip-workspace-mode").write_text(pip)
                    self.seed([client(f"0xa{i}", position=i, workspace=2) for i in range(1, count + 1)])
                    self.run_script("centerstage-retile.sh", "right", "2")
                    after = json.loads(self.clients.read_text())
                    self.assertEqual(len({tuple(w["at"]) for w in after}), count)
                    viewport = 3840 if pip == "on" else 7680
                    self.assertTrue(all(w["at"][0] + w["size"][0] <= viewport - 80 for w in after))
                    self.assertTrue(all(w["at"][1] + w["size"][1] <= 2060 for w in after))

    def test_non_position_tags_do_not_break_ordering(self):
        self.seed([client("0xa1", tags=["centerstage-right", "centerstage-right-primary"])])
        self.run_script("centerstage-retile.sh", "right", "1")
        self.assertEqual(json.loads(self.clients.read_text())[0]["size"], [2380 // 2, 1960])

    def test_batch_rechecks_protection_and_workspace_after_snapshot(self):
        for change in ({"fullscreen": 2}, {"pinned": True}, {"hidden": True},
                       {"mapped": False}, {"workspace": {"id": 4}},
                       {"tags": ["centerstage-right", "centerstage-pinned"]}):
            with self.subTest(change=change):
                original = client("0xa1", position=7)
                self.seed([original])
                self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa1": change})
                self.run_script("centerstage-retile.sh", "right", "1")
                self.assertEqual(json.loads(self.clients.read_text()), [dict(original, **change)])

    def test_batch_skips_windows_with_changed_zone_or_subcolumn_tags(self):
        for changed_tags in (["centerstage-center"], ["centerstage-right", "centerstage-right-9"]):
            with self.subTest(changed_tags=changed_tags):
                original = client("0xa1", position=1, at=[123, 456], size=[700, 500])
                self.seed([original])
                self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps(
                    {"0xa1": {"tags": changed_tags}}
                )
                self.run_script("centerstage-retile.sh", "right", "1")
                self.assertEqual(json.loads(self.clients.read_text()), [dict(original, tags=changed_tags)])
        self.env.pop("CENTERSTAGE_TEST_BEFORE_EVAL", None)

    def test_batch_skips_windows_with_uncertain_nil_tags(self):
        original = client("0xa1", position=1)
        self.seed([original])
        self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa1": {"tags": None}})
        result = self.run_script("centerstage-retile.sh", "right", "1", check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(self.clients.read_text()), [dict(original, tags=None)])
        self.env.pop("CENTERSTAGE_TEST_BEFORE_EVAL", None)

    def test_retile_leaves_fullscreen_games_and_pinned_or_hidden_windows_alone(self):
        excluded = [client("0xa2", position=2, fullscreen=2),
                    client("0xa3", position=3, pinned=True),
                    client("0xa4", position=4, hidden=True),
                    client("0xa5", position=5, tags=["centerstage-right", "centerstage-pinned"]),
                    client("0xa6", position=6, **{"class": "steam_app_123", "title": "Game"})]
        self.seed([client("0xa1"), *excluded])
        self.run_script("centerstage-retile.sh", "right", "1")
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[1:], excluded)
        self.assertEqual(after[0]["size"], [2380 // 2, 1960], "excluded clients must not reserve grid cells")

    def test_settled_retile_sends_no_mutations(self):
        self.seed([client(f"0xa{i}", position=i) for i in range(1, 5)])
        self.run_script("centerstage-retile.sh", "right", "1")
        self.log.write_text("")
        self.run_script("centerstage-retile.sh", "right", "1")
        self.assertEqual(self.calls("eval"), [], "unchanged windows must not restart animations or rewrite tags")

    def test_retile_starts_all_four_windows_in_one_compositor_batch(self):
        self.seed([client(f"0xa{i}", position=i) for i in range(1, 5)])
        self.run_script("centerstage-retile.sh", "right", "1")
        windows = json.loads(self.clients.read_text())
        width = (2380 * 4 // 5 - 100) // 2
        height = (1960 - 100) // 2
        for i, window in enumerate(windows):
            self.assertEqual(window["size"], [width, height])
            self.assertEqual(window["at"], [7680 - 80 - 2380 * 4 // 5 + (i % 2) * (width + 100),
                                            100 + (i // 2) * (height + 100)])
        print(f"four-window retile: {self.elapsed:.3f}s, {len(self.calls('clients'))} snapshots, "
              f"{len(self.calls('eval'))} compositor batches")
        self.assertEqual(len(self.calls("eval")), 1, "windows must start their transitions together")
        self.assertEqual(len(self.calls("clients")), 1, "reuse one coherent client snapshot")


if __name__ == "__main__":
    unittest.main()
