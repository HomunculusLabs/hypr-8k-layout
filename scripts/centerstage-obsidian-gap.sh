#!/bin/bash
# centerstage-obsidian-gap.sh - Adjust Obsidian gap from center in grid-obsidian mode
#
# Usage: centerstage-obsidian-gap.sh [increase|decrease]
#   increase - Expand gap (compact Obsidian)
#   decrease - Shrink gap (expand Obsidian toward center)

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Check layout mode - only works in grid-obsidian mode
layout_mode=$(get_left_layout_mode)
[[ "$layout_mode" != "grid-obsidian" ]] && { notify-send "Center Stage" "Only available in grid-obsidian mode"; exit 1; }

# Read current gap
read_state
current_gap=$obsidian_extra_gap

# Define presets (extra gap beyond 100px GAP_IN)
# Total gap = 100 + extra: 640, 400, 200, 100
presets=(0 100 300 540)

# Determine direction
direction="${1:-decrease}"

case "$direction" in
    decrease)
        # Find next lower preset (expand Obsidian)
        new_gap=$current_gap
        for ((i=${#presets[@]}-1; i>=0; i--)); do
            if [[ ${presets[$i]} -lt $current_gap ]]; then
                new_gap=${presets[$i]}
                break
            fi
        done
        # Already at min
        [[ $new_gap -eq $current_gap ]] && { notify-send "Center Stage" "Obsidian gap at minimum (100px)"; exit 0; }
        ;;
    increase)
        # Find next higher preset (compact Obsidian)
        new_gap=$current_gap
        for preset in "${presets[@]}"; do
            if [[ $preset -gt $current_gap ]]; then
                new_gap=$preset
                break
            fi
        done
        # Already at max
        [[ $new_gap -eq $current_gap ]] && { notify-send "Center Stage" "Obsidian gap at maximum (640px)"; exit 0; }
        ;;
    *)
        echo "Usage: $0 [increase|decrease]"
        exit 1
        ;;
esac

# Save new gap
echo "$new_gap" > "$OBSIDIAN_GAP_FILE"

# Retile left sidebar
~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"

# Calculate total gap for display
total_gap=$((GAP_IN + new_gap))
notify-send "Center Stage" "Obsidian gap: ${total_gap}px"
