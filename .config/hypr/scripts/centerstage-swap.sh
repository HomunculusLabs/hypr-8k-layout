#!/bin/bash
# centerstage-swap.sh - Reorder and swap windows between zones
#
# Usage: centerstage-swap.sh <direction>
#   up    - Move window up in sidebar stack (wraps)
#   down  - Move window down in sidebar stack (wraps)
#   left  - Move window to left zone (right→center→left)
#   right - Move window to right zone (left→center→right)

DIRECTION="$1"
STATE_FILE="/tmp/centerstage-sidebar-offset"
ZONE_Y=100
TOTAL_HEIGHT=1960
GAP_IN=100

# Get current workspace
workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Get focused window
focused_addr=$(hyprctl activewindow -j | jq -r .address)
[[ -z "$focused_addr" || "$focused_addr" == "null" ]] && { notify-send "Center Stage" "No focused window"; exit 1; }

# Get focused window's zone tag
focused_info=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$focused_addr\")")
current_zone=""
if echo "$focused_info" | jq -e '.tags | index("centerstage-left")' > /dev/null 2>&1; then
    current_zone="left"
elif echo "$focused_info" | jq -e '.tags | index("centerstage-center")' > /dev/null 2>&1; then
    current_zone="center"
elif echo "$focused_info" | jq -e '.tags | index("centerstage-right")' > /dev/null 2>&1; then
    current_zone="right"
fi

[[ -z "$current_zone" ]] && { notify-send "Center Stage" "Window not in center-stage"; exit 1; }

# Helper: Get zone dimensions
get_zone_params() {
    local zone="$1"

    # Read sidebar offset
    local sidebar_offset=0
    [[ -f "$STATE_FILE" ]] && sidebar_offset=$(cat "$STATE_FILE")

    # Get center width
    local center_width=$(hyprctl clients -j | jq -r \
        ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-center\")) != null) | .size[0]" | head -1)
    [[ -z "$center_width" || "$center_width" == "null" ]] && center_width=2560

    # Calculate dimensions
    local base_sidebar=$(( (7320 - center_width) / 2 ))
    local left_width=$(( base_sidebar + sidebar_offset ))
    local right_width=$(( base_sidebar - sidebar_offset ))
    local center_x=$(( (7680 - center_width) / 2 ))
    local right_x=$(( center_x + center_width + GAP_IN ))

    case "$zone" in
        left)   echo "80 $left_width centerstage-left" ;;
        center) echo "$center_x $center_width centerstage-center" ;;
        right)  echo "$right_x $right_width centerstage-right" ;;
    esac
}

# Helper: Retile a zone
retile_zone() {
    local zone="$1"
    read -r zone_x zone_width tag <<< "$(get_zone_params "$zone")"

    # Get windows sorted by Y position
    local windows=$(hyprctl clients -j | jq -r \
        "[.[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null)] | sort_by(.at[1]) | .[].address")

    local count=0
    while IFS= read -r addr; do
        [[ -n "$addr" ]] && ((count++))
    done <<< "$windows"

    [[ "$count" -eq 0 ]] && return

    # Calculate height
    local win_height
    if [[ "$count" -eq 1 ]]; then
        win_height=$TOTAL_HEIGHT
    else
        local total_gap=$(( (count - 1) * GAP_IN ))
        win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi

    # Position windows
    local i=0
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        local y=$(( ZONE_Y + i * (win_height + GAP_IN) ))
        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $zone_width $win_height ; dispatch moveactive exact $zone_x $y"
        ((i++))
    done <<< "$windows"
}

# Handle up/down (reorder within zone)
handle_vertical() {
    local dir="$1"
    read -r zone_x zone_width tag <<< "$(get_zone_params "$current_zone")"

    # Get windows in zone sorted by Y
    local windows=$(hyprctl clients -j | jq -r \
        "[.[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null)] | sort_by(.at[1]) | .[].address")

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

    # Calculate swap target with wrap-around
    local swap_idx
    if [[ "$dir" == "up" ]]; then
        swap_idx=$(( (focused_idx - 1 + count) % count ))
    else
        swap_idx=$(( (focused_idx + 1) % count ))
    fi

    # Swap in array
    local temp="${win_array[$focused_idx]}"
    win_array[$focused_idx]="${win_array[$swap_idx]}"
    win_array[$swap_idx]="$temp"

    # Calculate height
    local win_height
    if [[ "$count" -eq 1 ]]; then
        win_height=$TOTAL_HEIGHT
    else
        local total_gap=$(( (count - 1) * GAP_IN ))
        win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi

    # Reposition all windows in new order
    for i in "${!win_array[@]}"; do
        local addr="${win_array[$i]}"
        local y=$(( ZONE_Y + i * (win_height + GAP_IN) ))
        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $zone_width $win_height ; dispatch moveactive exact $zone_x $y"
    done

    # Refocus the original window
    hyprctl dispatch focuswindow "address:$focused_addr"
}

# Handle left/right (move between zones)
handle_horizontal() {
    local dir="$1"

    # Determine target zone
    local target_zone=""
    case "$current_zone" in
        left)
            [[ "$dir" == "right" ]] && target_zone="center"
            ;;
        center)
            [[ "$dir" == "left" ]] && target_zone="left"
            [[ "$dir" == "right" ]] && target_zone="right"
            ;;
        right)
            [[ "$dir" == "left" ]] && target_zone="center"
            ;;
    esac

    [[ -z "$target_zone" ]] && { notify-send "Center Stage" "Already at edge"; return; }

    # Focus the window first (tagwindow applies to active window)
    hyprctl dispatch focuswindow "address:$focused_addr"

    # Remove ALL zone tags first, then add new tag
    hyprctl dispatch "tagwindow -centerstage-left"
    hyprctl dispatch "tagwindow -centerstage-center"
    hyprctl dispatch "tagwindow -centerstage-right"
    hyprctl dispatch "tagwindow +centerstage-$target_zone"

    # Retile both zones
    retile_zone "$current_zone"
    retile_zone "$target_zone"

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
