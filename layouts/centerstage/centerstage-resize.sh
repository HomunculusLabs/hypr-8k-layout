#!/bin/bash
# centerstage-resize.sh - Cycle center window through size presets
#
# Sizes: 1920 → 2200 → 2560 → 3000 → 3840 → (loop)
#
# Usage: centerstage-resize.sh

SCRIPT_DIR="$HOME/.config/hypr/layouts/centerstage"
STATE_DIR="$HOME/.config/hypr/state"
WIDTH_FILE="$STATE_DIR/centerstage-center-width"

SIZE_ORDER=(1920 2200 2560 3000 3840)

# Get current workspace
workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Read current width from state
current_width=2560
[[ -f "$WIDTH_FILE" ]] && current_width=$(cat "$WIDTH_FILE")

# Find next size in cycle
next_size=""
for i in "${!SIZE_ORDER[@]}"; do
    if [[ "${SIZE_ORDER[$i]}" -eq "$current_width" ]]; then
        next_idx=$(( (i + 1) % ${#SIZE_ORDER[@]} ))
        next_size="${SIZE_ORDER[$next_idx]}"
        break
    fi
done

# Default to first size if current not found
[[ -z "$next_size" ]] && next_size="${SIZE_ORDER[0]}"

# Save new width to state
echo "$next_size" > "$WIDTH_FILE"

# Retile all zones with new dimensions
"$SCRIPT_DIR/centerstage-retile.sh" center "$workspace"
"$SCRIPT_DIR/centerstage-retile.sh" left "$workspace"
"$SCRIPT_DIR/centerstage-retile.sh" right "$workspace"

notify-send "Center Stage" "Center: ${next_size}px"
