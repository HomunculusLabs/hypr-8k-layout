#!/bin/bash
# centerstage-pbp-toggle.sh - Toggle PBP (Picture-by-Picture) mode
#
# ON:  Moves center windows to workspace 2, retiles sidebars for 4K half
# OFF: Restores center windows, returns to normal centerstage layout

set -euo pipefail

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

WALLPAPER_STATE="$HOME/.cache/hyprpaper-current"

# Reload hyprpaper with current wallpaper
reload_wallpaper() {
    sleep 0.2
    if [[ -f "$WALLPAPER_STATE" ]]; then
        local wallpaper=$(cat "$WALLPAPER_STATE")
        hyprctl hyprpaper wallpaper ",$wallpaper"
    fi
}

# Get current workspace
workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only allow on workspace 1
if [[ "$workspace" -ne 1 ]]; then
    notify-send "PBP Mode" "Only available on workspace 1" -t 2000
    exit 1
fi

# Check current mode
current_mode="off"
[[ -f "$PBP_MODE_FILE" ]] && current_mode=$(cat "$PBP_MODE_FILE")

if [[ "$current_mode" == "off" ]]; then
    # === ENABLE PBP MODE ===

    # 1. Get center window addresses for later restoration
    center_windows=$(hyprctl clients -j | jq -r \
        '.[] | select(.workspace.id == 1 and .tags != null and (.tags | index("centerstage-center")) != null) | .address')

    # Save to state file (simple newline-separated list)
    echo "$center_windows" > "$PBP_SAVED_FILE"

    # 2. Move center windows to workspace 2
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        # Remove center tag, add pbp-stashed tag
        hyprctl dispatch tagwindow -- "-centerstage-center" "address:$addr"
        hyprctl dispatch tagwindow "+centerstage-pbp-stashed" "address:$addr"
        # Move to workspace 2
        hyprctl dispatch movetoworkspacesilent 2,address:$addr
    done <<< "$center_windows"

    # 3. Set PBP mode
    echo "on" > "$PBP_MODE_FILE"

    # 4. Retile sidebars with new PBP dimensions
    ~/.config/hypr/scripts/centerstage-retile.sh left 1
    ~/.config/hypr/scripts/centerstage-retile.sh right 1

    # 5. Reload wallpaper to fix hyprpaper glitch
    reload_wallpaper

    notify-send "PBP Mode" "Enabled - sidebars fill 4K, center on WS2" -t 2000

else
    # === DISABLE PBP MODE ===

    # 1. Set mode to off first (so retile uses normal dimensions)
    echo "off" > "$PBP_MODE_FILE"

    # 2. Restore center windows from workspace 2
    if [[ -f "$PBP_SAVED_FILE" ]]; then
        while IFS= read -r addr; do
            [[ -z "$addr" ]] && continue
            # Check if window still exists
            if hyprctl clients -j | jq -e ".[] | select(.address == \"$addr\")" > /dev/null 2>&1; then
                # Move back to workspace 1
                hyprctl dispatch movetoworkspacesilent 1,address:$addr
                # Remove stashed tag, restore center tag
                hyprctl dispatch tagwindow -- "-centerstage-pbp-stashed" "address:$addr"
                hyprctl dispatch tagwindow "+centerstage-center" "address:$addr"
            fi
        done < "$PBP_SAVED_FILE"
        rm -f "$PBP_SAVED_FILE"
    fi

    # 3. Retile all zones with normal dimensions
    sleep 0.1
    ~/.config/hypr/scripts/centerstage-retile.sh left 1
    ~/.config/hypr/scripts/centerstage-retile.sh right 1
    ~/.config/hypr/scripts/centerstage-retile.sh center 1

    # 4. Reload wallpaper to fix hyprpaper glitch
    reload_wallpaper

    notify-send "PBP Mode" "Disabled - restored normal layout" -t 2000
fi
