#!/usr/bin/env python3
"""User interactions share the Lua-backed, isolated IPC fixture."""
import importlib.util
import fcntl
import json
from pathlib import Path
import subprocess
import time
import unittest

spec = importlib.util.spec_from_file_location("smoothness", Path(__file__).with_name("test-centerstage-smoothness.py"))
assert spec and spec.loader
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
client = base.client


class InteractionTest(unittest.TestCase):
    clients: Path
    log: Path
    state: Path
    env: dict[str, str]
    setUp = base.LayoutTest.setUp
    run_script = base.LayoutTest.run_script
    seed = base.LayoutTest.seed
    calls = base.LayoutTest.calls

    def wait_for_lock_fd(self, process):
        lock_path = self.state / "centerstage-layout.lock"
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if process.poll() is not None:
                break
            for fd in Path(f"/proc/{process.pid}/fd").glob("*"):
                try:
                    if Path(fd).resolve() == lock_path:
                        return
                except FileNotFoundError:
                    continue
        self.fail("operation did not open the layout lock")

    def test_directional_swap_cancels_if_one_member_leaves_the_workspace(self):
        original = [client("0xa1", at=[6410, 100], size=[1190, 930]),
                    client("0xa2", position=2, at=[6410, 1130], size=[1190, 930])]
        self.seed(original)
        self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa2": {"workspace": {"id": 2}}})
        self.run_script("centerstage-swap.sh", "down")
        self.assertEqual(json.loads(self.clients.read_text()), [original[0], dict(original[1], workspace={"id": 2})])

    def test_invalid_commands_are_non_destructive(self):
        original = [client("0xa1")]
        for script, args in (("centerstage-move.sh", ("invalid", "0xa1")),
                             ("centerstage-move.sh", ("left", "0xnot-an-address")),
                             ("centerstage-retile.sh", ("right", "4")),
                             ("centerstage-swap.sh", ("invalid",))):
            with self.subTest(script=script, args=args):
                self.seed(original)
                result = self.run_script(script, *args, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(json.loads(self.clients.read_text()), original)
                self.assertEqual(self.calls("eval"), [])

    def test_concurrent_moves_share_one_layout_lock(self):
        self.seed([client("0xa1"), client("0xa2", position=2)])
        processes = [subprocess.Popen([str(base.ROOT / "scripts/centerstage-move.sh"), "center", addr],
                                      env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                     for addr in ("0xa1", "0xa2")]
        for process in processes:
            stdout, stderr = process.communicate(timeout=15)
            self.assertEqual(process.returncode, 0, stdout + stderr)
        after = json.loads(self.clients.read_text())
        self.assertTrue(all(w["tags"] == ["centerstage-center"] for w in after))
        self.assertTrue(all(w["size"] == [(2560 - 100) // 2, 1960] for w in after))
        self.assertEqual(len({tuple(w["at"]) for w in after}), 2)

    def test_implicit_move_selects_focus_after_waiting_for_layout_lock(self):
        self.seed([client("0xa1", zone="center"), client("0xa2")])
        active_file = self.home / "active-window"
        active_file.write_text("0xa1")
        query_marker = self.home / "active-window-queried"
        env = dict(self.env, CENTERSTAGE_TEST_ACTIVE_FILE=str(active_file),
                   CENTERSTAGE_TEST_ACTIVE_QUERY_MARKER=str(query_marker))
        lock_path = self.state / "centerstage-layout.lock"
        with lock_path.open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen([str(base.ROOT / "scripts/centerstage-move.sh"), "center"],
                                       env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.wait_for_lock_fd(process)
            active_file.write_text("0xa2")
            fcntl.flock(lock, fcntl.LOCK_UN)
        stdout, stderr = process.communicate(timeout=15)
        self.assertEqual(process.returncode, 0, stdout + stderr)
        self.assertTrue(query_marker.exists())
        by_address = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertEqual(by_address["0xa2"]["tags"], ["centerstage-center"])
        self.assertEqual(by_address["0xa1"]["tags"], ["centerstage-center"])

    def test_implicit_swap_selects_focus_after_waiting_for_layout_lock(self):
        self.seed([client("0xa1"), client("0xa2", position=2), client("0xa3", position=3)])
        active_file = self.home / "active-window"
        active_file.write_text("0xa1")
        query_marker = self.home / "active-window-queried"
        env = dict(self.env, CENTERSTAGE_TEST_ACTIVE_FILE=str(active_file),
                   CENTERSTAGE_TEST_ACTIVE_QUERY_MARKER=str(query_marker))
        lock_path = self.state / "centerstage-layout.lock"
        with lock_path.open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen([str(base.ROOT / "scripts/centerstage-swap.sh"), "down"],
                                       env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.wait_for_lock_fd(process)
            active_file.write_text("0xa2")
            fcntl.flock(lock, fcntl.LOCK_UN)
        stdout, stderr = process.communicate(timeout=15)
        self.assertEqual(process.returncode, 0, stdout + stderr)
        self.assertTrue(query_marker.exists())
        by_address = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertIn("centerstage-right-1", by_address["0xa1"]["tags"])
        self.assertIn("centerstage-right-3", by_address["0xa2"]["tags"])
        self.assertIn("centerstage-right-2", by_address["0xa3"]["tags"])

    def test_single_layout_rejects_explicit_left_subcolumn_targets(self):
        for target in ("left-primary", "left-secondary"):
            with self.subTest(target=target):
                self.seed([client("0xa1")])
                result = self.run_script("centerstage-move.sh", target, "0xa1", check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(target, result.stderr)
                self.assertEqual(json.loads(self.clients.read_text()), [client("0xa1")])
                self.assertEqual(self.calls("eval"), [])

    def test_pbp_rejects_explicit_left_subcolumn_targets(self):
        self.state.joinpath("centerstage-pbp-mode").write_text("on")
        self.seed([client("0xa1")])
        result = self.run_script("centerstage-move.sh", "left-primary", "0xa1", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("single", result.stderr)
        self.assertEqual(json.loads(self.clients.read_text()), [client("0xa1")])
        self.assertEqual(self.calls("eval"), [])

    def test_horizontal_swap_uses_visual_order_and_one_batch(self):
        self.state.joinpath("centerstage-left-layout").write_text("grid-obsidian")
        self.seed([client("0xa1", zone="left-primary"), client("0xa2", zone="center")])
        self.run_script("centerstage-swap.sh", "right")
        first = json.loads(self.clients.read_text())[0]
        self.assertIn("centerstage-center", first["tags"], "primary is next to center in grid-obsidian mode")
        self.assertEqual(len(self.calls("eval")), 1)

    def test_swap_keeps_focus_and_preserves_cell_sizes_and_position_shortcuts(self):
        self.seed([client("0xa1"), client("0xa2", position=2)])
        self.run_script("centerstage-retile.sh", "right", "1")
        before = json.loads(self.clients.read_text())
        self.log.write_text("")
        self.run_script("centerstage-swap.sh", "down")
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")), "do not cycle keyboard focus through the grid")
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[0]["at"], before[1]["at"])
        self.assertEqual(after[1]["at"], before[0]["at"])
        self.assertEqual(after[0]["size"], before[0]["size"])
        self.assertIn("centerstage-right-2", after[0]["tags"])
        self.assertIn("centerstage-right-1", after[1]["tags"])
        self.assertEqual(len(self.calls("eval")), 1)
        self.run_script("centerstage-retile.sh", "right", "1")
        self.assertEqual(json.loads(self.clients.read_text()), after, "retiling must not undo the swap")

    def test_move_reflows_source_and_destination_in_one_batch(self):
        self.seed([client("0xa1"), client("0xa2", position=2), client("0xa3", zone="center")])
        self.run_script("centerstage-retile.sh", "right", "1")
        self.run_script("centerstage-retile.sh", "center", "1")
        self.log.write_text("")
        self.run_script("centerstage-move.sh", "center", "0xa1")
        by_address = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertEqual(by_address["0xa2"]["size"], [2380 // 2, 1960], "close the gap in the source zone")
        for address in ("0xa1", "0xa3"):
            self.assertEqual(by_address[address]["size"], [(2560 - 100) // 2, 1960])
        self.assertEqual(by_address["0xa1"]["tags"], ["centerstage-center"])
        self.assertEqual(len(self.calls("eval")), 1, "tag changes and both zone transitions must land together")
        self.assertEqual(len(self.calls("clients")), 1)
        self.assertNotIn("hl.dsp.focus", self.calls("eval")[0][1])

    def test_focused_center_swap_exchanges_geometry_and_membership(self):
        self.seed([client("0xa1", zone="right", position=2, at=[6410, 100], size=[1190, 930]),
                   client("0xa2", zone="center", at=[2560, 360], size=[2560, 1440])])
        self.run_script("centerstage-swap-focused-center.sh")
        by_address = {w["address"]: w for w in json.loads(self.clients.read_text())}
        # Focused 0xa1 moves into the center; displaced 0xa2 inherits its cell.
        self.assertEqual(by_address["0xa1"]["at"], [2560, 360])
        self.assertEqual(by_address["0xa1"]["size"], [2560, 1440])
        self.assertEqual(by_address["0xa2"]["at"], [6410, 100])
        self.assertEqual(by_address["0xa2"]["size"], [1190, 930])
        self.assertIn("centerstage-center", by_address["0xa1"]["tags"])
        self.assertNotIn("centerstage-center", by_address["0xa2"]["tags"])
        self.assertIn("centerstage-right-2", by_address["0xa2"]["tags"])
        self.assertEqual(len(self.calls("eval")), 1, "the whole swap is one batch")
        # Focus lands on the window now in center stage: the user's own window.
        self.assertTrue(self.calls("eval")[0][1].count("hl.dsp.focus") == 1)
        self.assertIn("'address:0xa1'", self.calls("eval")[0][1].split("hl.dsp.focus")[1].split("end")[0])

    def test_focused_center_swap_swaps_first_center_cell_by_reading_order(self):
        self.seed([client("0xa1", zone="right", position=1, at=[6410, 100], size=[1190, 930]),
                   client("0xa2", zone="center", at=[2560, 360], size=[1260, 1440]),
                   client("0xa3", zone="center", at=[3860, 360], size=[1260, 1440])])
        self.run_script("centerstage-swap-focused-center.sh")
        by_address = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertEqual(by_address["0xa1"]["at"], [2560, 360], "top-left-most center cell is chosen")
        self.assertIn("centerstage-center", by_address["0xa1"]["tags"])
        self.assertEqual(by_address["0xa2"]["at"], [6410, 100], "first cell window takes the old cell")
        self.assertNotIn("centerstage-center", by_address["0xa2"]["tags"])
        self.assertEqual(by_address["0xa3"]["at"], [3860, 360], "other center windows stay put")

    def test_focused_center_swap_from_center_zone_swaps_within_center(self):
        self.seed([client("0xa1", zone="center", at=[2560, 360], size=[1260, 1440]),
                   client("0xa2", zone="center", at=[3860, 360], size=[1260, 1440])])
        self.run_script("centerstage-swap-focused-center.sh")
        by_address = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertEqual(by_address["0xa1"]["at"], [3860, 360])
        self.assertEqual(by_address["0xa2"]["at"], [2560, 360])
        for address in ("0xa1", "0xa2"):
            self.assertEqual(by_address[address]["tags"], ["centerstage-center"])

    def test_focused_center_swap_is_reversible(self):
        original = [client("0xa1", zone="right", position=2, at=[6410, 100], size=[1190, 930]),
                    client("0xa2", zone="center", at=[2560, 360], size=[2560, 1440])]
        self.seed(original)
        self.run_script("centerstage-swap-focused-center.sh")
        # Focus follows the displaced window (Super+Tab in real use); tapping
        # again must restore the original layout exactly.
        self.env["CENTERSTAGE_TEST_ACTIVE"] = "0xa2"
        self.run_script("centerstage-swap-focused-center.sh")
        self.assertEqual(json.loads(self.clients.read_text()), original)

    def test_swap_back_focuses_the_window_returning_to_center(self):
        self.seed([client("0xa1", zone="right", position=2, at=[6410, 100], size=[1190, 930]),
                   client("0xa2", zone="center", at=[2560, 360], size=[2560, 1440])])
        self.run_script("centerstage-swap-focused-center.sh")
        # The user's window is centered and focused; tapping again swaps back
        # and focus must follow 0xa2, the window returning to center.
        self.run_script("centerstage-swap-focused-center.sh")
        calls = self.calls("eval")
        self.assertEqual(len(calls), 2)
        self.assertIn("'address:0xa2'", calls[1][1].split("hl.dsp.focus")[1].split("end")[0])

    def test_focused_center_swap_noops_when_focus_is_sole_center_window(self):
        sole = [client("0xa1", zone="center", at=[2560, 360], size=[2560, 1440]),
                client("0xa2", zone="right", position=1, at=[6410, 100], size=[1190, 930])]
        self.seed(sole)
        result = self.run_script("centerstage-swap-focused-center.sh", check=False)
        self.assertNotEqual(result.returncode, 0, "no swap target exists")
        self.assertEqual(json.loads(self.clients.read_text()), sole)
        self.assertEqual(self.calls("eval"), [])

    def test_focused_center_swap_cancels_when_center_window_leaves(self):
        original = [client("0xa1", zone="right", position=2, at=[6410, 100], size=[1190, 930]),
                    client("0xa2", zone="center", at=[2560, 360], size=[2560, 1440])]
        self.seed(original)
        self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa2": {"workspace": {"id": 2}}})
        self.run_script("centerstage-swap-focused-center.sh", check=False)
        self.assertEqual(json.loads(self.clients.read_text()),
                         [original[0], dict(original[1], workspace={"id": 2})])

    def test_focused_center_swap_rejects_pbp_and_foreign_workspaces(self):
        self.state.joinpath("centerstage-pbp-mode").write_text("on")
        self.seed([client("0xa1"), client("0xa2", zone="center")])
        result = self.run_script("centerstage-swap-focused-center.sh", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PBP", result.stderr)
        self.state.joinpath("centerstage-pbp-mode").unlink()
        # Workspaces outside 1-3 (handler-managed) are not swapped.
        for focus in (client("0xa1", workspace=4, zone="center"),):
            self.seed([focus, client("0xa2", zone="center", workspace=4)])
            self.run_script("centerstage-swap-focused-center.sh", check=False)
            after = json.loads(self.clients.read_text())
            self.assertEqual([w["at"] for w in after], [[0, 0], [0, 0]])

    def test_swap_back_uses_saved_pair_when_center_window_is_focused(self):
        # Two right-zone windows stacked: after swapping 0xa1 into the center,
        # focusing the center and tapping again returns 0xa1 to position 2 —
        # its remembered cell — rather than the first cell.
        self.seed([client("0xa1", zone="right", position=2, at=[6410, 1130], size=[1190, 930]),
                   client("0xa2", zone="right", position=1, at=[6410, 100], size=[1190, 930]),
                   client("0xa3", zone="center", at=[2560, 360], size=[2560, 1440])])
        self.run_script("centerstage-swap-focused-center.sh")
        by_address = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertIn("centerstage-center", by_address["0xa1"]["tags"])
        # Focus follows the displaced 0xa3 (now right-2); swap it back to center.
        self.env["CENTERSTAGE_TEST_ACTIVE"] = "0xa1"
        self.run_script("centerstage-swap-focused-center.sh")
        after = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertIn("centerstage-center", after["0xa3"]["tags"], "focused center swaps back with saved partner")
        self.assertIn("centerstage-right-2", after["0xa1"]["tags"], "partner returns to its remembered cell")
        self.assertEqual(after["0xa1"]["at"], [6410, 1130])

    def test_swap_memory_survives_layout_reshuffles(self):
        self.seed([client("0xa1", zone="right", position=2, at=[6410, 1130], size=[1190, 930]),
                   client("0xa3", zone="center", at=[2560, 360], size=[2560, 1440])])
        self.run_script("centerstage-swap-focused-center.sh")
        # Someone else now occupies center slot 2; 0xa3 was reshuffled to slot 1
        # (and center 0xa1 keeps its cell). Memory must still find 0xa3.
        clients = json.loads(self.clients.read_text())
        for w in clients:
            if w["address"] == "0xa3":
                w["at"], w["tags"] = [6410, 100], ["centerstage-right", "centerstage-right-1"]
        self.clients.write_text(json.dumps(clients))
        self.env["CENTERSTAGE_TEST_ACTIVE"] = "0xa1"
        self.run_script("centerstage-swap-focused-center.sh")
        after = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertIn("centerstage-center", after["0xa3"]["tags"])
        self.assertIn("centerstage-right-1", after["0xa1"]["tags"])
        self.assertEqual(after["0xa1"]["at"], [6410, 100], "geometry follows the live cell, not the stale one")

    def test_stale_swap_memory_falls_back_to_first_center_cell(self):
        # Saved partner no longer exists; the swap proceeds with the live
        # first center window instead of failing.
        self.seed([client("0xa1", zone="right", position=1, at=[6410, 100], size=[1190, 930]),
                   client("0xa3", zone="center", at=[2560, 360], size=[2560, 1440])])
        self.state.joinpath("centerstage-swap-last-1").write_text(
            "0xa1 s0xa1 0xdead sdead")
        self.run_script("centerstage-swap-focused-center.sh")
        after = {w["address"]: w for w in json.loads(self.clients.read_text())}
        self.assertIn("centerstage-center", after["0xa1"]["tags"])
        self.assertIn("centerstage-right-1", after["0xa3"]["tags"])

    def test_swap_memory_isolated_per_workspace(self):
        self.seed([client("0xa1", zone="right", position=1, at=[6410, 100], size=[1190, 930]),
                   client("0xa3", zone="center", at=[2560, 360], size=[2560, 1440])])
        self.run_script("centerstage-swap-focused-center.sh")
        self.assertTrue((self.state / "centerstage-swap-last-1").exists())
        self.assertFalse((self.state / "centerstage-swap-last-2").exists())


if __name__ == "__main__":
    unittest.main()
