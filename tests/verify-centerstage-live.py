#!/usr/bin/env python3
"""Exercise real automatic placement, background closes, sizing and promotion."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import threading
import time

ROOT = Path.home() / ".config/hypr"
PROBE = f"centerstage-experience-probe-{os.getpid()}"
AUTOSAVE_TIMER = "centerstage-autosave.timer"
AUTOSAVE_SERVICE = "centerstage-autosave.service"


def run(*args):
    return subprocess.run(args, text=True, capture_output=True, timeout=15, check=True).stdout.strip()


def query():
    return json.loads(run("hyprctl", "clients", "-j"))


def wait_for(predicate):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        clients = query()
        if predicate(clients):
            return clients
        time.sleep(0.025)
    raise AssertionError("live probe state timed out: " + json.dumps([
        {k: w[k] for k in ("address", "class", "at", "size", "workspace", "tags")}
        for w in query() if w["class"] == PROBE]))


def evaluate(code):
    result = run("hyprctl", "eval", code)
    assert result == "ok", result


def active(unit):
    return subprocess.run(["systemctl", "--user", "is-active", "--quiet", unit]).returncode == 0


def capture_autosave_state():
    return {
        "timer": active(AUTOSAVE_TIMER),
        "service": active(AUTOSAVE_SERVICE),
    }


def pause_autosave(state):
    if state["timer"]:
        run("systemctl", "--user", "stop", AUTOSAVE_TIMER)
    # A timer can fire between the initial snapshot and the stop completing.
    # Preserve any job we interrupt, and cancel queued timer-triggered work.
    state["service"] = state["service"] or active(AUTOSAVE_SERVICE)
    if state["timer"] or state["service"]:
        run("systemctl", "--user", "stop", AUTOSAVE_SERVICE)


def restore_autosave(state):
    errors = []
    if state["service"]:
        try:
            run("systemctl", "--user", "restart", AUTOSAVE_SERVICE)
            result = run("systemctl", "--user", "show", AUTOSAVE_SERVICE,
                         "--property=Result", "--value")
            exit_status = run("systemctl", "--user", "show", AUTOSAVE_SERVICE,
                              "--property=ExecMainStatus", "--value")
            assert result == "success" and exit_status == "0", (
                f"autosave service job failed: Result={result!r}, exit={exit_status!r}"
            )
        except Exception as error:
            errors.append(f"Autosave service restoration failed: {error}")
    if state["timer"]:
        try:
            run("systemctl", "--user", "start", AUTOSAVE_TIMER)
            assert active(AUTOSAVE_TIMER), "autosave timer did not restart"
        except Exception as error:
            errors.append(f"Autosave timer restoration failed: {error}")
    return errors



def main():
    monitors = json.loads(run("hyprctl", "monitors", "-j"))
    assert len(monitors) == 1, "live test requires the single-monitor Centerstage setup"
    monitor = monitors[0]
    assert [monitor[k] for k in ("width", "height", "scale", "x", "y")] == [7680, 2160, 1, 0, 0], "live test requires the 7680x2160 scale-1 layout"
    assert monitor["activeWorkspace"]["id"] != 3, "choose another workspace before running background probes"
    before = query()
    assert not any(w["workspace"]["id"] == 3 for w in before), "workspace 3 is in use"
    assert active("centerstage-handler.service"), "handler is not active"
    for name in ("centerstage-pbp-mode", "centerstage-pip-workspace-mode"):
        p = ROOT / "state" / name
        assert not p.exists() or p.read_text().strip() != "on", "normal workspace mode required"
    focus_before = json.loads(run("hyprctl", "activewindow", "-j"))["address"]
    paths = [ROOT / "state/centerstage-center-width", ROOT / "state/centerstage-center-height-3"]
    original = {p: p.read_bytes() if p.exists() else None for p in paths}
    written = dict(original)
    autosave = capture_autosave_state()
    results = {}
    trace_stop = threading.Event()
    trace_socket = None
    trace_thread = None
    raw_events = []


    def trace_events():
        assert trace_socket is not None
        buffer = ""
        owned = set()
        while not trace_stop.is_set():
            try:
                data = trace_socket.recv(65536)
            except socket.timeout:
                continue
            if not data:
                return
            buffer += data.decode(errors="replace")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                if line.startswith("openwindow>>") and PROBE in line:
                    owned.add(line.split(">>", 1)[1].split(",", 1)[0])
                    raw_events.append(line)
                elif line.startswith("closewindow>>") and line.split(">>", 1)[1] in owned:
                    raw_events.append(line)


    try:
        pause_autosave(autosave)
        run("systemctl", "--user", "restart", "centerstage-handler.service")
        run("systemctl", "--user", "is-active", "centerstage-handler.service")
        # Type=simple reports active before the Python connector has subscribed.
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            pid = run("systemctl", "--user", "show", "centerstage-handler.service", "--property=MainPID", "--value")
            proc = Path("/proc") / pid
            try:
                if b"--event-fd" in (proc / "cmdline").read_bytes() and (proc / "wchan").read_text() == "unix_stream_read_generic":
                    break
            except FileNotFoundError:
                pass
            time.sleep(0.01)
        else:
            raise AssertionError("handler never reached its subscribed event-read loop")
        trace_socket = socket.socket(socket.AF_UNIX)
        trace_socket.connect(str(Path(os.environ["XDG_RUNTIME_DIR"]) / "hypr" / os.environ["HYPRLAND_INSTANCE_SIGNATURE"] / ".socket2.sock"))
        trace_socket.settimeout(0.1)
        trace_thread = threading.Thread(target=trace_events, daemon=True)
        trace_thread.start()
        probes = []
        launch_times = []
        for index, zone in enumerate(("center", "right", "right")):
            existing = {w["address"] for w in probes}
            cmd = f"foot --app-id={PROBE} --title=Experience-probe-{index} --window-size-pixels=1000x700"
            start = time.perf_counter()
            evaluate(f"hl.exec_cmd({json.dumps(cmd)}, {{workspace='3 silent',no_focus=true}})")
            clients = wait_for(lambda ws: any(w["class"] == PROBE and w["address"] not in existing and
                                              "centerstage-" + zone in w["tags"] for w in ws))
            probes.append(next(w for w in clients if w["class"] == PROBE and w["address"] not in existing))
            launch_times.append(round((time.perf_counter() - start) * 1000, 2))
        addresses = {w["address"] for w in probes}
        center_addr = probes[0]["address"]
        run(str(ROOT / "scripts/centerstage-height.sh"), "3")
        height_data = paths[1].read_bytes()
        written[paths[1]] = height_data
        height = int(height_data)
        run(str(ROOT / "scripts/centerstage-resize.sh"), "3")
        width_data = paths[0].read_bytes()
        written[paths[0]] = width_data
        width = int(width_data)
        center = next(w for w in query() if w["address"] == center_addr)
        assert center["size"] == [width, height], center
        assert center["at"] == [(7680 - width) // 2, (2160 - height) // 2], center
        os.kill(probes[1]["pid"], signal.SIGTERM)
        remaining_addr = probes[2]["address"]
        closed_state = wait_for(lambda ws: not any(w["address"] == probes[1]["address"] for w in ws) and
                               any(w["address"] == remaining_addr and w["size"][1] == 1960 for w in ws))
        center = next(w for w in closed_state if w["address"] == center_addr)
        assert center["size"] == [width, height], "closing a sidebar window reset the chosen center height"
        mode = run("bash", "-c", 'source "$HOME/.config/hypr/scripts/centerstage-lib.sh"; get_left_layout_mode')
        if mode != "single":
            run(str(ROOT / "scripts/centerstage-move.sh"), "left-primary", remaining_addr)
            run(str(ROOT / "scripts/centerstage-swap-primary-center.sh"), "3")
            promoted = next(w for w in query() if w["address"] == remaining_addr)
            assert "centerstage-center" in promoted["tags"] and promoted["size"] == [width, height]
            results["primary_promotion_verified"] = True
        after = {w["address"]: w for w in query()}
        for w in before:
            assert w["address"] in after, "a preexisting window closed during verification"
            assert all(after[w["address"]][key] == w[key] for key in
                       ("at", "size", "tags", "workspace", "floating", "fullscreen")), "preexisting window changed"
        assert json.loads(run("hyprctl", "activewindow", "-j"))["address"] == focus_before, "focus changed"
        results.update(auto_placement_ms=launch_times, background_close_reflow=True,
                       chosen_height_survived_close=True, sizing_verified=True,
                       working_windows_unchanged=True, focus_unchanged=True)
    finally:
        cleanup_errors = []
        try:
            for w in query():
                if w["class"] == PROBE:
                    try:
                        os.kill(w["pid"], signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            wait_for(lambda ws: not any(w["class"] == PROBE for w in ws))
        except Exception as error:
            cleanup_errors.append(f"Probe cleanup failed: {error}")
        trace_stop.set()
        if trace_thread:
            trace_thread.join(1)
        if trace_socket:
            trace_socket.close()
        results["raw_probe_events"] = raw_events
        # Restore each setting independently, even if another cleanup step failed.
        for p in paths:
            try:
                current = p.read_bytes() if p.exists() else None
                if current != written[p]:
                    cleanup_errors.append(f"Concurrent state edit detected; left {p} untouched")
                    continue
                saved = original[p]
                if saved is None:
                    p.unlink(missing_ok=True)
                else:
                    p.write_bytes(saved)
                assert (p.read_bytes() if p.exists() else None) == saved
            except Exception as error:
                cleanup_errors.append(f"Could not restore {p}: {error}")
        cleanup_errors.extend(restore_autosave(autosave))
        if not active("centerstage-handler.service"):
            cleanup_errors.append("Centerstage handler is not active after the test")
        assert not cleanup_errors, cleanup_errors
    results["probes_cleaned_and_settings_restored"] = True
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
