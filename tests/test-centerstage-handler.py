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

    def test_obsidian_preserves_existing_split_mode(self):
        self.state.joinpath("centerstage-left-layout").write_text("grid-obsidian")
        self.seed([client("0xa1", tags=[], **{"class": "obsidian"})])
        self.set_events("openwindow>>a1,1,obsidian,test\n")
        self.run_script("centerstage-handler.sh")
        self.assertEqual(self.state.joinpath("centerstage-left-layout").read_text(), "grid-obsidian")
        self.assertIn("centerstage-left-primary", json.loads(self.clients.read_text())[0]["tags"])

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
