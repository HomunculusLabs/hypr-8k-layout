#!/bin/bash
# centerstage-add.sh - Add floating window to centerstage (tags + retiles)
#
# Usage: centerstage-add.sh [zone]
#   zone: left | center | right (default: center)

set -euo pipefail

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

ZONE="${1:-center}"

# Get active window info
active=$(hyprctl activewindow -j)
addr=$(echo "$active" | jq -r ".address")
workspace=$(echo "$active" | jq -r ".workspace.id")

if [[ -z "$addr" || "$addr" == "null" ]]; then
    notify-send "Center Stage" "No active window"
    exit 1
fi

# Only apply to workspaces 1-3
if [[ "$workspace" -gt 3 ]]; then
    notify-send "Center Stage" "Only available on workspaces 1-3"
    exit 1
fi

# Float the window if not already
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" setfloating address:$addr

# Tag the window
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" tagwindow "+centerstage-$ZONE" "address:$addr"

# Small delay then retile
sleep 0.05
~/.config/hypr/scripts/centerstage-retile.sh "$ZONE" "$workspace"
