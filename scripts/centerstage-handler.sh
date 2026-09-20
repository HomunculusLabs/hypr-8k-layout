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

    # The open event normally arrives with usable geometry. Retry only when
    # mapping has not completed instead of adding latency to every launch.
    local clients window_info attempt
    [[ "$addr" =~ ^0x[[:xdigit:]]+$ ]] || return
    for ((attempt = 0; attempt < 5; attempt++)); do
        clients=$(hyprctl clients -j) || return
        window_info=$(jq -c --arg addr "$addr" '
            .[] | select(.address == $addr and .mapped != false and
                         (.size[0] // 0) > 0 and (.size[1] // 0) > 0)' <<< "$clients") || return
        [[ -n "$window_info" ]] && break
        [[ "$attempt" -lt 4 ]] && sleep 0.02
    done
    if [[ -z "$window_info" ]]; then
        echo "DEBUG: Window $addr not found"
        return
    fi

    local workspace=$(echo "$window_info" | jq -r ".workspace.id")
    [[ "$workspace" =~ ^-?[0-9]+$ ]] || return
    WINDOW_WORKSPACES[$addr]=$workspace
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
    local other_windows_same_pid
    other_windows_same_pid=$(jq -r --argjson pid "$pid" --arg addr "$addr" \
        '[.[] | select(.pid == $pid and .address != $addr)] | length' <<< "$clients")
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

    # Placement uses an explicit address; leave focus to the compositor/user.
    # Refocusing here steals focus back after an app opens on another workspace.

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
            # Preserve every explicit workspace choice; initialize only once.
            if ! is_pbp_mode && [[ "$(get_left_layout_mode "$workspace")" == single && ! -f "$LEFT_LAYOUT_FILE-$workspace" ]]; then
                ~/.config/hypr/scripts/centerstage-left-layout.sh "$workspace" --initialize || return
            fi
            ~/.config/hypr/scripts/centerstage-move.sh left "$addr"
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

    # Reuse the routing snapshot instead of querying the compositor per zone.
    local center_count right_count prim_count sec_count single_count left_count
    read -r center_count right_count prim_count sec_count single_count < <(
        jq -r --argjson workspace "$workspace" '
            map(select(.workspace.id == $workspace)) as $windows |
            ["centerstage-center", "centerstage-right", "centerstage-left-primary",
             "centerstage-left-secondary", "centerstage-left"] |
            map(. as $tag | [$windows[] | select((.tags // []) | index($tag))] | length) |
            @tsv' <<< "$clients"
    )
    local layout_mode=$(get_left_layout_mode)
    if [[ "$layout_mode" != "single" ]]; then
        left_count=$((prim_count + sec_count))
    else
        left_count=$single_count
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

# A close event contains only the address, so retain the last known workspace.
# Do not guess from activeworkspace: background closes must not rearrange it.
declare -A WINDOW_WORKSPACES=()
handle_window_close() {
    local addr=$1 workspace=${WINDOW_WORKSPACES[$1]:-}
    unset 'WINDOW_WORKSPACES[$addr]'
    [[ "$workspace" =~ ^[1-3]$ ]] || return 0
    "$HOME/.config/hypr/scripts/centerstage-reflow.sh" "$workspace"
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

# Connect before taking the initial client snapshot so no event can arrive
# between the snapshot and the event listener starting.
if [[ "${1:-}" != "--event-fd" ]]; then
    exec python3 "$HOME/.config/hypr/scripts/centerstage-listen.py" \
        --socket "$SOCKET" --handler "$0"
fi

if [[ -z "${2:-}" || ! "${2}" =~ ^[0-9]+$ ]]; then
    echo "Invalid event socket fd"
    exit 1
fi
EVENT_FD=$2
if ! { true <&"$EVENT_FD"; }; then
    echo "Could not read event socket fd: $EVENT_FD"
    exit 1
fi

# Seed existing windows so their first close can be routed without polling.
while IFS=$'\t' read -r addr workspace; do
    [[ "$addr" =~ ^0x[[:xdigit:]]+$ && "$workspace" =~ ^-?[0-9]+$ ]] || continue
    WINDOW_WORKSPACES[$addr]=$workspace
done < <(hyprctl clients -j | jq -r '.[] | [.address, .workspace.id] | @tsv')

# Read directly from the pre-connected Hyprland socket.
while IFS= read -r line <&"$EVENT_FD"; do
    # Parse event: openwindow>>ADDRESS,WORKSPACE,CLASS,TITLE
    if [[ "$line" == openwindow\>\>* ]]; then
        # Extract address (first field after >>)
        addr="0x${line#openwindow>>}"
        addr="${addr%%,*}"
        handle_window_open "$addr"
    # Parse event: closewindow>>ADDRESS
    elif [[ "$line" == closewindow\>\>* ]]; then
        addr="0x${line#closewindow>>}"
        [[ "$addr" =~ ^0x[[:xdigit:]]+$ ]] && handle_window_close "$addr"
    elif [[ "$line" == movewindowv2\>\>* ]]; then
        IFS=, read -r raw_addr workspace _ <<< "${line#movewindowv2>>}"
        addr="0x$raw_addr"
        if [[ "$addr" =~ ^0x[[:xdigit:]]+$ && "$workspace" =~ ^-?[0-9]+$ ]]; then
            WINDOW_WORKSPACES[$addr]=$workspace
        fi
    fi
    :
done
