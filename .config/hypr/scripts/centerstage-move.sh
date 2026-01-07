#!/bin/bash
# centerstage-move.sh - Move window to center-stage zone
#
# Usage: centerstage-move.sh <zone> [address]
#   zone: left | center | right | left-primary | left-secondary | right-primary | right-secondary
#   address: optional window address (uses active window if not provided)

set -euo pipefail

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

ZONE="${1:-center}"
TARGET_ADDR="${2:-}"

# Get window info - use provided address or active window
if [[ -n "$TARGET_ADDR" ]]; then
    window_info=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$TARGET_ADDR\")")
    addr="$TARGET_ADDR"
    workspace=$(echo "$window_info" | jq -r ".workspace.id")
    class=$(echo "$window_info" | jq -r ".class")
else
    active=$(hyprctl activewindow -j)
    addr=$(echo "$active" | jq -r ".address")
    workspace=$(echo "$active" | jq -r ".workspace.id")
    class=$(echo "$active" | jq -r ".class")
fi

if [[ -z "$addr" || "$addr" == "null" ]]; then
    notify-send "Center Stage" "No window found"
    exit 1
fi

# Only apply to workspaces 1-3
if [[ "$workspace" -gt 3 ]]; then
    notify-send "Center Stage" "Only available on workspaces 1-3"
    exit 1
fi

# Remove any existing zone tags (including sub-column tags)
hyprctl dispatch tagwindow -- "-centerstage-left" "address:$addr" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-center" "address:$addr" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-right" "address:$addr" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-left-primary" "address:$addr" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-left-secondary" "address:$addr" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-right-primary" "address:$addr" 2>/dev/null || true
hyprctl dispatch tagwindow -- "-centerstage-right-secondary" "address:$addr" 2>/dev/null || true

# Remove position tags from right sidebar
for pos in {1..9}; do
    hyprctl dispatch tagwindow -- "-centerstage-right-$pos" "address:$addr" 2>/dev/null || true
done

# Float the window
hyprctl dispatch setfloating "address:$addr"

# Determine retile zone
retile_zone="$ZONE"

case "$ZONE" in
    left)
        # Check layout mode for smart routing
        layout_mode=$(get_left_layout_mode)
        if [[ "$layout_mode" != "single" ]]; then
            # Route based on window class
            if [[ "$class" == "obsidian" ]]; then
                hyprctl dispatch tagwindow "+centerstage-left-primary" "address:$addr"
            else
                hyprctl dispatch tagwindow "+centerstage-left-secondary" "address:$addr"
            fi
        else
            hyprctl dispatch tagwindow "+centerstage-left" "address:$addr"
        fi
        retile_zone="left"
        ;;
    left-primary)
        hyprctl dispatch tagwindow "+centerstage-left-primary" "address:$addr"
        retile_zone="left"
        ;;
    left-secondary)
        hyprctl dispatch tagwindow "+centerstage-left-secondary" "address:$addr"
        retile_zone="left"
        ;;
    center)
        hyprctl dispatch tagwindow "+centerstage-center" "address:$addr"
        ;;
    right)
        hyprctl dispatch tagwindow "+centerstage-right" "address:$addr"
        retile_zone="right"
        ;;
    right-primary)
        hyprctl dispatch tagwindow "+centerstage-right-primary" "address:$addr"
        retile_zone="right"
        ;;
    right-secondary)
        hyprctl dispatch tagwindow "+centerstage-right-secondary" "address:$addr"
        retile_zone="right"
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
