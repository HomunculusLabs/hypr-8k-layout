#!/bin/bash
# centerstage-retile.sh - Re-tile windows in a zone (vertical stack or grid)
#
# Usage: centerstage-retile.sh <zone> <workspace_id>

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

ZONE="${1:-center}"
WORKSPACE="${2:-1}"

# Check for sub-column layouts in left sidebar
if [[ "$ZONE" == "left" ]]; then
    layout_mode=$(get_left_layout_mode)
    if [[ "$layout_mode" != "single" ]]; then
        # Retile primary sub-column (single window, full height)
        read -r prim_x prim_width prim_tag <<< "$(get_left_subcolumn_dimensions primary)"
        mapfile -t prim_windows < <(hyprctl clients -j | jq -r \
            ".[] | select(.workspace.id == $WORKSPACE and .tags != null and (.tags | index(\"$prim_tag\")) != null) | .address")

        if [[ ${#prim_windows[@]} -gt 0 ]]; then
            for addr in "${prim_windows[@]}"; do
                [[ -z "$addr" ]] && continue
                hyprctl dispatch resizewindowpixel "exact $prim_width $TOTAL_HEIGHT,address:$addr"
                hyprctl dispatch movewindowpixel "exact $prim_x $ZONE_Y,address:$addr"
            done
        fi

        # Retile secondary sub-column (grid layout)
        read -r sec_x sec_width sec_tag <<< "$(get_left_subcolumn_dimensions secondary)"
        mapfile -t sec_windows < <(hyprctl clients -j | jq -r \
            ".[] | select(.workspace.id == $WORKSPACE and .tags != null and (.tags | index(\"$sec_tag\")) != null) | .address")

        sec_count=${#sec_windows[@]}
        if [[ $sec_count -gt 0 ]]; then
            read -r cols rows <<< "$(calculate_grid $sec_count)"

            if [[ $cols -eq 1 ]]; then
                cell_width=$sec_width
                if [[ $sec_count -eq 1 ]]; then
                    cell_height=$TOTAL_HEIGHT
                else
                    total_gap=$(( (sec_count - 1) * GAP_IN ))
                    cell_height=$(( (TOTAL_HEIGHT - total_gap) / sec_count ))
                fi
            else
                cell_width=$(( (sec_width - (cols - 1) * GAP_IN) / cols ))
                cell_height=$(( (TOTAL_HEIGHT - (rows - 1) * GAP_IN) / rows ))
            fi

            i=0
            for addr in "${sec_windows[@]}"; do
                [[ -z "$addr" ]] && continue
                if [[ $cols -eq 1 ]]; then
                    x=$sec_x
                    y=$(( ZONE_Y + i * (cell_height + GAP_IN) ))
                else
                    col=$(( i % cols ))
                    row=$(( i / cols ))
                    x=$(( sec_x + col * (cell_width + GAP_IN) ))
                    y=$(( ZONE_Y + row * (cell_height + GAP_IN) ))
                fi
                hyprctl dispatch resizewindowpixel "exact $cell_width $cell_height,address:$addr"
    hyprctl dispatch movewindowpixel "exact $x $y,address:$addr"
                ((i++))
            done
        fi

        exit 0
    fi
fi

# Check for sub-column layouts in right sidebar (terminal-grid mode)
if [[ "$ZONE" == "right" ]]; then
    layout_mode=$(get_right_layout_mode)
    if [[ "$layout_mode" == "terminal-grid" ]]; then
        # Retile primary sub-column (terminals stacked vertically)
        read -r prim_x prim_width prim_tag <<< "$(get_right_subcolumn_dimensions primary)"
        mapfile -t prim_windows < <(hyprctl clients -j | jq -r \
            ".[] | select(.workspace.id == $WORKSPACE and .tags != null and (.tags | index(\"$prim_tag\")) != null) | .address")

        prim_count=${#prim_windows[@]}
        if [[ $prim_count -gt 0 ]]; then
            if [[ $prim_count -eq 1 ]]; then
                prim_height=$TOTAL_HEIGHT
            else
                prim_height=$(( (TOTAL_HEIGHT - (prim_count - 1) * GAP_IN) / prim_count ))
            fi
            i=0
            for addr in "${prim_windows[@]}"; do
                [[ -z "$addr" ]] && continue
                y=$(( ZONE_Y + i * (prim_height + GAP_IN) ))
                hyprctl dispatch resizewindowpixel "exact $prim_width $prim_height,address:$addr"
                hyprctl dispatch movewindowpixel "exact $prim_x $y,address:$addr"
                ((i++))
            done
        fi

        # Retile secondary sub-column (grid layout for other windows)
        read -r sec_x sec_width sec_tag <<< "$(get_right_subcolumn_dimensions secondary)"
        mapfile -t sec_windows < <(hyprctl clients -j | jq -r \
            ".[] | select(.workspace.id == $WORKSPACE and .tags != null and (.tags | index(\"$sec_tag\")) != null) | .address")

        sec_count=${#sec_windows[@]}
        if [[ $sec_count -gt 0 ]]; then
            read -r cols rows <<< "$(calculate_grid $sec_count)"

            if [[ $cols -eq 1 ]]; then
                cell_width=$sec_width
                if [[ $sec_count -eq 1 ]]; then
                    cell_height=$TOTAL_HEIGHT
                else
                    total_gap=$(( (sec_count - 1) * GAP_IN ))
                    cell_height=$(( (TOTAL_HEIGHT - total_gap) / sec_count ))
                fi
            else
                cell_width=$(( (sec_width - (cols - 1) * GAP_IN) / cols ))
                cell_height=$(( (TOTAL_HEIGHT - (rows - 1) * GAP_IN) / rows ))
            fi

            i=0
            for addr in "${sec_windows[@]}"; do
                [[ -z "$addr" ]] && continue
                if [[ $cols -eq 1 ]]; then
                    x=$sec_x
                    y=$(( ZONE_Y + i * (cell_height + GAP_IN) ))
                else
                    col=$(( i % cols ))
                    row=$(( i / cols ))
                    x=$(( sec_x + col * (cell_width + GAP_IN) ))
                    y=$(( ZONE_Y + row * (cell_height + GAP_IN) ))
                fi
                hyprctl dispatch resizewindowpixel "exact $cell_width $cell_height,address:$addr"
                hyprctl dispatch movewindowpixel "exact $x $y,address:$addr"
                ((i++))
            done
        fi

        exit 0
    fi
fi

# Get zone parameters (standard single-column mode)
read -r ZONE_X ZONE_WIDTH TAG <<< "$(get_zone_dimensions "$ZONE")"

# Get all windows in this zone and workspace
mapfile -t windows < <(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $WORKSPACE and .tags != null and (.tags | index(\"$TAG\")) != null) | .address")

count=${#windows[@]}

[[ "$count" -eq 0 ]] && exit 0

# Right sidebar: scale width based on window count
# Calculate minimum width needed for square cells at each grid size
if [[ "$ZONE" == "right" ]]; then
    if [[ $count -lt 4 ]]; then
        # 1-3: vertical stack, cell height ~586-1960px, half width (1235px) is plenty
        ZONE_WIDTH=$(( ZONE_WIDTH / 2 ))
    elif [[ $count -lt 7 ]]; then
        # 4-6: 2x2 or 2x3 grid, need ~1960px for square 2x2 (930px cells)
        ZONE_WIDTH=$(( ZONE_WIDTH * 4 / 5 ))
    fi
    # 7+: full width for 3x3 grid
    ZONE_X=$(( SCREEN_WIDTH - EDGE_MARGIN - ZONE_WIDTH ))
fi

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

    hyprctl dispatch resizewindowpixel "exact $cell_width $cell_height,address:$addr"
    hyprctl dispatch movewindowpixel "exact $x $y,address:$addr"

    # Assign position tag for right sidebar (1-indexed)
    if [[ "$ZONE" == "right" ]]; then
        # Strip old position tags first
        for pos in {1..9}; do
            hyprctl dispatch tagwindow -- "-centerstage-right-$pos" "address:$addr" 2>/dev/null
        done
        # Assign new position tag
        hyprctl dispatch tagwindow "+centerstage-right-$((i + 1))" "address:$addr"
    fi

    ((i++))
done
