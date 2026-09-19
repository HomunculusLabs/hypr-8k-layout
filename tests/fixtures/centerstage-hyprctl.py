#!/usr/bin/env python3
"""Isolated Hyprland IPC fixture; execute emitted Lua, never contact the desktop."""
import json
import os
from pathlib import Path
import subprocess
import sys

state_path = Path(os.environ["CENTERSTAGE_TEST_CLIENTS"])
clients = json.loads(state_path.read_text())
args = sys.argv[1:]
with Path(os.environ["CENTERSTAGE_TEST_LOG"]).open("a") as log:
    log.write(json.dumps(args) + "\n")


def lua(value):
    if value is None:
        return "nil"
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        return "{" + ",".join(lua(v) for v in value) + "}"
    return "{" + ",".join("[" + lua(k) + "]=" + lua(v) for k, v in value.items()) + "}"


if args[0] in ("clients", "-j"):
    print(json.dumps(clients))
elif args[0] in ("activewindow", "activeworkspace"):
    active_address = os.environ.get("CENTERSTAGE_TEST_ACTIVE")
    active_file = os.environ.get("CENTERSTAGE_TEST_ACTIVE_FILE")
    if args[0] == "activewindow" and active_file:
        active_address = Path(active_file).read_text().strip()
        marker = os.environ.get("CENTERSTAGE_TEST_ACTIVE_QUERY_MARKER")
        if marker:
            Path(marker).write_text("queried\n")
    active = next((c for c in clients if c["address"] == active_address), {})
    print(json.dumps(active if args[0] == "activewindow" else active.get("workspace", {})))
elif args[0] == "eval":
    changes = json.loads(os.environ.get("CENTERSTAGE_TEST_BEFORE_EVAL", "{}"))
    for item in clients:
        item.update(changes.get(item["address"], {}))
    script = "local clients = " + lua(clients) + "\n" + r'''
hl = {dsp={window={}}}
function hl.get_window(selector)
    for _, w in ipairs(clients) do
        if selector == "address:" .. w.address then return w end
    end
end
for _, name in ipairs({"float", "resize", "move", "tag"}) do
    hl.dsp.window[name] = function(t) t.kind = name; return t end
end
hl.dsp.focus = function(t) t.kind = "focus"; return t end
function hl.dispatch(t)
    local w = hl.get_window(t.window or "address:missing")
    if w then
        if t.kind == "resize" then assert(w.floating, "unsafe tiled resize") end
        if t.kind == "float" then w.floating = not w.floating end
    end
    print(table.concat({t.kind, t.window or "", t.x or "", t.y or "", t.tag or ""}, "\t"))
end
''' + args[1]
    result = subprocess.run(["lua", "-"], input=script, text=True, capture_output=True)
    if result.returncode:
        print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    for line in result.stdout.splitlines():
        kind, selector, x, y, tag = line.split("\t")
        client = next((c for c in clients if "address:" + c["address"] == selector), None)
        if client is None:
            continue
        if kind == "resize":
            # Hyprland keeps floating-window centers while resizing; callers
            # must restore the top-left anchor even when its target is unchanged.
            client["at"] = [client["at"][0] + (client["size"][0] - int(x)) // 2,
                            client["at"][1] + (client["size"][1] - int(y)) // 2]
            client["size"] = [int(x), int(y)]
        elif kind == "move":
            client["at"] = [int(x), int(y)]
        elif kind == "float":
            client["floating"] = not client["floating"]
        elif kind == "tag":
            if tag.startswith("-"):
                client["tags"] = [t for t in client["tags"] if t != tag[1:]]
            elif tag[1:] not in client["tags"]:
                client["tags"].append(tag[1:])
    state_path.write_text(json.dumps(clients))
    print("ok")
else:
    sys.exit("unexpected hyprctl call: " + repr(args))
