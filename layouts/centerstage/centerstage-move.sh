#!/bin/bash
# centerstage-move.sh - Move window to center-stage zone
#
# Usage: centerstage-move.sh <zone> [address]
#   zone: left | center | right | left-primary | left-secondary | right-primary | right-secondary
#   address: optional window address (uses active window if not provided)

set -euo pipefail

source "$HOME/.config/hypr/layouts/centerstage/centerstage-lib.sh"

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

# Check if window is pinned - refuse to move it
if is_window_pinned "$addr"; then
    echo "DEBUG: Window $addr is pinned, refusing to move"
    exit 0
fi

# Only apply to workspaces 1-3
if [[ "$workspace" -gt 3 ]]; then
    notify-send "Center Stage" "Only available on workspaces 1-3"
    exit 1
fi

# Detect source zone BEFORE removing tags (for retiling)
source_zone=""
window_tags=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$addr\") | .tags // []")
if echo "$window_tags" | jq -e 'index("centerstage-left-primary") or index("centerstage-left-secondary") or index("centerstage-left")' > /dev/null 2>&1; then
    source_zone="left"
elif echo "$window_tags" | jq -e 'index("centerstage-center")' > /dev/null 2>&1; then
    source_zone="center"
elif echo "$window_tags" | jq -e 'index("centerstage-right-primary") or index("centerstage-right-secondary") or index("centerstage-right")' > /dev/null 2>&1; then
    source_zone="right"
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

# Retile source zone first (if different from target)
if [[ -n "$source_zone" && "$source_zone" != "$retile_zone" ]]; then
    $HOME/.config/hypr/layouts/centerstage/centerstage-retile.sh "$source_zone" "$workspace"
fi

# Retile the zone we just added to
$HOME/.config/hypr/layouts/centerstage/centerstage-retile.sh "$retile_zone" "$workspace"
