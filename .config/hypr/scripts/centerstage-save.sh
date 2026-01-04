#!/bin/bash
# centerstage-save.sh - Save current workspace layouts for restore on reboot
#
# Saves window class and zone for workspaces 1-3
# Usage: centerstage-save.sh

STATE_DIR="$HOME/.config/hypr/state"
LAYOUT_FILE="$STATE_DIR/centerstage-layout.json"

mkdir -p "$STATE_DIR"

# Build JSON array of windows in center-stage zones
layout=$(hyprctl clients -j | jq '[
    .[] |
    select(.workspace.id >= 1 and .workspace.id <= 3) |
    select(.tags != null) |
    select((.tags | index("centerstage-left")) or (.tags | index("centerstage-center")) or (.tags | index("centerstage-right"))) |
    {
        workspace: .workspace.id,
        class: .class,
        zone: (
            if (.tags | index("centerstage-left")) then "left"
            elif (.tags | index("centerstage-center")) then "center"
            elif (.tags | index("centerstage-right")) then "right"
            else null
            end
        )
    }
] | group_by(.workspace) | map({
    workspace: .[0].workspace,
    windows: map({class: .class, zone: .zone})
})')

echo "$layout" > "$LAYOUT_FILE"

count=$(echo "$layout" | jq '[.[].windows[]] | length')
notify-send "Center Stage" "Saved $count windows across workspaces 1-3"
