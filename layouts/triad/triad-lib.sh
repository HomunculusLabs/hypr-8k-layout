#!/bin/bash
# triad-lib.sh - Shared helpers for triad workspace layout (workspace 2)

set -euo pipefail

# Geometry tuned for 7680x2160
SCREEN_WIDTH=7680
SCREEN_HEIGHT=2160
ZONE_Y=100
TOTAL_HEIGHT=1960
GAP_IN=100
EDGE_MARGIN=80

# State file paths
STATE_DIR="$HOME/.config/hypr/state"
CENTER_WIDTH_FILE="$STATE_DIR/triad-center-width"

read_state() {
    center_width=2560
    [[ -f "$CENTER_WIDTH_FILE" ]] && center_width=$(cat "$CENTER_WIDTH_FILE")
    [[ -z "$center_width" || "$center_width" == "null" ]] && center_width=2560
}

# Usage: read -r zone_x zone_width tag <<< "$(get_zone_dimensions left)"
get_zone_dimensions() {
    local zone=$1
    read_state

    local center_x=$(( (SCREEN_WIDTH - center_width) / 2 ))
    local left_x=$EDGE_MARGIN
    local left_width=$(( center_x - GAP_IN - EDGE_MARGIN ))
    local right_x=$(( center_x + center_width + GAP_IN ))
    local right_width=$(( SCREEN_WIDTH - EDGE_MARGIN - right_x ))

    case "$zone" in
        left)   echo "$left_x $left_width triad-left" ;;
        center) echo "$center_x $center_width triad-center" ;;
        right)  echo "$right_x $right_width triad-right" ;;
    esac
}

# Usage: read -r cols rows <<< "$(calculate_grid 5)"
calculate_grid() {
    local count=$1
    local cols rows

    if [[ $count -le 3 ]]; then
        cols=1
        rows=$count
    elif [[ $count -le 4 ]]; then
        cols=2
        rows=2
    elif [[ $count -le 6 ]]; then
        cols=2
        rows=3
    else
        cols=3
        rows=3
    fi

    echo "$cols $rows"
}

count_zone_windows() {
    local tag=$1
    local workspace=$2

    hyprctl clients -j | jq -r \
        "[.[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null)] | length"
}

get_zone_windows() {
    local tag=$1
    local workspace=$2

    hyprctl clients -j | jq -r \
        ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null) | .address"
}
