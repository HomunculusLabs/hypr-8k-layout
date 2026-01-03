#!/bin/bash
# centerstage-height.sh - Cycle center window through height presets
#
# Heights: 1960 (Full) → 1600 (Comfortable) → 1200 (Compact) → 1960
# Windows are vertically centered on screen
#
# Usage: centerstage-height.sh

# Height presets: height, y_position (vertically centered)
# Formula: y = (2160 - height) / 2
declare -A HEIGHTS
HEIGHTS[1080]="1080 540"    # 1080p - ultra focused
HEIGHTS[1200]="1200 480"    # Compact
HEIGHTS[1400]="1400 380"    # Medium
HEIGHTS[1600]="1600 280"    # Comfortable
HEIGHTS[1800]="1800 180"    # Slightly reduced
HEIGHTS[1960]="1960 100"    # Full height (with gaps)

HEIGHT_ORDER=(1080 1200 1400 1600 1800 1960)

# Get current workspace
workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Find center window in this workspace
center_addr=$(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-center\")) != null) | .address" | head -1)

if [[ -z "$center_addr" ]]; then
    notify-send "Center Stage" "No center window found"
    exit 1
fi

# Get current center dimensions
current_height=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .size[1]")
current_width=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .size[0]")
current_x=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .at[0]")

# Find next height in cycle
next_height=""
for i in "${!HEIGHT_ORDER[@]}"; do
    if [[ "${HEIGHT_ORDER[$i]}" -eq "$current_height" ]]; then
        next_idx=$(( (i + 1) % ${#HEIGHT_ORDER[@]} ))
        next_height="${HEIGHT_ORDER[$next_idx]}"
        break
    fi
done

# Default to first height if current not found
[[ -z "$next_height" ]] && next_height="${HEIGHT_ORDER[0]}"

# Parse new dimensions
read -r new_height new_y <<< "${HEIGHTS[$next_height]}"

# Update center window (preserve current width and x position)
hyprctl dispatch focuswindow "address:$center_addr"
hyprctl dispatch resizeactive exact $current_width $new_height
hyprctl dispatch moveactive exact $current_x $new_y

notify-send "Center Stage" "Height: ${new_height}px"
