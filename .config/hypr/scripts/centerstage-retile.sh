#!/bin/bash
# centerstage-retile.sh - Re-tile windows in a zone vertically
#
# Usage: centerstage-retile.sh <zone> <workspace_id>

ZONE="${1:-center}"
WORKSPACE="${2:-1}"

GAP_IN=100
ZONE_Y=100
TOTAL_HEIGHT=1960
OFFSET_FILE="$HOME/.config/hypr/state/centerstage-sidebar-offset"
WIDTH_FILE="$HOME/.config/hypr/state/centerstage-center-width"

# Read sidebar offset for asymmetric widths
sidebar_offset=0
[[ -f "$OFFSET_FILE" ]] && sidebar_offset=$(cat "$OFFSET_FILE")

# Read stored center width preference (default 2560)
center_width=2560
[[ -f "$WIDTH_FILE" ]] && center_width=$(cat "$WIDTH_FILE")
[[ -z "$center_width" || "$center_width" == "null" ]] && center_width=2560

# Calculate dynamic zone dimensions
base_sidebar=$(( (7320 - center_width) / 2 ))
left_width=$(( base_sidebar + sidebar_offset ))
right_width=$(( base_sidebar - sidebar_offset ))
center_x=$(( (7680 - center_width) / 2 ))
right_x=$(( center_x + center_width + GAP_IN ))

case "$ZONE" in
    left)
        ZONE_X=80
        ZONE_WIDTH=$left_width
        TAG="centerstage-left"
        ;;
    center)
        ZONE_X=$center_x
        ZONE_WIDTH=$center_width
        TAG="centerstage-center"
        ;;
    right)
        ZONE_X=$right_x
        ZONE_WIDTH=$right_width
        TAG="centerstage-right"
        ;;
    *)
        exit 1
        ;;
esac

# Get all windows in this zone and workspace
mapfile -t windows < <(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $WORKSPACE and .tags != null and (.tags | index(\"$TAG\")) != null) | .address")

count=${#windows[@]}

[[ "$count" -eq 0 ]] && exit 0

# Calculate height per window
if [[ "$count" -eq 1 ]]; then
    win_height=$TOTAL_HEIGHT
else
    total_gap=$(( (count - 1) * GAP_IN ))
    win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
fi

# Position each window using batch commands
i=0
for addr in "${windows[@]}"; do
    [[ -z "$addr" ]] && continue

    y=$(( ZONE_Y + i * (win_height + GAP_IN) ))

    hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $ZONE_WIDTH $win_height ; dispatch moveactive exact $ZONE_X $y"

    ((i++))
done
