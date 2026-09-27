#!/bin/bash
# triad-retile.sh - Re-tile windows in a zone for workspace 2
#
# Usage: triad-retile.sh <zone> <workspace_id>

set -euo pipefail

source "$HOME/.config/hypr/layouts/triad/triad-lib.sh"

ZONE="${1:-center}"
WORKSPACE="${2:-2}"

read -r ZONE_X ZONE_WIDTH TAG <<< "$(get_zone_dimensions "$ZONE")"

mapfile -t windows < <(get_zone_windows "$TAG" "$WORKSPACE")
count=${#windows[@]}
[[ "$count" -eq 0 ]] && exit 0

read -r cols rows <<< "$(calculate_grid "$count")"

if [[ $cols -eq 1 ]]; then
    cell_width=$ZONE_WIDTH
    if [[ $count -eq 1 ]]; then
        cell_height=$TOTAL_HEIGHT
    else
        total_gap=$(( (count - 1) * GAP_IN ))
        cell_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi
else
    cell_width=$(( (ZONE_WIDTH - (cols - 1) * GAP_IN) / cols ))
    cell_height=$(( (TOTAL_HEIGHT - (rows - 1) * GAP_IN) / rows ))
fi

i=0
for addr in "${windows[@]}"; do
    [[ -z "$addr" ]] && continue

    if [[ $cols -eq 1 ]]; then
        x=$ZONE_X
        y=$(( ZONE_Y + i * (cell_height + GAP_IN) ))
    else
        col=$(( i % cols ))
        row=$(( i / cols ))
        x=$(( ZONE_X + col * (cell_width + GAP_IN) ))
        y=$(( ZONE_Y + row * (cell_height + GAP_IN) ))
    fi

    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" resizewindowpixel "exact $cell_width $cell_height,address:$addr"
    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" movewindowpixel "exact $x $y,address:$addr"
    ((++i))
done
