#!/bin/bash
# centerstage-sidebar.sh - Cycle sidebar balance (left ↔ right)
#
# Offset presets shift space between sidebars while keeping center anchored
# Offset: -400 → -200 → 0 → +200 → +400 → -400
# Positive = wider left, Negative = wider right
#
# Usage: centerstage-sidebar.sh

STATE_FILE="/tmp/centerstage-sidebar-offset"
OFFSET_ORDER=(-400 -200 0 200 400)

ZONE_Y=100
TOTAL_HEIGHT=1960
GAP_IN=100

# Get current workspace
workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Find center window to get current width
center_addr=$(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-center\")) != null) | .address" | head -1)

if [[ -z "$center_addr" ]]; then
    notify-send "Center Stage" "No center window found"
    exit 1
fi

# Get current center width
center_width=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .size[0]")
center_x=$(hyprctl clients -j | jq -r \
    ".[] | select(.address == \"$center_addr\") | .at[0]")

# Calculate base sidebar width (symmetric)
base_sidebar=$(( (7320 - center_width) / 2 ))

# Read current offset from state file
current_offset=0
[[ -f "$STATE_FILE" ]] && current_offset=$(cat "$STATE_FILE")

# Find next offset in cycle
next_offset=""
for i in "${!OFFSET_ORDER[@]}"; do
    if [[ "${OFFSET_ORDER[$i]}" -eq "$current_offset" ]]; then
        next_idx=$(( (i + 1) % ${#OFFSET_ORDER[@]} ))
        next_offset="${OFFSET_ORDER[$next_idx]}"
        break
    fi
done

# Default to first offset if current not found
[[ -z "$next_offset" ]] && next_offset="${OFFSET_ORDER[0]}"

# Save new offset
echo "$next_offset" > "$STATE_FILE"

# Calculate new sidebar widths
left_width=$(( base_sidebar + next_offset ))
right_width=$(( base_sidebar - next_offset ))

# Calculate positions
# Left sidebar always at x=80
# Right sidebar at: center_x + center_width + GAP_IN
right_x=$(( center_x + center_width + GAP_IN ))

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
        total_gap=$(( (count - 1) * GAP_IN ))
        win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi

    i=0
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        y=$(( ZONE_Y + i * (win_height + GAP_IN) ))
        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $left_width $win_height ; dispatch moveactive exact 80 $y"
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
        total_gap=$(( (count - 1) * GAP_IN ))
        win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi

    i=0
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        y=$(( ZONE_Y + i * (win_height + GAP_IN) ))
        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $right_width $win_height ; dispatch moveactive exact $right_x $y"
        ((i++))
    done <<< "$right_windows"
fi

# Notification with balance description
case $next_offset in
    -400) desc="Heavy right" ;;
    -200) desc="Slight right" ;;
    0)    desc="Balanced" ;;
    200)  desc="Slight left" ;;
    400)  desc="Heavy left" ;;
    *)    desc="Offset: $next_offset" ;;
esac

notify-send "Center Stage" "Sidebar: $desc (L:${left_width} R:${right_width})"
