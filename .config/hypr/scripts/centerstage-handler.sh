#!/bin/bash
# centerstage-handler.sh - Auto-position windows on workspaces 1-3
# First window goes to center, rest go to right sidebar

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

# Prevent multiple instances
LOCKFILE="$STATE_DIR/centerstage-handler.lock"
exec 200>"$LOCKFILE"
flock -n 200 || { echo "Handler already running"; exit 1; }

# Check if sidebars should shrink and apply
apply_shrink_if_needed() {
    local workspace=$1
    read_state

    [[ "$shrink_mode" != "auto" ]] && return

    # Calculate required widths for each sidebar
    local left_required=$(calculate_required_sidebar_width "left" "$workspace")
    local right_required=$(calculate_required_sidebar_width "right" "$workspace")

    # Set minimum widths (at least the required, with some padding)
    local min_padding=50
    local left_new=$(( left_required + min_padding ))
    local right_new=$(( right_required + min_padding ))

    # Ensure minimum usable size
    [[ $left_new -lt 500 ]] && left_new=500
    [[ $right_new -lt 500 ]] && right_new=500

    # If no windows in a zone, use a reasonable default
    [[ $left_required -eq 0 ]] && left_new=800
    [[ $right_required -eq 0 ]] && right_new=800

    # Check if widths changed significantly
    local left_diff=$(( left_new - left_width_override ))
    local right_diff=$(( right_new - right_width_override ))
    [[ $left_diff -lt 0 ]] && left_diff=$(( -left_diff ))
    [[ $right_diff -lt 0 ]] && right_diff=$(( -right_diff ))

    if [[ $left_diff -gt 50 || $right_diff -gt 50 ]]; then
        echo "DEBUG: Setting sidebar widths: left=$left_new right=$right_new"
        echo "$left_new" > "$LEFT_WIDTH_FILE"
        echo "$right_new" > "$RIGHT_WIDTH_FILE"

        # Retile both sidebars with new dimensions
        ~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"
        ~/.config/hypr/scripts/centerstage-retile.sh right "$workspace"
    fi
}

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
    local class=$(echo "$window_info" | jq -r ".class")

    echo "DEBUG: addr=$addr workspace=$workspace floating=$floating class=$class"

    # Only handle workspaces 1-3
    [[ "$workspace" -gt 3 ]] && { echo "DEBUG: workspace > 3, skipping"; return; }
    [[ "$workspace" -lt 1 ]] && { echo "DEBUG: workspace < 1, skipping"; return; }

    # Check if already has centerstage tag (already handled)
    local has_tag=$(echo "$window_info" | jq -r '.tags // [] | map(select(startswith("centerstage-"))) | length')
    [[ "$has_tag" -gt 0 ]] && { echo "DEBUG: already has centerstage tag, skipping"; return; }

    # Focus the new window first
    hyprctl dispatch focuswindow "address:$addr"

    # Apps that should always go to left sidebar
    case "$class" in
        obsidian)
            echo "DEBUG: Obsidian detected, switching to obsidian-grid layout"
            echo "obsidian-grid" > "$LEFT_LAYOUT_FILE"
            ~/.config/hypr/scripts/centerstage-move.sh left-primary "$addr"
            apply_shrink_if_needed "$workspace"
            return
            ;;
        org.gnome.Nautilus)
            echo "DEBUG: Moving $class to left sidebar"
            ~/.config/hypr/scripts/centerstage-move.sh left "$addr"
            apply_shrink_if_needed "$workspace"
            return
            ;;
    esac

    # Count existing center-stage windows in this workspace
    local center_count=$(count_zone_windows "centerstage-center" "$workspace")

    # Count right sidebar
    local right_count=$(count_zone_windows "centerstage-right" "$workspace")

    # Count left sidebar (including sub-columns in split mode)
    local left_layout=$(get_left_layout_mode)
    local left_count
    if [[ "$left_layout" != "single" ]]; then
        local prim_count=$(count_zone_windows "centerstage-left-primary" "$workspace")
        local sec_count=$(count_zone_windows "centerstage-left-secondary" "$workspace")
        left_count=$((prim_count + sec_count))
    else
        left_count=$(count_zone_windows "centerstage-left" "$workspace")
    fi

    echo "DEBUG: center=$center_count left=$left_count right=$right_count left_layout=$left_layout right_layout=$right_layout"

    if [[ "$center_count" -eq 0 ]]; then
        if is_pbp_mode; then
            echo "DEBUG: PBP mode active, moving to right instead of center"
            ~/.config/hypr/scripts/centerstage-move.sh right "$addr"
        else
            echo "DEBUG: Moving to center"
            ~/.config/hypr/scripts/centerstage-move.sh center "$addr"
        fi
    elif [[ "$right_count" -lt 9 ]]; then
        # Check if terminal-grid mode is active
        local right_layout=$(get_right_layout_mode)
        if [[ "$right_layout" == "terminal-grid" ]]; then
            echo "DEBUG: Moving to right-secondary (terminal-grid mode)"
            ~/.config/hypr/scripts/centerstage-move.sh right-secondary "$addr"
        else
            echo "DEBUG: Moving to right"
            ~/.config/hypr/scripts/centerstage-move.sh right "$addr"
        fi
    elif [[ "$left_count" -lt 9 ]]; then
        echo "DEBUG: Right full, moving to left"
        ~/.config/hypr/scripts/centerstage-move.sh left "$addr"
    else
        echo "DEBUG: Sidebars full, stacking on center"
        ~/.config/hypr/scripts/centerstage-move.sh center "$addr"
    fi

    apply_shrink_if_needed "$workspace"
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

    # Retile all zones using the retile script (now with grid support)
    ~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"
    ~/.config/hypr/scripts/centerstage-retile.sh right "$workspace"
    ~/.config/hypr/scripts/centerstage-retile.sh center "$workspace"

    apply_shrink_if_needed "$workspace"
}

# Find the Hyprland socket
SOCKET=$(find /run/user/1000/hypr -name ".socket2.sock" 2>/dev/null | head -1)

if [[ -z "$SOCKET" ]]; then
    echo "Could not find Hyprland socket"
    exit 1
fi

# Listen to Hyprland socket for window events using socat
# Reconnect loop - restarts socat if connection drops
while true; do
    socat -U - "UNIX-CONNECT:$SOCKET" 2>/dev/null | while read -r line; do
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
    echo "DEBUG: socat disconnected, reconnecting in 1s..."
    sleep 1
done
