#!/bin/bash
# centerstage-focus.sh - Focus window by position in right sidebar or center
#
# Usage: centerstage-focus.sh <position>
#   position: 0 = center, 1-9 = right sidebar grid position

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

POSITION="${1:-0}"

# Get current workspace
workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 || "$workspace" -lt 1 ]] && exit 0

if [[ "$POSITION" == "0" ]]; then
    tag="centerstage-center"
else
    tag="centerstage-right-$POSITION"
fi

addr=$(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null) | .address" | head -1)

# Focus window if found (silent no-op if empty)
[[ -n "$addr" && "$addr" != "null" ]] && hyprctl dispatch focuswindow "address:$addr"
