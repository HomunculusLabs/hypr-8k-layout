#!/bin/bash
# centerstage-handler.sh - Auto-position windows on workspaces 1-3
# First window goes to center, rest go to right sidebar

# Prevent multiple instances
LOCKFILE="/tmp/centerstage-handler.lock"
exec 200>"$LOCKFILE"
flock -n 200 || { echo "Handler already running"; exit 1; }

handle_window_open() {
    local addr="$1"

    # Small delay to let window fully initialize
    sleep 0.1

    # Get window info
    local window_info=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$addr\")")
    if [[ -z "$window_info" ]]; then
        echo "DEBUG: Window $addr not found"
        return
    fi

    local workspace=$(echo "$window_info" | jq -r ".workspace.id")
    local floating=$(echo "$window_info" | jq -r ".floating")

    echo "DEBUG: addr=$addr workspace=$workspace floating=$floating"

    # Only handle workspaces 1-3
    [[ "$workspace" -gt 3 ]] && { echo "DEBUG: workspace > 3, skipping"; return; }
    [[ "$workspace" -lt 1 ]] && { echo "DEBUG: workspace < 1, skipping"; return; }

    # Check if already has centerstage tag (already handled)
    local has_tag=$(echo "$window_info" | jq -r '.tags // [] | map(select(startswith("centerstage-"))) | length')
    [[ "$has_tag" -gt 0 ]] && { echo "DEBUG: already has centerstage tag, skipping"; return; }

    # Focus the new window first
    hyprctl dispatch focuswindow "address:$addr"

    # Count existing center-stage windows in this workspace
    local center_count=$(hyprctl clients -j | jq -r \
        "[.[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-center\")) != null)] | length")

    echo "DEBUG: center_count=$center_count"

    if [[ "$center_count" -eq 0 ]]; then
        echo "DEBUG: Moving to center"
        ~/.config/hypr/scripts/centerstage-move.sh center
    else
        echo "DEBUG: Moving to right"
        ~/.config/hypr/scripts/centerstage-move.sh right
    fi
}

# Retile a single zone (used when windows close)
retile_zone() {
    local zone="$1"
    local workspace="$2"

    local ZONE_Y=100
    local TOTAL_HEIGHT=1960
    local GAP_IN=100
    local OFFSET_FILE="/tmp/centerstage-sidebar-offset"
    local WIDTH_FILE="/tmp/centerstage-center-width"

    # Read sidebar offset for asymmetric widths
    local sidebar_offset=0
    [[ -f "$OFFSET_FILE" ]] && sidebar_offset=$(cat "$OFFSET_FILE")

    # Read stored center width preference (default 2560)
    local center_width=2560
    [[ -f "$WIDTH_FILE" ]] && center_width=$(cat "$WIDTH_FILE")
    [[ -z "$center_width" || "$center_width" == "null" ]] && center_width=2560

    # Calculate base sidebar width
    local base_sidebar=$(( (7320 - center_width) / 2 ))
    local left_width=$(( base_sidebar + sidebar_offset ))
    local right_width=$(( base_sidebar - sidebar_offset ))
    local center_x=$(( (7680 - center_width) / 2 ))
    local right_x=$(( center_x + center_width + GAP_IN ))

    # Determine zone parameters
    local zone_x zone_width tag
    case "$zone" in
        left)
            zone_x=80
            zone_width=$left_width
            tag="centerstage-left"
            ;;
        center)
            zone_x=$center_x
            zone_width=$center_width
            tag="centerstage-center"
            ;;
        right)
            zone_x=$right_x
            zone_width=$right_width
            tag="centerstage-right"
            ;;
        *)
            return
            ;;
    esac

    # Get windows in this zone
    local windows=$(hyprctl clients -j | jq -r \
        ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null) | .address")

    # Count windows
    local count=0
    while IFS= read -r addr; do
        [[ -n "$addr" ]] && ((count++))
    done <<< "$windows"

    [[ "$count" -eq 0 ]] && return

    # Calculate height per window
    local win_height
    if [[ "$count" -eq 1 ]]; then
        win_height=$TOTAL_HEIGHT
    else
        local total_gap=$(( (count - 1) * GAP_IN ))
        win_height=$(( (TOTAL_HEIGHT - total_gap) / count ))
    fi

    # Position each window
    local i=0
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        local y=$(( ZONE_Y + i * (win_height + GAP_IN) ))
        hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact $zone_width $win_height ; dispatch moveactive exact $zone_x $y"
        ((i++))
    done <<< "$windows"
}

# Handle window close - retile all zones
handle_window_close() {
    # Small delay for Hyprland to update state
    sleep 0.1

    local workspace=$(hyprctl activeworkspace -j | jq -r .id)

    # Only handle workspaces 1-3
    [[ "$workspace" -gt 3 ]] && return
    [[ "$workspace" -lt 1 ]] && return

    echo "DEBUG: Window closed on workspace $workspace, retiling zones"

    # Retile all zones
    retile_zone "left" "$workspace"
    retile_zone "right" "$workspace"
    retile_zone "center" "$workspace"
}

# Find the Hyprland socket
SOCKET=$(find /run/user/1000/hypr -name ".socket2.sock" 2>/dev/null | head -1)

if [[ -z "$SOCKET" ]]; then
    echo "Could not find Hyprland socket"
    exit 1
fi

# Listen to Hyprland socket for window events using socat
socat -U - "UNIX-CONNECT:$SOCKET" | while read -r line; do
    # Parse event: openwindow>>ADDRESS,WORKSPACE,CLASS,TITLE
    if [[ "$line" == openwindow\>\>* ]]; then
        # Extract address (first field after >>)
        addr="0x${line#openwindow>>}"
        addr="${addr%%,*}"
        handle_window_open "$addr"
    # Parse event: closewindow>>ADDRESS
    elif [[ "$line" == closewindow\>\>* ]]; then
        handle_window_close
    fi
done
