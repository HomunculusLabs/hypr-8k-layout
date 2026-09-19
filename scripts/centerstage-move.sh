#!/bin/bash
# Move a window and reflow both zones without sleeps or intermediate focus changes.
# Usage: centerstage-move.sh <left|left-primary|left-secondary|center|right> [address]
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
source "$HOME/.config/hypr/scripts/centerstage-plan.sh"

ZONE="${1:-center}"
ADDR="${2:-}"
[[ "$ZONE" =~ ^(left|left-primary|left-secondary|center|right)$ ]] || exit 1
if [[ "$ZONE" =~ ^left-(primary|secondary)$ ]] && [[ "$(get_left_layout_mode)" == single ]]; then
    printf 'Centerstage: target %s is unavailable in single left layout (including PBP mode)\n' "$ZONE" >&2
    exit 1
fi
centerstage_begin || exit 1
if [[ -z "$ADDR" ]]; then
    ADDR=$(hyprctl activewindow -j | jq -r '.address // empty') || exit 1
fi
[[ "$ADDR" =~ ^0x[[:xdigit:]]+$ ]] || exit 1
if [[ ! "${CS_WORKSPACE[$ADDR]:-}" =~ ^[1-3]$ ]]; then
    notify-send "Center Stage" "Choose a regular window on workspaces 1-3"
    exit 1
fi
centerstage_change_zone "$ADDR" "$ZONE" || exit 1
centerstage_commit
