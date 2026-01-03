#!/bin/bash
# centerstage-retile.sh - Re-tile windows in a zone vertically
#
# Usage: centerstage-retile.sh <zone> <workspace_id>

ZONE="${1:-center}"
WORKSPACE="${2:-1}"

# Zone definitions
GAP_IN=10
ZONE_Y=30
TOTAL_HEIGHT=2100

case "$ZONE" in
    left)
        ZONE_X=25
        ZONE_WIDTH=1885
        TAG="centerstage-left"
        ;;
    center)
        ZONE_X=1930
        ZONE_WIDTH=3820
        TAG="centerstage-center"
        ;;
    right)
        ZONE_X=5770
        ZONE_WIDTH=1885
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
