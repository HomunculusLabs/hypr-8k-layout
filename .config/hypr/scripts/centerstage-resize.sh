#!/bin/bash
# centerstage-resize.sh - Cycle center window through size presets
#
# Sizes: 2560 (QHD) → 3000 (Medium) → 3840 (4K) → 2560
#
# Usage: centerstage-resize.sh

# Size presets: width, center_x, sidebar_width, sidebar_right_x
# Calculated for 7680px width with 80px edge gaps and 100px inner gaps
# Formula: center_x = (7680 - width) / 2
#          sidebars = (7320 - center) / 2
#          right_x = center_x + center + 100
declare -A SIZES
SIZES[1920]="1920 2880 2700 4900"   # 1080p - ultra focused
SIZES[2200]="2200 2740 2560 5040"   # Small
SIZES[2560]="2560 2560 2380 5220"   # QHD - default
SIZES[3000]="3000 2340 2160 5440"   # Medium
SIZES[3840]="3840 1920 1740 5860"   # 4K - large

SIZE_ORDER=(1920 2200 2560 3000 3840)

ZONE_Y=100
TOTAL_HEIGHT=1960
GAP_IN=100
STATE_FILE="/tmp/centerstage-sidebar-offset"

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

# Get current center dimensions (preserve height and y position)
current_width=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .size[0]")
current_height=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .size[1]")
current_y=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .at[1]")

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

# Save the new center width to state file
echo "$next_size" > /tmp/centerstage-center-width

# Parse new dimensions (base values for symmetric sidebars)
read -r new_width new_center_x base_sidebar_width base_right_x <<< "${SIZES[$next_size]}"

# Read sidebar offset to preserve asymmetric balance
sidebar_offset=0
[[ -f "$STATE_FILE" ]] && sidebar_offset=$(cat "$STATE_FILE")

# Apply offset to sidebar widths
left_sidebar_width=$(( base_sidebar_width + sidebar_offset ))
right_sidebar_width=$(( base_sidebar_width - sidebar_offset ))

# Recalculate right_x based on center position
new_right_x=$(( new_center_x + new_width + GAP_IN ))

# Update center window (preserve current height and y position)
hyprctl dispatch focuswindow "address:$center_addr"
hyprctl dispatch resizeactive exact $new_width $current_height
hyprctl dispatch moveactive exact $new_center_x $current_y

# Update left sidebar windows
left_windows=$(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-left\")) != null) | .address")

count=0
while IFS= read -r addr; do
    [[ -n "$addr" ]] && ((count++))
done <<< "$left_windows"

if [[ "$count" -gt 0 ]]; then
    if [[ "$count" -eq 1 ]]; then
        win_height=$TOTAL_HEIGHT
    else
        total_gap=$(( (count - 1) * 100 ))
        win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi

    i=0
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        y=$(( ZONE_Y + i * (win_height + 100) ))
        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $left_sidebar_width $win_height ; dispatch moveactive exact 80 $y"
        ((i++))
    done <<< "$left_windows"
fi

# Update right sidebar windows
right_windows=$(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-right\")) != null) | .address")

count=0
while IFS= read -r addr; do
    [[ -n "$addr" ]] && ((count++))
done <<< "$right_windows"

if [[ "$count" -gt 0 ]]; then
    if [[ "$count" -eq 1 ]]; then
        win_height=$TOTAL_HEIGHT
    else
        total_gap=$(( (count - 1) * 100 ))
        win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi

    i=0
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        y=$(( ZONE_Y + i * (win_height + 100) ))
        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $right_sidebar_width $win_height ; dispatch moveactive exact $new_right_x $y"
        ((i++))
    done <<< "$right_windows"
fi

notify-send "Center Stage" "Center: ${next_size}px"
