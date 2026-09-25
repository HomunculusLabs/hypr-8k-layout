#!/usr/bin/env python3
"""Replay socket events without connecting to the user's Hyprland instance."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import threading
import time
import unittest

spec = importlib.util.spec_from_file_location("smoothness", Path(__file__).with_name("test-centerstage-smoothness.py"))
assert spec and spec.loader
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
client = base.client


class HandlerTest(unittest.TestCase):
    clients: Path
    log: Path
    home: Path
    state: Path
    env: dict[str, str]
    run_script = base.LayoutTest.run_script
    seed = base.LayoutTest.seed
    calls = base.LayoutTest.calls

    def setUp(self):
        base.LayoutTest.setUp(self)
        runtime = self.home / "r"
        directory = runtime / "hypr/t"
        directory.mkdir(parents=True)
        self.socket = socket.socket(socket.AF_UNIX)
        self.addCleanup(self.socket.close)
        self.socket.bind(str(directory / ".socket2.sock"))
        self.socket.listen(1)
        self.events = b""
        self.connected = threading.Event()
        self.server_error = None

        def serve():
            try:
                connection, _ = self.socket.accept()
                with connection:
                    self.connected.set()
                    if self.events:
                        connection.sendall(self.events)
                        connection.shutdown(socket.SHUT_WR)
            except OSError as error:
                self.server_error = error

        self.server = threading.Thread(target=serve, daemon=True)
        self.server.start()
        self.addCleanup(self.server.join, 2)
        self.env.update(XDG_RUNTIME_DIR=str(runtime), HYPRLAND_INSTANCE_SIGNATURE="t")

    def set_events(self, events):
        self.events = events.encode()

    def test_wow_opens_in_center_and_keeps_existing_work_in_sidebar(self):
        parent = client("0xa1", zone="center")
        game = client("0xa2", tags=[], size=[1923, 1923],
                      **{"class": "steam_app_4036538709", "title": "World of Warcraft"})
        self.seed([parent, game])
        self.set_events("openwindow>>a2,1,steam_app_4036538709,World of Warcraft\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())
        self.assertIn("centerstage-center", after[1]["tags"])
        self.assertEqual(after[1]["size"], [2560, 1440])
        self.assertIn("centerstage-right", after[0]["tags"])
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")))

    def test_tagged_rabby_is_floated_without_joining_a_zone(self):
        parent = client("0xa1", zone="center", pid=1234, **{"class": "brave-browser"})
        popup = client("0xa2", tags=["centerstage-auxiliary*"], floating=False,
                       size=[440, 720], pid=1234,
                       **{"class": "brave-acmacodkjbdgmoleebolmdjonilkdbch-Default"})
        self.seed([parent, popup])
        self.set_events("openwindow>>a2,1,brave-acmacodkjbdgmoleebolmdjonilkdbch-Default,Rabby\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[0], parent)
        self.assertTrue(after[1]["floating"], "auxiliary windows must not remain below the floating layout")
        self.assertEqual(after[1]["size"], popup["size"], "preserve the app's requested dialog size")
        self.assertFalse(set(after[1]["tags"]) & {"centerstage-center", "centerstage-right", "centerstage-left"})
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")),
                         "leave initial focus to the compositor; do not steal it back asynchronously")

    def test_normal_second_browser_window_sharing_pid_is_managed(self):
        parent = client("0xa1", zone="center", pid=1234, **{"class": "brave-browser"})
        second = client("0xa2", tags=[], floating=False, size=[1923, 1923], pid=1234,
                        **{"class": "brave-browser", "title": "New Tab - Brave"})
        self.seed([parent, second])
        self.set_events("openwindow>>a2,1,brave-browser,New Tab - Brave\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[0], parent)
        self.assertTrue(after[1]["floating"])
        self.assertIn("centerstage-right", after[1]["tags"])

    def test_auxiliary_close_does_not_reflow_manually_sized_working_windows(self):
        parent = client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200])
        popup = client("0xa2", tags=["centerstage-auxiliary*"], size=[440, 720])
        self.seed([parent, popup])
        self.set_events("openwindow>>a2,1,fixture,dialog\nclosewindow>>a2\n")
        self.run_script("centerstage-handler.sh")
        self.assertEqual(json.loads(self.clients.read_text())[0], parent,
                         "closing an auxiliary window must not retile the workspace")
        self.assertEqual(self.calls("eval"), [])

    def test_auxiliary_present_at_startup_can_close_without_reflow(self):
        parent = client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200])
        self.seed([parent, client("0xa2", tags=["centerstage-auxiliary*"], size=[440, 720])])
        self.set_events("movewindowv2>>a2,1,1\nclosewindow>>a2\n")
        self.run_script("centerstage-handler.sh")
        self.assertEqual(json.loads(self.clients.read_text())[0], parent)
        self.assertEqual(self.calls("eval"), [])

    def test_resized_small_auxiliary_keeps_role_across_handler_restart(self):
        parent = client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200])
        self.seed([parent, client("0xa2", tags=[], floating=False, size=[480, 320])])
        self.set_events("openwindow>>a2,1,fixture,small dialog\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())
        self.assertIn("centerstage-auxiliary", after[1]["tags"], "the fallback role must survive resizing and restart")
        after[1]["size"] = [900, 700]
        self.seed(after)

        def close_after_restart():
            connection, _ = self.socket.accept()
            with connection:
                connection.sendall(b"closewindow>>a2\n")
                connection.shutdown(socket.SHUT_WR)

        server = threading.Thread(target=close_after_restart, daemon=True)
        server.start()
        self.addCleanup(server.join, 2)
        self.run_script("centerstage-handler.sh")
        self.assertEqual(json.loads(self.clients.read_text())[0], parent)
        self.assertEqual(self.calls("eval"), [], "a resized auxiliary close must not reflow the workspace")

    def test_small_tiled_auxiliary_floats_without_resize(self):
        popup = client("0xa1", tags=[], floating=False, size=[480, 320])
        self.seed([popup])
        self.set_events("openwindow>>a1,1,fixture,small dialog\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())[0]
        self.assertTrue(after["floating"])
        self.assertEqual(after["size"], popup["size"])
        self.assertEqual(after["tags"], ["centerstage-auxiliary"])

    def test_already_floating_small_menu_keeps_geometry(self):
        popup = client("0xa1", tags=[], floating=True, size=[320, 160], at=[4000, 500])
        self.seed([popup])
        self.set_events("openwindow>>a1,1,fixture,menu\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())[0]
        self.assertEqual(after["at"], popup["at"])
        self.assertEqual(after["size"], popup["size"])
        self.assertEqual(after["tags"], ["centerstage-auxiliary"])
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")))

    def test_large_tagged_dialog_is_excluded_without_shared_pid(self):
        popup = client("0xa1", tags=["centerstage-auxiliary*"], floating=False, size=[1923, 1923])
        self.seed([popup])
        self.set_events("openwindow>>a1,1,fixture,large dialog\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())[0]
        self.assertTrue(after["floating"])
        self.assertEqual(after["tags"], popup["tags"])
        self.assertEqual(after["size"], popup["size"])

    def test_background_auxiliary_does_not_steal_focus(self):
        parent = client("0xa1", zone="center")
        popup = client("0xa2", workspace=2, tags=["centerstage-auxiliary"], floating=False)
        self.seed([parent, popup])
        self.set_events("openwindow>>a2,2,fixture,dialog\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[0], parent)
        self.assertTrue(after[1]["floating"])
        self.assertEqual(after[1]["workspace"], popup["workspace"])
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")))

    def test_auxiliary_float_guard_does_not_toggle_an_already_floated_client(self):
        popup = client("0xa1", tags=["centerstage-auxiliary"], floating=False)
        self.seed([popup])
        self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa1": {"floating": True}})
        self.set_events("openwindow>>a1,1,fixture,dialog\n")
        self.run_script("centerstage-handler.sh")
        self.assertTrue(json.loads(self.clients.read_text())[0]["floating"])

    def test_auxiliary_float_guard_rechecks_workspace(self):
        popup = client("0xa1", tags=["centerstage-auxiliary"], floating=False)
        self.seed([popup])
        self.env["CENTERSTAGE_TEST_BEFORE_EVAL"] = json.dumps({"0xa1": {"workspace": {"id": 4}}})
        self.set_events("openwindow>>a1,1,fixture,dialog\n")
        self.run_script("centerstage-handler.sh")
        self.assertEqual(json.loads(self.clients.read_text()), [dict(popup, workspace={"id": 4})])

    def test_mai_buddy_always_joins_left_sidebar_even_when_center_is_busy(self):
        # Live left sidebar runs a split layout; the companion must take the
        # primary slot, not be treated as a generic single-column window.
        self.state.joinpath("centerstage-left-layout").write_text("equal-split")
        center = client("0xa1", zone="center")
        right = client("0xa2", zone="right")
        mai = client("0xa3", tags=[], floating=False, size=[1896, 1896],
                     **{"class": "Mai Buddy", "title": "Bonzi Desktop Companion"})
        self.seed([center, right, mai])
        self.set_events("openwindow>>a3,1,Mai Buddy,Bonzi Desktop Companion\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())
        self.assertIn("centerstage-left-primary", after[2]["tags"],
                      "the companion must never detour through center/right routing")
        self.assertTrue(after[2]["floating"])
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")))

    def test_obsidian_preserves_existing_split_mode(self):
        self.state.joinpath("centerstage-left-layout").write_text("grid-obsidian")
        self.seed([client("0xa1", tags=[], **{"class": "obsidian"})])
        self.set_events("openwindow>>a1,1,obsidian,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertEqual(self.state.joinpath("centerstage-left-layout").read_text(), "grid-obsidian")
        self.assertIn("centerstage-left-primary", json.loads(self.clients.read_text())[0]["tags"])

    def test_obsidian_respects_explicit_single_layout(self):
        self.state.joinpath("centerstage-left-layout").write_text("single")
        self.state.joinpath("centerstage-left-layout-1").write_text("single")
        self.seed([client("0xa1", tags=[], **{"class": "obsidian"})])
        self.set_events("openwindow>>a1,1,obsidian,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertEqual(self.state.joinpath("centerstage-left-layout").read_text(), "single")
        self.assertEqual(self.state.joinpath("centerstage-left-layout-1").read_text(), "single")
        self.assertIn("centerstage-left", json.loads(self.clients.read_text())[0]["tags"])

    def test_obsidian_initialization_migrates_only_its_workspaces_left_windows(self):
        self.state.joinpath("centerstage-left-layout").write_text("single")
        other = client("0xb1", zone="left", workspace=2, at=[80, 100], size=[2380, 1960])
        self.seed([client("0xa1", zone="left"),
                   client("0xa2", tags=[], **{"class": "obsidian"}), other])
        self.set_events("openwindow>>a2,1,obsidian,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertEqual(self.state.joinpath("centerstage-left-layout").read_text(), "single")
        after = json.loads(self.clients.read_text())
        self.assertIn("centerstage-left-secondary", after[0]["tags"])
        self.assertIn("centerstage-left-primary", after[1]["tags"])
        self.assertEqual(after[0]["size"], [1140, 1960])
        self.assertEqual(after[2], other)
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")))

    def test_obsidian_in_pbp_uses_the_available_single_left_zone(self):
        self.state.joinpath("centerstage-pbp-mode").write_text("on")
        self.seed([client("0xa1", tags=[], **{"class": "obsidian"})])
        self.set_events("openwindow>>a1,1,obsidian,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertIn("centerstage-left", json.loads(self.clients.read_text())[0]["tags"])

    def test_close_reflows_the_closed_workspace_not_the_focused_one(self):
        focused = client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200])
        self.seed([focused, client("0xa3", position=2, workspace=2, size=[1190, 930])])
        self.set_events("movewindowv2>>a2,2,2\nclosewindow>>a2\n")
        self.run_script("centerstage-handler.sh")
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[1]["size"], [1190, 1960], "retile the actual source workspace")
        self.assertEqual(after[0], focused, "do not reset a different workspace's custom geometry")
        self.assertEqual(len(self.calls("eval")), 1, "all affected zones share one batch")

    def test_open_avoids_repeated_client_queries_for_zone_counts(self):
        self.seed([client("0xa1", tags=[])])
        self.set_events("openwindow>>a1,1,foot,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertLessEqual(len(self.calls("clients")), 3, "one routing snapshot plus layout/cache work")

    def test_ready_window_does_not_wait_for_an_initialization_timer(self):
        sleep_log = self.home / "sleeps"
        sleeper = self.home / "bin/sleep"
        sleeper.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$CENTERSTAGE_TEST_SLEEP_LOG\"\n")
        sleeper.chmod(0o755)
        self.env["CENTERSTAGE_TEST_SLEEP_LOG"] = str(sleep_log)
        self.seed([client("0xa1", tags=[])])
        self.set_events("openwindow>>a1,1,foot,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertFalse(sleep_log.exists(), "a fully initialized window should be placed immediately")
        self.assertIn("centerstage-center", json.loads(self.clients.read_text())[0]["tags"])

    def test_open_on_background_workspace_never_steals_focus(self):
        self.seed([client("0xa1", zone="center"), client("0xa2", workspace=2, tags=[])])
        self.set_events("openwindow>>a2,2,foot,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertFalse(any("hl.dsp.focus" in call[1] for call in self.calls("eval")))
        second = json.loads(self.clients.read_text())[1]
        self.assertIn("centerstage-center", second["tags"])
        self.assertEqual(second["workspace"]["id"], 2)

    def test_connects_before_initial_snapshot_and_consumes_during_snapshot_event(self):
        focused = client("0xa1", zone="center", at=[2560, 480], size=[2560, 1200])
        self.seed([focused, client("0xa3", position=2, workspace=2, size=[1190, 930])])
        self.set_events("closewindow>>a3\n")

        bindir = self.home / "bin"
        real_hyprctl = bindir / "hyprctl"
        fixture_hyprctl = bindir / "hyprctl-fixture"
        real_hyprctl.rename(fixture_hyprctl)
        snapshot_ready = self.home / "snapshot-ready"
        release_snapshot = self.home / "release-snapshot"
        os.mkfifo(release_snapshot)
        wrapper = bindir / "hyprctl"
        wrapper.write_text(
            "#!/usr/bin/env python3\n"
            "import os, sys\n"
            "from pathlib import Path\n"
            f"ready = Path({str(snapshot_ready)!r})\n"
            f"release = Path({str(release_snapshot)!r})\n"
            "if sys.argv[1:] == ['clients', '-j'] and not ready.exists():\n"
            "    ready.write_text('ready\\n')\n"
            "    with release.open('rb') as gate:\n"
            "        gate.read(1)\n"
            "os.execv(sys.argv[0].replace('hyprctl', 'hyprctl-fixture'), sys.argv)\n"
        )
        wrapper.chmod(0o755)

        process = subprocess.Popen(
            [os.environ.get("CENTERSTAGE_TEST_HANDLER_SOURCE", str(base.ROOT / "scripts" / "centerstage-handler.sh"))],
            env=self.env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        try:
            deadline = time.monotonic() + 5
            while not snapshot_ready.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.001)
            self.assertTrue(snapshot_ready.exists(), "handler did not request its initial snapshot")
            connected = self.connected.wait(2)
            with release_snapshot.open("wb") as release:
                release.write(b"release")
            stdout, stderr = process.communicate(timeout=15)
            self.assertTrue(connected, "the event socket must connect before clients -j")
            self.assertEqual(process.returncode, 0, stderr + stdout)
            self.assertIsNone(self.server_error)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.communicate(timeout=5)
        after = json.loads(self.clients.read_text())
        self.assertEqual(after[1]["size"], [1190, 1960], "event during snapshot must use seeded cache")


if __name__ == "__main__":
    unittest.main()
