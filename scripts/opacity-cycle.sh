#!/bin/bash
# Cycle window opacity: opaque → 0.85 → 0.7 → 0.55 → opaque

STATE_DIR="$HOME/.config/hypr/state"
STATE_FILE="$STATE_DIR/window-opacity"
mkdir -p "$STATE_DIR"

# Get active window address
ADDR=$(hyprctl activewindow -j | jq -r '.address')
[[ -z "$ADDR" || "$ADDR" == "null" ]] && exit 1

# Opacity cycle values (0 = fully opaque, bypasses global opacity)
LEVELS=(opaque 0.85 0.7 0.55)

# Get current index for this window (default to 0 = fully opaque)
declare -A WINDOW_STATES
[[ -f "$STATE_FILE" ]] && source "$STATE_FILE"

CURRENT_IDX=${WINDOW_STATES[$ADDR]:-0}
NEXT_IDX=$(( (CURRENT_IDX + 1) % ${#LEVELS[@]} ))
NEW_LEVEL=${LEVELS[$NEXT_IDX]}

if [[ "$NEW_LEVEL" == "opaque" ]]; then
    # Set fully opaque - bypasses global opacity multiplier
    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" setprop address:$ADDR opaque 1 lock
    DISPLAY_VAL="100%"
else
    # Set transparent - disable opaque override first
    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" setprop address:$ADDR opaque 0
    INACTIVE_OPACITY=$(echo "$NEW_LEVEL - 0.10" | bc)
    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" setprop address:$ADDR opacity $NEW_LEVEL override $INACTIVE_OPACITY override $NEW_LEVEL override lock
    DISPLAY_VAL="${NEW_LEVEL}"
fi

# Save state
WINDOW_STATES[$ADDR]=$NEXT_IDX
declare -p WINDOW_STATES > "$STATE_FILE"

# Notify
notify-send -t 1000 "Opacity" "$DISPLAY_VAL"
