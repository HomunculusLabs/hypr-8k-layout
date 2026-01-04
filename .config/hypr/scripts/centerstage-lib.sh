#!/bin/bash
# centerstage-lib.sh - Shared functions for center-stage scripts

# Constants
SCREEN_WIDTH=7680
SCREEN_HEIGHT=2160
ZONE_Y=100
TOTAL_HEIGHT=1960
GAP_IN=100
EDGE_MARGIN=80

# State file paths
STATE_DIR="$HOME/.config/hypr/state"
OFFSET_FILE="$STATE_DIR/centerstage-sidebar-offset"
WIDTH_FILE="$STATE_DIR/centerstage-center-width"
MIN_WIDTHS_FILE="$STATE_DIR/centerstage-min-widths"
SHRINK_MODE_FILE="$STATE_DIR/centerstage-shrink-mode"
LEFT_WIDTH_FILE="$STATE_DIR/centerstage-left-width"
RIGHT_WIDTH_FILE="$STATE_DIR/centerstage-right-width"

# Read current state into global variables
read_state() {
    sidebar_offset=0
    [[ -f "$OFFSET_FILE" ]] && sidebar_offset=$(cat "$OFFSET_FILE")

    center_width=2560
    [[ -f "$WIDTH_FILE" ]] && center_width=$(cat "$WIDTH_FILE")
    [[ -z "$center_width" || "$center_width" == "null" ]] && center_width=2560

    shrink_mode="fixed"
    [[ -f "$SHRINK_MODE_FILE" ]] && shrink_mode=$(cat "$SHRINK_MODE_FILE")

    # Read direct width overrides for auto mode
    left_width_override=0
    [[ -f "$LEFT_WIDTH_FILE" ]] && left_width_override=$(cat "$LEFT_WIDTH_FILE")

    right_width_override=0
    [[ -f "$RIGHT_WIDTH_FILE" ]] && right_width_override=$(cat "$RIGHT_WIDTH_FILE")
}

# Calculate zone dimensions
# Usage: read -r zone_x zone_width tag <<< "$(get_zone_dimensions left)"
get_zone_dimensions() {
    local zone=$1
    read_state

    # Center is always fixed
    local center_x=$(( (SCREEN_WIDTH - center_width) / 2 ))

    # Calculate sidebar widths
    local left_width right_width right_x

    if [[ "$shrink_mode" == "auto" && $left_width_override -gt 0 && $right_width_override -gt 0 ]]; then
        # Use direct width values in auto mode
        left_width=$left_width_override
        right_width=$right_width_override
    else
        # Traditional offset-based calculation
        local base_sidebar=$(( (7320 - center_width) / 2 ))
        left_width=$(( base_sidebar + sidebar_offset ))
        right_width=$(( base_sidebar - sidebar_offset ))
    fi

    # Sidebars positioned at screen edges
    local left_x=$EDGE_MARGIN
    local right_x=$(( SCREEN_WIDTH - EDGE_MARGIN - right_width ))

    case "$zone" in
        left)   echo "$left_x $left_width centerstage-left" ;;
        center) echo "$center_x $center_width centerstage-center" ;;
        right)  echo "$right_x $right_width centerstage-right" ;;
    esac
}

# Calculate grid dimensions based on window count
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

# Get minimum width for app class
get_min_width() {
    local class=$1
    local default_min=400

    if [[ -f "$MIN_WIDTHS_FILE" ]]; then
        # Try exact match
        local min=$(grep "^$class:" "$MIN_WIDTHS_FILE" 2>/dev/null | cut -d: -f2)
        [[ -n "$min" ]] && { echo "$min"; return; }

        # Check for default
        min=$(grep "^default:" "$MIN_WIDTHS_FILE" 2>/dev/null | cut -d: -f2)
        [[ -n "$min" ]] && { echo "$min"; return; }
    fi

    echo "$default_min"
}

# Count windows in a zone
count_zone_windows() {
    local tag=$1
    local workspace=$2

    hyprctl clients -j | jq -r \
        "[.[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null)] | length"
}

# Get window addresses in a zone
get_zone_windows() {
    local tag=$1
    local workspace=$2

    hyprctl clients -j | jq -r \
        ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null) | .address"
}

# Calculate required sidebar width based on window content
calculate_required_sidebar_width() {
    local zone=$1
    local workspace=$2
    local tag="centerstage-$zone"

    # Get window count
    local count=$(count_zone_windows "$tag" "$workspace")
    [[ "$count" -eq 0 ]] && { echo "0"; return; }

    # Get grid dimensions
    read -r cols rows <<< "$(calculate_grid $count)"

    # Find max required min-width from all windows
    local max_min=0
    while IFS= read -r class; do
        [[ -z "$class" ]] && continue
        local min=$(get_min_width "$class")
        [[ $min -gt $max_min ]] && max_min=$min
    done < <(hyprctl clients -j | jq -r \
        ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null) | .class")

    # Calculate total required width for grid
    local required=$(( max_min * cols + (cols - 1) * GAP_IN ))

    echo "$required"
}
