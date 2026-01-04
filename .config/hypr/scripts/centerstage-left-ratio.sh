#!/bin/bash
# centerstage-left-ratio.sh - Adjust left sidebar primary column ratio
#
# Usage: centerstage-left-ratio.sh [increase|decrease]
#   increase - Expand primary (Obsidian) column
#   decrease - Shrink primary column (expand secondary)

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Check layout mode - ratio only applies to split modes
layout_mode=$(get_left_layout_mode)
[[ "$layout_mode" == "single" ]] && { notify-send "Center Stage" "Enable split mode first (SUPER+CTRL+SHIFT+[)"; exit 1; }

# Read current ratio
current_ratio=50
[[ -f "$LEFT_PRIMARY_RATIO_FILE" ]] && current_ratio=$(cat "$LEFT_PRIMARY_RATIO_FILE")

# Define presets
presets=(50 60 70 80)

# Determine direction
direction="${1:-increase}"

case "$direction" in
    increase)
        # Find next higher preset
        new_ratio=$current_ratio
        for preset in "${presets[@]}"; do
            if [[ $preset -gt $current_ratio ]]; then
                new_ratio=$preset
                break
            fi
        done
        # Already at max
        [[ $new_ratio -eq $current_ratio ]] && { notify-send "Center Stage" "Primary column at maximum (80%)"; exit 0; }
        ;;
    decrease)
        # Find next lower preset
        new_ratio=$current_ratio
        for ((i=${#presets[@]}-1; i>=0; i--)); do
            if [[ ${presets[$i]} -lt $current_ratio ]]; then
                new_ratio=${presets[$i]}
                break
            fi
        done
        # Already at min
        [[ $new_ratio -eq $current_ratio ]] && { notify-send "Center Stage" "Primary column at minimum (50%)"; exit 0; }
        ;;
    *)
        echo "Usage: $0 [increase|decrease]"
        exit 1
        ;;
esac

# Save new ratio
echo "$new_ratio" > "$LEFT_PRIMARY_RATIO_FILE"

# Retile left sidebar
~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"

# Calculate secondary ratio for display
secondary_ratio=$((100 - new_ratio))
notify-send "Center Stage" "Left split: ${new_ratio}/${secondary_ratio}"
