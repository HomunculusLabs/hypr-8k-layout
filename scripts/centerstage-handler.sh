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

    is_pip_workspace_mode && return

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
    local pid=$(echo "$window_info" | jq -r ".pid")
    local width=$(echo "$window_info" | jq -r ".size[0]")
    local height=$(echo "$window_info" | jq -r ".size[1]")
    local fullscreen=$(echo "$window_info" | jq -r ".fullscreen // 0")
    local title=$(echo "$window_info" | jq -r '.title // ""')

    echo "DEBUG: addr=$addr workspace=$workspace floating=$floating class=$class title=$title size=${width}x${height} pid=$pid"

    # Games launched from the Battle.net bottle share the steam_app_* class
    # with the Battle.net launcher, but only the launcher should be
    # zone-managed. Game windows (World of Warcraft, ...) must keep
    # compositor control: floating them into a sidebar cell makes them
    # render above tiled windows and resizes them on every retile.
    if [[ "$class" == steam_app_* && "$title" != Battle.net* ]]; then
        echo "DEBUG: Skipping game window: class=$class title=$title"
        return
    fi

    # Session overlays and fullscreen clients must retain compositor control of
    # the whole output rather than being floated into a Centerstage zone.
    if [[ "$class" == "org.omarchy.screensaver" || "$fullscreen" -ne 0 ]]; then
        echo "DEBUG: Skipping fullscreen/session overlay: class=$class fullscreen=$fullscreen"
        return
    fi

    # Skip popup/menu windows (small windows are likely context menus or dialogs)
    if [[ "$width" -lt 600 || "$height" -lt 400 ]]; then
        echo "DEBUG: Skipping small window (likely popup/dialog): ${width}x${height}"
        return
    fi

    # Skip ANY window that shares PID with another existing window
    # (child windows, popups, dialogs from same app)
    local other_windows_same_pid=$(hyprctl clients -j | jq -r \
        "[.[] | select(.pid == $pid and .address != \"$addr\")] | length")
    if [[ "$other_windows_same_pid" -gt 0 ]]; then
        echo "DEBUG: Skipping window - shares PID $pid with existing window (likely popup/child)"
        return
    fi

    # Only handle workspaces 1-3
    [[ "$workspace" -gt 3 ]] && { echo "DEBUG: workspace > 3, skipping"; return; }
    [[ "$workspace" -lt 1 ]] && { echo "DEBUG: workspace < 1, skipping"; return; }

    # Check if already has centerstage tag (already handled)
    local has_tag=$(echo "$window_info" | jq -r '.tags // [] | map(select(startswith("centerstage-"))) | length')
    [[ "$has_tag" -gt 0 ]] && { echo "DEBUG: already has centerstage tag, skipping"; return; }

    # Focus the new window first
    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" focuswindow "address:$addr"

    # PIP-ready mode maps one complete Centerstage zone to each workspace.
    if is_pip_workspace_mode; then
        case "$workspace" in
            1) ~/.config/hypr/scripts/centerstage-move.sh center "$addr" ;;
            2) ~/.config/hypr/scripts/centerstage-move.sh right "$addr" ;;
            3) ~/.config/hypr/scripts/centerstage-move.sh left "$addr" ;;
        esac
        return
    fi

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
    local right_count=$(count_zone_windows "centerstage-right" "$workspace")

    # Count left sidebar (including sub-columns in split mode)
    local layout_mode=$(get_left_layout_mode)
    local left_count
    if [[ "$layout_mode" != "single" ]]; then
        local prim_count=$(count_zone_windows "centerstage-left-primary" "$workspace")
        local sec_count=$(count_zone_windows "centerstage-left-secondary" "$workspace")
        left_count=$((prim_count + sec_count))
    else
        left_count=$(count_zone_windows "centerstage-left" "$workspace")
    fi

    echo "DEBUG: center=$center_count left=$left_count right=$right_count layout=$layout_mode"

    if [[ "$center_count" -eq 0 ]]; then
        if is_pbp_mode; then
            echo "DEBUG: PBP mode active, moving to right instead of center"
            ~/.config/hypr/scripts/centerstage-move.sh right "$addr"
        else
            echo "DEBUG: Moving to center"
            ~/.config/hypr/scripts/centerstage-move.sh center "$addr"
        fi
    elif [[ "$right_count" -lt 9 ]]; then
        echo "DEBUG: Moving to right"
        ~/.config/hypr/scripts/centerstage-move.sh right "$addr"
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

    if is_pip_workspace_mode; then
        ~/.config/hypr/scripts/centerstage-retile.sh center 1
        ~/.config/hypr/scripts/centerstage-retile.sh right 2
        ~/.config/hypr/scripts/centerstage-retile.sh left 3
        return
    fi

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

# Listen only to this session's Hyprland event socket. Selecting the first
# socket under /run/user can attach to a stale instance after a compositor
# restart and feed non-JSON errors into the handler.
if [[ -z "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]]; then
    echo "HYPRLAND_INSTANCE_SIGNATURE is not set"
    exit 1
fi
SOCKET="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock"

if [[ ! -S "$SOCKET" ]]; then
    echo "Could not find current Hyprland socket: $SOCKET"
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
