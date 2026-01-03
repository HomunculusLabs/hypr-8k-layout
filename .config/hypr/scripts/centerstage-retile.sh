#!/bin/bash
# centerstage-retile.sh - Re-tile windows in a zone vertically
#
# Usage: centerstage-retile.sh <zone> <workspace_id>

ZONE="${1:-center}"
WORKSPACE="${2:-1}"

# Zone definitions for ergonomic spacing
# gaps_out = 100 80 100 80 (top right bottom left)
# Default center: 2560px (QHD) - comfortable reading width
GAP_IN=100  # Large gaps between stacked sidebar windows
ZONE_Y=100
TOTAL_HEIGHT=1960  # 2160 - 100 top - 100 bottom

case "$ZONE" in
    left)
        ZONE_X=80
        ZONE_WIDTH=2380
        TAG="centerstage-left"
        ;;
    center)
        ZONE_X=2560
        ZONE_WIDTH=2560  # QHD width - comfortable default
        TAG="centerstage-center"
        ;;
    right)
        ZONE_X=5220
        ZONE_WIDTH=2380
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
