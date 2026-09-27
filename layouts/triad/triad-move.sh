#!/bin/bash
# triad-move.sh - Move a window into a triad zone on workspace 2
#
# Usage: triad-move.sh <zone> [address]
#   zone: left | center | right

set -euo pipefail

source "$HOME/.config/hypr/layouts/triad/triad-lib.sh"

ZONE="${1:-center}"
TARGET_ADDR="${2:-}"

if [[ -n "$TARGET_ADDR" ]]; then
    window_info=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$TARGET_ADDR\")")
    addr="$TARGET_ADDR"
    workspace=$(echo "$window_info" | jq -r ".workspace.id")
else
    active=$(hyprctl activewindow -j)
    addr=$(echo "$active" | jq -r ".address")
    workspace=$(echo "$active" | jq -r ".workspace.id")
fi

if [[ -z "$addr" || "$addr" == "null" ]]; then
    notify-send "Triad" "No window found"
    exit 1
fi

if [[ "$workspace" -ne 2 ]]; then
    notify-send "Triad" "Only available on workspace 2"
    exit 1
fi

# Remove existing triad tags
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" tagwindow -- "-triad-left" "address:$addr" 2>/dev/null || true
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" tagwindow -- "-triad-center" "address:$addr" 2>/dev/null || true
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" tagwindow -- "-triad-right" "address:$addr" 2>/dev/null || true

# Float the window for pixel-precise placement
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" setfloating "address:$addr"

case "$ZONE" in
    left)
        "$HOME/.config/hypr/scripts/hypr-dispatch.sh" tagwindow "+triad-left" "address:$addr"
        ;;
    center)
        "$HOME/.config/hypr/scripts/hypr-dispatch.sh" tagwindow "+triad-center" "address:$addr"
        ;;
    right)
        "$HOME/.config/hypr/scripts/hypr-dispatch.sh" tagwindow "+triad-right" "address:$addr"
        ;;
    *)
        echo "Unknown zone: $ZONE" >&2
        exit 1
        ;;
esac

sleep 0.05

"$HOME/.config/hypr/layouts/triad/triad-retile.sh" left "$workspace"
"$HOME/.config/hypr/layouts/triad/triad-retile.sh" center "$workspace"
"$HOME/.config/hypr/layouts/triad/triad-retile.sh" right "$workspace"
