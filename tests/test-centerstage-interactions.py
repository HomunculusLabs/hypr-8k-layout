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


if __name__ == "__main__":
    unittest.main()
