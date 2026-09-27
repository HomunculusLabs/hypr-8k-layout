#!/bin/bash
# centerstage-save.sh - Save current workspace layouts for restore on reboot
#
# Saves window class and zone for workspaces 1-3
# Usage: centerstage-save.sh [--quiet]

STATE_DIR="$HOME/.config/hypr/state"
LAYOUT_FILE="$STATE_DIR/centerstage-layout.json"
QUIET="${1:-}"

mkdir -p "$STATE_DIR"

# Build JSON array of windows in center-stage zones (including sub-zones)
layout=$(hyprctl clients -j | jq '[
    .[] |
    select(.workspace.id >= 1 and .workspace.id <= 3) |
    select(.tags != null) |
    select((.tags | any(startswith("centerstage-")))) |
    {
        workspace: .workspace.id,
        class: .class,
        zone: (
            if (.tags | index("centerstage-left-primary")) then "left-primary"
            elif (.tags | index("centerstage-left-secondary")) then "left-secondary"
            elif (.tags | index("centerstage-left")) then "left"
            elif (.tags | index("centerstage-center")) then "center"
            elif (.tags | index("centerstage-right")) then "right"
            else null
            end
        )
    } |
    select(.zone != null)
] | group_by(.workspace) | map({
    workspace: .[0].workspace,
    windows: map({class: .class, zone: .zone})
})')

echo "$layout" > "$LAYOUT_FILE"

count=$(echo "$layout" | jq '[.[].windows[]] | length')

if [[ "$QUIET" != "--quiet" ]]; then
    notify-send "Center Stage" "Saved $count windows across workspaces 1-3"
fi
echo "Saved $count windows to $LAYOUT_FILE"
