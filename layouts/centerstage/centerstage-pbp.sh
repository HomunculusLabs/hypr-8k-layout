#!/bin/bash
# PBP (Picture-by-Picture) window positioning for Samsung Odyssey G9
# Resizes active window to fit PBP half-screen (3840x2160) or full PBP area
#
# Usage: centerstage-pbp.sh [left|right|full]
#   left  - Position window in left PBP half (3840x2160)
#   right - Position window in right PBP half (3840x2160)
#   full  - Maximize to full left PBP area (with gaps)

ZONE="${1:-left}"

# Screen dimensions (Samsung Odyssey G9 - 7680x2160 ultrawide)
SCREEN_WIDTH=7680
SCREEN_HEIGHT=2160

# PBP half dimensions (screen split in two)
PBP_WIDTH=$((SCREEN_WIDTH / 2))
PBP_HEIGHT=$SCREEN_HEIGHT

# Gaps (matching center-stage aesthetic)
GAP_TOP=100
GAP_BOTTOM=100
GAP_SIDE=80
GAP_BETWEEN=50  # Gap between window edge and PBP boundary

# Calculate usable height
USABLE_HEIGHT=$((SCREEN_HEIGHT - GAP_TOP - GAP_BOTTOM))

# Get active window address
ACTIVE=$(hyprctl activewindow -j | jq -r '.address')

if [[ -z "$ACTIVE" || "$ACTIVE" == "null" ]]; then
    notify-send "PBP Mode" "No active window" -t 2000
    exit 1
fi

case "$ZONE" in
    left)
        # Left PBP half: starts at 0, width 3840
        X=$GAP_SIDE
        Y=$GAP_TOP
        W=$((PBP_WIDTH - GAP_SIDE - GAP_BETWEEN))
        H=$USABLE_HEIGHT
        LABEL="Left PBP (4K)"
        ;;
    right)
        # Right PBP half: starts at 3840, width 3840
        X=$((PBP_WIDTH + GAP_BETWEEN))
        Y=$GAP_TOP
        W=$((PBP_WIDTH - GAP_SIDE - GAP_BETWEEN))
        H=$USABLE_HEIGHT
        LABEL="Right PBP (4K)"
        ;;
    full)
        # Full left PBP area maximized (when right half is another input)
        X=$GAP_SIDE
        Y=$GAP_TOP
        W=$((PBP_WIDTH - GAP_SIDE * 2))
        H=$USABLE_HEIGHT
        LABEL="Full PBP Left"
        ;;
    *)
        echo "Usage: $0 [left|right|full]"
        exit 1
        ;;
esac

# Float and resize the window
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" setfloating address:$ACTIVE
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" moveactive exact $X $Y
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" resizeactive exact $W $H

notify-send "PBP Mode" "$LABEL: ${W}x${H}" -t 1500
