#!/bin/bash
# centerstage-swap.sh - Reorder and swap windows between zones
#
# Usage: centerstage-swap.sh <direction>
#   up    - Move window up/prev in zone (wraps)
#   down  - Move window down/next in zone (wraps)
#   left  - Move window to left zone (right→center→left)
#   right - Move window to right zone (left→center→right)

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

DIRECTION="$1"

# Get current workspace
workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Get focused window
focused_addr=$(hyprctl activewindow -j | jq -r .address)
[[ -z "$focused_addr" || "$focused_addr" == "null" ]] && { notify-send "Center Stage" "No focused window"; exit 1; }

# Get focused window's zone tag (including sub-columns)
focused_info=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$focused_addr\")")
current_zone=""
if echo "$focused_info" | jq -e '.tags | index("centerstage-left-primary")' > /dev/null 2>&1; then
    current_zone="left-primary"
elif echo "$focused_info" | jq -e '.tags | index("centerstage-left-secondary")' > /dev/null 2>&1; then
    current_zone="left-secondary"
elif echo "$focused_info" | jq -e '.tags | index("centerstage-left")' > /dev/null 2>&1; then
    current_zone="left"
elif echo "$focused_info" | jq -e '.tags | index("centerstage-center")' > /dev/null 2>&1; then
    current_zone="center"
elif echo "$focused_info" | jq -e '.tags | index("centerstage-right")' > /dev/null 2>&1; then
    current_zone="right"
fi

[[ -z "$current_zone" ]] && { notify-send "Center Stage" "Window not in center-stage"; exit 1; }

# Handle up/down (reorder within zone - works for both stack and grid)
handle_vertical() {
    local dir="$1"

    # Get zone dimensions based on zone type
    local zone_x zone_width tag
    case "$current_zone" in
        left-primary)
            read -r zone_x zone_width tag <<< "$(get_left_subcolumn_dimensions primary)"
            ;;
        left-secondary)
            read -r zone_x zone_width tag <<< "$(get_left_subcolumn_dimensions secondary)"
            ;;
        *)
            read -r zone_x zone_width tag <<< "$(get_zone_dimensions "$current_zone")"
            ;;
    esac

    # Get windows in zone sorted by position (top-left to bottom-right for grid)
    local windows=$(hyprctl clients -j | jq -r \
        "[.[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null)] | sort_by([.at[1], .at[0]]) | .[].address")

    # Convert to array
    local -a win_array=()
    while IFS= read -r addr; do
        [[ -n "$addr" ]] && win_array+=("$addr")
    done <<< "$windows"

    local count=${#win_array[@]}
    [[ "$count" -lt 2 ]] && { notify-send "Center Stage" "Only one window in zone"; return; }

    # Find focused window index
    local focused_idx=-1
    for i in "${!win_array[@]}"; do
        if [[ "${win_array[$i]}" == "$focused_addr" ]]; then
            focused_idx=$i
            break
        fi
    done

    [[ "$focused_idx" -eq -1 ]] && return

    # Get grid dimensions for navigation
    read -r cols rows <<< "$(calculate_grid $count)"

    # Calculate swap target
    local swap_idx
    if [[ $cols -eq 1 ]]; then
        # Vertical stack - up/down moves by one
        if [[ "$dir" == "up" ]]; then
            swap_idx=$(( (focused_idx - 1 + count) % count ))
        else
            swap_idx=$(( (focused_idx + 1) % count ))
        fi
    else
        # Grid layout - up/down moves by row (cols positions)
        local current_col=$(( focused_idx % cols ))
        local current_row=$(( focused_idx / cols ))

        if [[ "$dir" == "up" ]]; then
            local new_row=$(( (current_row - 1 + rows) % rows ))
            swap_idx=$(( new_row * cols + current_col ))
        else
            local new_row=$(( (current_row + 1) % rows ))
            swap_idx=$(( new_row * cols + current_col ))
        fi

        # Handle incomplete rows
        [[ $swap_idx -ge $count ]] && swap_idx=$(( count - 1 ))
    fi

    # Swap in array
    local temp="${win_array[$focused_idx]}"
    win_array[$focused_idx]="${win_array[$swap_idx]}"
    win_array[$swap_idx]="$temp"

    # Calculate cell dimensions
    local cell_width cell_height
    if [[ $cols -eq 1 ]]; then
        cell_width=$zone_width
        if [[ $count -eq 1 ]]; then
            cell_height=$TOTAL_HEIGHT
        else
            local total_gap=$(( (count - 1) * GAP_IN ))
            cell_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
        fi
    else
        cell_width=$(( (zone_width - (cols - 1) * GAP_IN) / cols ))
        cell_height=$(( (TOTAL_HEIGHT - (rows - 1) * GAP_IN) / rows ))
    fi

    # Reposition all windows in new order
    for i in "${!win_array[@]}"; do
        local addr="${win_array[$i]}"
        local x y

        if [[ $cols -eq 1 ]]; then
            x=$zone_x
            y=$(( ZONE_Y + i * (cell_height + GAP_IN) ))
        else
            local col=$(( i % cols ))
            local row=$(( i / cols ))
            x=$(( zone_x + col * (cell_width + GAP_IN) ))
            y=$(( ZONE_Y + row * (cell_height + GAP_IN) ))
        fi

        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $cell_width $cell_height ; dispatch moveactive exact $x $y"
    done

    # Refocus the original window
    hyprctl dispatch focuswindow "address:$focused_addr"
}

# Handle left/right (move between zones)
handle_horizontal() {
    local dir="$1"
    local layout_mode=$(get_left_layout_mode)

    # Determine target zone (handles sub-columns)
    local target_zone=""
    local retile_source="$current_zone"
    local retile_target=""

    case "$current_zone" in
        left-primary)
            if [[ "$dir" == "right" ]]; then
                target_zone="left-secondary"
                retile_source="left"
                retile_target="left"
            fi
            ;;
        left-secondary)
            if [[ "$dir" == "left" ]]; then
                target_zone="left-primary"
                retile_source="left"
                retile_target="left"
            elif [[ "$dir" == "right" ]]; then
                target_zone="center"
                retile_source="left"
                retile_target="center"
            fi
            ;;
        left)
            if [[ "$dir" == "right" ]]; then
                target_zone="center"
                retile_target="center"
            fi
            ;;
        center)
            if [[ "$dir" == "left" ]]; then
                if [[ "$layout_mode" != "single" ]]; then
                    target_zone="left-secondary"
                    retile_target="left"
                else
                    target_zone="left"
                    retile_target="left"
                fi
            elif [[ "$dir" == "right" ]]; then
                target_zone="right"
                retile_target="right"
            fi
            ;;
        right)
            if [[ "$dir" == "left" ]]; then
                target_zone="center"
                retile_target="center"
            fi
            ;;
    esac

    [[ -z "$target_zone" ]] && { notify-send "Center Stage" "Already at edge"; return; }

    # Focus the window first (tagwindow applies to active window)
    hyprctl dispatch focuswindow "address:$focused_addr"

    # Remove ALL zone tags first (including sub-column tags)
    hyprctl dispatch "tagwindow -centerstage-left"
    hyprctl dispatch "tagwindow -centerstage-center"
    hyprctl dispatch "tagwindow -centerstage-right"
    hyprctl dispatch "tagwindow -centerstage-left-primary"
    hyprctl dispatch "tagwindow -centerstage-left-secondary"

    # Add new tag
    hyprctl dispatch "tagwindow +centerstage-$target_zone"

    # Retile affected zones
    [[ -n "$retile_source" ]] && ~/.config/hypr/scripts/centerstage-retile.sh "$retile_source" "$workspace"
    [[ -n "$retile_target" && "$retile_target" != "$retile_source" ]] && ~/.config/hypr/scripts/centerstage-retile.sh "$retile_target" "$workspace"

    # Refocus the moved window
    hyprctl dispatch focuswindow "address:$focused_addr"

    notify-send "Center Stage" "Moved to $target_zone"
}

# Main
case "$DIRECTION" in
    up|down)
        handle_vertical "$DIRECTION"
        ;;
    left|right)
        handle_horizontal "$DIRECTION"
        ;;
    *)
        echo "Usage: centerstage-swap.sh <up|down|left|right>"
        exit 1
        ;;
esac
