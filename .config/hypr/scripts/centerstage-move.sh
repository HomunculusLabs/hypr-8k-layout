#!/bin/bash
# centerstage-move.sh - Move active window to center-stage zone
#
# Usage: centerstage-move.sh <zone>
#   zone: left | center | right | left-primary | left-secondary

set -euo pipefail

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

ZONE="${1:-center}"

# Get active window info
active=$(hyprctl activewindow -j)
addr=$(echo "$active" | jq -r ".address")
workspace=$(echo "$active" | jq -r ".workspace.id")
class=$(echo "$active" | jq -r ".class")

if [[ -z "$addr" || "$addr" == "null" ]]; then
    notify-send "Center Stage" "No active window"
    exit 1
fi

# Only apply to workspaces 1-3
if [[ "$workspace" -gt 3 ]]; then
    notify-send "Center Stage" "Only available on workspaces 1-3"
    exit 1
fi

# Remove any existing zone tags (including sub-column tags)
hyprctl dispatch tagwindow -- "-centerstage-left" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-center" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-right" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-left-primary" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-left-secondary" 2>/dev/null || true

# Remove position tags from right sidebar
for pos in {1..9}; do
    hyprctl dispatch tagwindow -- "-centerstage-right-$pos" 2>/dev/null || true
done

# Float and tag the window
hyprctl dispatch setfloating active

# Determine retile zone
retile_zone="$ZONE"

case "$ZONE" in
    left)
        # Check layout mode for smart routing
        layout_mode=$(get_left_layout_mode)
        if [[ "$layout_mode" != "single" ]]; then
            # Route based on window class
            if [[ "$class" == "obsidian" ]]; then
                hyprctl dispatch tagwindow "+centerstage-left-primary"
            else
                hyprctl dispatch tagwindow "+centerstage-left-secondary"
            fi
        else
            hyprctl dispatch tagwindow "+centerstage-left"
        fi
        retile_zone="left"
        ;;
    left-primary)
        hyprctl dispatch tagwindow "+centerstage-left-primary"
        retile_zone="left"
        ;;
    left-secondary)
        hyprctl dispatch tagwindow "+centerstage-left-secondary"
        retile_zone="left"
        ;;
    center)
        hyprctl dispatch tagwindow "+centerstage-center"
        ;;
    right)
        hyprctl dispatch tagwindow "+centerstage-right"
        ;;
    *)
        echo "Unknown zone: $ZONE" >&2
        exit 1
        ;;
esac

# Small delay to ensure tag is applied
sleep 0.1

# Retile the zone we just added to
~/.config/hypr/scripts/centerstage-retile.sh "$retile_zone" "$workspace"
