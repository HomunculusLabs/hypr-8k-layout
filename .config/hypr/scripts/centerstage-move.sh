#!/bin/bash
# centerstage-move.sh - Move active window to center-stage zone
#
# Usage: centerstage-move.sh <zone>
#   zone: left | center | right

set -euo pipefail

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

# Remove any existing zone tags
hyprctl dispatch tagwindow -- "-centerstage-left" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-center" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-right" 2>/dev/null || true

# Float and tag the window
hyprctl dispatch setfloating active

case "$ZONE" in
    left)   hyprctl dispatch tagwindow "+centerstage-left" ;;
    center) hyprctl dispatch tagwindow "+centerstage-center" ;;
    right)  hyprctl dispatch tagwindow "+centerstage-right" ;;
    *)      echo "Unknown zone: $ZONE" >&2; exit 1 ;;
esac

# Small delay to ensure tag is applied
sleep 0.1

# Retile the zone we just added to
~/.config/hypr/scripts/centerstage-retile.sh "$ZONE" "$workspace"
