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
LEFT_LAYOUT_FILE="$STATE_DIR/centerstage-left-layout"
LEFT_PRIMARY_RATIO_FILE="$STATE_DIR/centerstage-left-primary-ratio"
OBSIDIAN_GAP_FILE="$STATE_DIR/centerstage-obsidian-gap"
PBP_MODE_FILE="$STATE_DIR/centerstage-pbp-mode"
PBP_SAVED_FILE="$STATE_DIR/centerstage-pbp-saved"

# PBP mode constants
PBP_GAP_IN=50
PBP_SCREEN_WIDTH=3840

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

    left_primary_ratio=50
    [[ -f "$LEFT_PRIMARY_RATIO_FILE" ]] && left_primary_ratio=$(cat "$LEFT_PRIMARY_RATIO_FILE")
    [[ -z "$left_primary_ratio" || "$left_primary_ratio" == "null" ]] && left_primary_ratio=50

    # Obsidian extra gap in grid-obsidian mode (default 540 = matches right 2x2/2x3)
    obsidian_extra_gap=540
    [[ -f "$OBSIDIAN_GAP_FILE" ]] && obsidian_extra_gap=$(cat "$OBSIDIAN_GAP_FILE")
    [[ -z "$obsidian_extra_gap" || "$obsidian_extra_gap" == "null" ]] && obsidian_extra_gap=540
}

# Check if PBP mode is active
is_pbp_mode() {
    [[ -f "$PBP_MODE_FILE" ]] && [[ "$(cat "$PBP_MODE_FILE")" == "on" ]]
}

# Calculate zone dimensions
# Usage: read -r zone_x zone_width tag <<< "$(get_zone_dimensions left)"
get_zone_dimensions() {
    local zone=$1
    read_state

    # PBP mode: sidebars fill 4K half, center zone unavailable
    if is_pbp_mode; then
        # Center zone doesn't exist in PBP mode
        if [[ "$zone" == "center" ]]; then
            echo "0 0 centerstage-center"
            return
        fi

        # Split 3840px between left and right sidebars
        local usable_width=$((PBP_SCREEN_WIDTH - 2 * EDGE_MARGIN))
        local half_width=$(( (usable_width - PBP_GAP_IN) / 2 ))

        local left_x=$EDGE_MARGIN
        local left_width=$half_width
        local right_x=$((left_x + half_width + PBP_GAP_IN))
        local right_width=$half_width

        case "$zone" in
            left)   echo "$left_x $left_width centerstage-left" ;;
            right)  echo "$right_x $right_width centerstage-right" ;;
        esac
        return
    fi

    # Normal mode: Center is always fixed and centered
    local center_x=$(( (SCREEN_WIDTH - center_width) / 2 ))

    # Calculate sidebar widths using full available space
    local left_x=$EDGE_MARGIN
    local left_width=$(( center_x - GAP_IN - EDGE_MARGIN ))

    local right_x=$(( center_x + center_width + GAP_IN ))
    local right_width=$(( SCREEN_WIDTH - EDGE_MARGIN - right_x ))

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

# Get left sidebar layout mode
# Returns: single | obsidian-grid | grid-obsidian | equal-split
get_left_layout_mode() {
    # Force single mode in PBP mode (simpler layout for 4K half)
    is_pbp_mode && { echo "single"; return; }

    local mode="single"
    [[ -f "$LEFT_LAYOUT_FILE" ]] && mode=$(cat "$LEFT_LAYOUT_FILE")
    echo "$mode"
}

# Calculate right sidebar column width (for matching in left sidebar)
get_right_column_width() {
    read_state
    local center_x=$(( (SCREEN_WIDTH - center_width) / 2 ))
    local right_x=$(( center_x + center_width + GAP_IN ))
    local right_width=$(( SCREEN_WIDTH - EDGE_MARGIN - right_x ))
    # For 3x3 grid: (width - 2 gaps) / 3 columns
    echo $(( (right_width - 2 * GAP_IN) / 3 ))
}

# Calculate sub-column dimensions for left sidebar
# In split mode, uses full available space (not auto-shrink width)
# - obsidian-grid: Primary (Obsidian) left, secondary (grid) right, ratio-based
# - grid-obsidian: Secondary (grid) left (fixed to right-sidebar column width), primary (Obsidian) right
# - equal-split: 50/50 split
# Usage: read -r zone_x zone_width tag <<< "$(get_left_subcolumn_dimensions primary)"
get_left_subcolumn_dimensions() {
    local subcolumn=$1  # "primary" or "secondary"
    read_state

    # Calculate full available width for left sidebar (ignoring auto-shrink)
    local center_x=$(( (SCREEN_WIDTH - center_width) / 2 ))
    local left_x=$EDGE_MARGIN
    local left_width=$(( center_x - GAP_IN - EDGE_MARGIN ))

    local layout_mode=$(get_left_layout_mode)

    if [[ "$layout_mode" == "grid-obsidian" ]]; then
        # grid-obsidian: secondary (grid) on left, slightly wider than right sidebar column
        local right_col_width=$(get_right_column_width)
        local sec_width=$(( right_col_width * 1025 / 1000 ))  # 1.025x for htop
        local sec_x=$left_x
        local prim_x=$(( left_x + sec_width + GAP_IN ))

        # Use configurable extra gap (from state file, default 540 matches right 2x2/2x3)
        local prim_width=$(( left_width - sec_width - GAP_IN - obsidian_extra_gap ))

        case "$subcolumn" in
            primary)   echo "$prim_x $prim_width centerstage-left-primary" ;;
            secondary) echo "$sec_x $sec_width centerstage-left-secondary" ;;
        esac
    else
        # obsidian-grid / equal-split: primary (Obsidian) on left, secondary (grid) on right
        local usable_width=$(( left_width - GAP_IN ))
        local prim_width=$(( usable_width * left_primary_ratio / 100 ))
        local sec_width=$(( usable_width - prim_width ))
        local second_x=$(( left_x + prim_width + GAP_IN ))

        case "$subcolumn" in
            primary)  echo "$left_x $prim_width centerstage-left-primary" ;;
            secondary) echo "$second_x $sec_width centerstage-left-secondary" ;;
        esac
    fi
}

# Get all sub-column tags for a sidebar (for cleanup)
get_subcolumn_tags() {
    local side=$1  # "left" or "right"
    echo "centerstage-${side}-primary centerstage-${side}-secondary"
}
