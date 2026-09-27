#!/bin/bash
# triad-handler.sh - Auto-position windows on workspace 2

set -euo pipefail

source "$HOME/.config/hypr/layouts/triad/triad-lib.sh"

STATE_DIR="$HOME/.config/hypr/state"
LOCKFILE="$STATE_DIR/triad-handler.lock"
exec 200>"$LOCKFILE"
flock -n 200 || { echo "Triad handler already running"; exit 1; }

retile_all() {
    "$HOME/.config/hypr/layouts/triad/triad-retile.sh" left 2
    "$HOME/.config/hypr/layouts/triad/triad-retile.sh" center 2
    "$HOME/.config/hypr/layouts/triad/triad-retile.sh" right 2
}

handle_window_open() {
    local addr="$1"
    sleep 0.1

    local window_info
    window_info=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$addr\")")
    [[ -z "$window_info" ]] && return

    local workspace
    workspace=$(echo "$window_info" | jq -r ".workspace.id")
    [[ "$workspace" -ne 2 ]] && return

    local has_tag
    has_tag=$(echo "$window_info" | jq -r '.tags // [] | map(select(startswith("triad-"))) | length')
    [[ "$has_tag" -gt 0 ]] && return

    local center_count
    center_count=$(count_zone_windows "triad-center" "$workspace")
    local left_count
    left_count=$(count_zone_windows "triad-left" "$workspace")
    local right_count
    right_count=$(count_zone_windows "triad-right" "$workspace")

    if [[ "$center_count" -eq 0 ]]; then
        "$HOME/.config/hypr/layouts/triad/triad-move.sh" center "$addr"
    elif [[ "$right_count" -le "$left_count" ]]; then
        "$HOME/.config/hypr/layouts/triad/triad-move.sh" right "$addr"
    else
        "$HOME/.config/hypr/layouts/triad/triad-move.sh" left "$addr"
    fi
}

handle_window_close() {
    sleep 0.1
    retile_all
}

SOCKET=$(find "/run/user/$(id -u)/hypr" -name ".socket2.sock" 2>/dev/null | head -1)
if [[ -z "$SOCKET" ]]; then
    echo "Could not find Hyprland socket"
    exit 1
fi

while true; do
    socat -U - "UNIX-CONNECT:$SOCKET" 2>/dev/null | while read -r line; do
        if [[ "$line" == openwindow\>\>* ]]; then
            addr="0x${line#openwindow>>}"
            addr="${addr%%,*}"
            handle_window_open "$addr"
        elif [[ "$line" == closewindow\>\>* ]]; then
            handle_window_close
        fi
    done
    sleep 1
done
