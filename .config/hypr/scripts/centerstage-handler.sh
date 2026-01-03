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
    sleep 0.15

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
    fi
done
