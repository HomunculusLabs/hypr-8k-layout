#!/usr/bin/env python3
"""Opt-in native window-rule probe; never launches or interacts with a wallet.

Uses foot windows with Rabby's app ID and a unique initial title on an unused
background workspace. Imports are safe; only main() creates desktop resources.
"""
import importlib.util
import json
import math
import os
from pathlib import Path
import shlex
import signal
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    spec = importlib.util.spec_from_file_location("live_helpers", ROOT / "tests/verify-centerstage-live.py")
    assert spec is not None and spec.loader is not None
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    run, query, evaluate = helpers.run, helpers.query, helpers.evaluate
    prefix = "CenterstageAuxiliaryProbe-" + uuid.uuid4().hex
    classes = {"parent": "centerstage-auxiliary-probe-parent",
               "rabby": "brave-acmacodkjbdgmoleebolmdjonilkdbch-Default",
               "portal": "xdg-desktop-portal-gtk"}
    before = query()
    active_before = json.loads(run("hyprctl", "-j", "activewindow")).get("address")
    occupied = {w["workspace"]["id"] for w in before}
    occupied.update(w["id"] for w in json.loads(run("hyprctl", "-j", "workspaces")))
    workspace = next((w for w in range(99, 89, -1) if w not in occupied), None)
    assert workspace is not None, "no unused probe workspace"
    assert helpers.active("centerstage-handler.service"), "handler is not active"
    autosave = helpers.capture_autosave_state()
    results = {"workspace": workspace, "wallet_opened": False}

    def owned(w):
        return w.get("initialTitle", "").startswith(prefix) and w.get("class") in classes.values()

    def wait(predicate):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            windows = query()
            if predicate(windows):
                return windows
            time.sleep(0.025)
        raise AssertionError("native auxiliary probe timed out")

    def launch(role, floating=False):
        title = prefix + "-" + role
        command = shlex.join(["foot", "--app-id=" + classes[role], "--title=" + title,
                              "--window-size-pixels=440x720"])
        options = "workspace='" + str(workspace) + " silent',no_focus=true"
        if floating:
            options += ",float=true,center=true"
        evaluate("hl.exec_cmd(" + json.dumps(command) + ", {" + options + "})")
        windows = wait(lambda ws: any(w.get("initialTitle") == title for w in ws))
        return next(w for w in windows if w.get("initialTitle") == title)

    try:
        helpers.pause_autosave(autosave)
        parent = launch("parent", floating=True)
        assert parent["floating"], "probe parent must model the floating Centerstage layer"
        for role in ("rabby", "portal"):
            popup = launch(role)
            tags = {tag.removesuffix("*") for tag in popup["tags"]}
            assert popup["floating"], f"{role} remained tiled"
            assert "centerstage-auxiliary" in tags, f"{role} not classified as auxiliary"
            assert not tags & {"centerstage-left", "centerstage-left-primary", "centerstage-left-secondary",
                               "centerstage-center", "centerstage-right"}, f"{role} joined the layout"
            assert popup["workspace"]["id"] == workspace and not popup["pinned"]
            windows = query()
            order = [w["address"] for w in windows]
            assert order.index(popup["address"]) > order.index(parent["address"]), "popup not above the floating parent in compositor order"
            parent_after = next(w for w in windows if w["address"] == parent["address"])
            assert all(parent_after[key] == parent[key] for key in ("at", "size", "floating"))
            assert popup["size"][0] < 1000 and popup["size"][1] < 1200, "popup was enlarged to tiled geometry"
            monitor = next(m for m in json.loads(run("hyprctl", "-j", "monitors")) if m["id"] == popup["monitor"])
            left, top, right, bottom = monitor["reserved"]
            expected = [math.floor(monitor["x"] + left + (monitor["width"] / monitor["scale"] - left - right - popup["size"][0]) / 2 + 0.5),
                        math.floor(monitor["y"] + top + (monitor["height"] / monitor["scale"] - top - bottom - popup["size"][1]) / 2 + 0.5)]
            assert popup["at"] == expected, f"{role} not centered in the usable monitor area: {popup['at']} != {expected}"
            results[role] = {key: popup[key] for key in ("floating", "at", "size", "tags")}
            results[role].update(centered=True, above_floating_parent=True)
            os.kill(popup["pid"], signal.SIGTERM)
            wait(lambda ws: not any(w["address"] == popup["address"] for w in ws))
        assert not run("hyprctl", "configerrors"), "compositor reports configuration errors"
    finally:
        errors = []
        try:
            for window in query():
                if owned(window):
                    try:
                        os.kill(window["pid"], signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            wait(lambda ws: not any(owned(w) for w in ws))
        except Exception as error:
            errors.append(f"probe cleanup: {error}")
        errors.extend(helpers.restore_autosave(autosave))
        try:
            after = {w["address"]: w for w in query()}
            for window in before:
                current = after.get(window["address"])
                assert current is not None, "a working window closed during verification"
                for key in ("at", "size", "tags", "workspace", "floating", "fullscreen", "pinned"):
                    assert current[key] == window[key], f"working window {window['address']} changed: {key}"
            assert json.loads(run("hyprctl", "-j", "activewindow")).get("address") == active_before, "focus changed during verification"
            assert helpers.active("centerstage-handler.service"), "handler is no longer active"
        except Exception as error:
            errors.append(str(error))
        assert not errors, errors
    results.update(working_windows_unchanged=True, focus_unchanged=True, probes_cleaned=True)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
