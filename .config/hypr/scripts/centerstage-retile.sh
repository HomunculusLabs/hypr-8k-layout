#!/bin/bash
# centerstage-retile.sh - Re-tile windows in a zone (vertical stack or grid)
#
# Usage: centerstage-retile.sh <zone> <workspace_id>

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

ZONE="${1:-center}"
WORKSPACE="${2:-1}"

# Get zone parameters
read -r ZONE_X ZONE_WIDTH TAG <<< "$(get_zone_dimensions "$ZONE")"

# Get all windows in this zone and workspace
mapfile -t windows < <(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $WORKSPACE and .tags != null and (.tags | index(\"$TAG\")) != null) | .address")

count=${#windows[@]}

[[ "$count" -eq 0 ]] && exit 0

# Calculate grid dimensions
read -r cols rows <<< "$(calculate_grid $count)"

# Calculate cell dimensions
if [[ $cols -eq 1 ]]; then
    # Vertical stack (original behavior)
    cell_width=$ZONE_WIDTH
    if [[ $count -eq 1 ]]; then
        cell_height=$TOTAL_HEIGHT
    else
        total_gap=$(( (count - 1) * GAP_IN ))
        cell_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi
else
    # Grid layout
    cell_width=$(( (ZONE_WIDTH - (cols - 1) * GAP_IN) / cols ))
    cell_height=$(( (TOTAL_HEIGHT - (rows - 1) * GAP_IN) / rows ))
fi

# Position each window
i=0
for addr in "${windows[@]}"; do
    [[ -z "$addr" ]] && continue

    if [[ $cols -eq 1 ]]; then
        # Vertical stack
        x=$ZONE_X
        y=$(( ZONE_Y + i * (cell_height + GAP_IN) ))
    else
        # Grid positioning
        col=$(( i % cols ))
        row=$(( i / cols ))
        x=$(( ZONE_X + col * (cell_width + GAP_IN) ))
        y=$(( ZONE_Y + row * (cell_height + GAP_IN) ))
    fi

    hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $cell_width $cell_height ; dispatch moveactive exact $x $y"

    ((i++))
done
