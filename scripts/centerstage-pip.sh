#!/bin/bash
# PIP (Picture-in-Picture) window positioning for Samsung Odyssey G9
# Resizes active window to avoid PIP overlay area
#
# Usage: centerstage-pip.sh [corner] [size]
#   corner: tr (top-right), tl (top-left), br (bottom-right), bl (bottom-left)
#   size:   small (960x540), medium (1280x720), large (1920x1080)
#
# Examples:
#   centerstage-pip.sh tr small   - Avoid small PIP in top-right
#   centerstage-pip.sh br medium  - Avoid medium PIP in bottom-right

CORNER="${1:-tr}"
SIZE="${2:-small}"

# Screen dimensions (Samsung Odyssey G9 - 7680x2160 ultrawide)
SCREEN_WIDTH=7680
SCREEN_HEIGHT=2160

# Gaps
GAP_TOP=100
GAP_BOTTOM=100
GAP_LEFT=80
GAP_RIGHT=80
GAP_PIP=50  # Gap between window and PIP area

# PIP sizes (common monitor PIP dimensions)
case "$SIZE" in
    small)
        PIP_W=960
        PIP_H=540
        ;;
    medium)
        PIP_W=1280
        PIP_H=720
        ;;
    large)
        PIP_W=1920
        PIP_H=1080
        ;;
    *)
        echo "Unknown size: $SIZE (use: small, medium, large)"
        exit 1
        ;;
esac

# Get active window address
ACTIVE=$(hyprctl activewindow -j | jq -r '.address')

if [[ -z "$ACTIVE" || "$ACTIVE" == "null" ]]; then
    notify-send "PIP Mode" "No active window" -t 2000
    exit 1
fi

# Calculate window position and size to avoid PIP area
case "$CORNER" in
    tr)  # Top-right PIP
        X=$GAP_LEFT
        Y=$GAP_TOP
        W=$((SCREEN_WIDTH - GAP_LEFT - GAP_RIGHT - PIP_W - GAP_PIP))
        H=$((SCREEN_HEIGHT - GAP_TOP - GAP_BOTTOM))
        LABEL="Avoid TR PIP"
        ;;
    tl)  # Top-left PIP
        X=$((PIP_W + GAP_PIP))
        Y=$GAP_TOP
        W=$((SCREEN_WIDTH - X - GAP_RIGHT))
        H=$((SCREEN_HEIGHT - GAP_TOP - GAP_BOTTOM))
        LABEL="Avoid TL PIP"
        ;;
    br)  # Bottom-right PIP
        X=$GAP_LEFT
        Y=$GAP_TOP
        W=$((SCREEN_WIDTH - GAP_LEFT - GAP_RIGHT - PIP_W - GAP_PIP))
        H=$((SCREEN_HEIGHT - GAP_TOP - GAP_BOTTOM))
        LABEL="Avoid BR PIP"
        ;;
    bl)  # Bottom-left PIP
        X=$((PIP_W + GAP_PIP))
        Y=$GAP_TOP
        W=$((SCREEN_WIDTH - X - GAP_RIGHT))
        H=$((SCREEN_HEIGHT - GAP_TOP - GAP_BOTTOM))
        LABEL="Avoid BL PIP"
        ;;
    *)
        echo "Unknown corner: $CORNER (use: tr, tl, br, bl)"
        exit 1
        ;;
esac

# Float and resize the window
hyprctl dispatch setfloating address:$ACTIVE
hyprctl dispatch moveactive exact $X $Y
hyprctl dispatch resizeactive exact $W $H

notify-send "PIP Mode" "$LABEL ($SIZE): ${W}x${H}" -t 1500
