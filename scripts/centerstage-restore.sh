#!/bin/bash
# centerstage-restore.sh - Restore workspace layouts from saved state
#
# Launches saved applications on their respective workspaces
# The handler will position them in the correct zones
#
# Usage: centerstage-restore.sh

STATE_DIR="$HOME/.config/hypr/state"
LAYOUT_FILE="$STATE_DIR/centerstage-layout.json"

[[ ! -f "$LAYOUT_FILE" ]] && { echo "No saved layout found"; exit 0; }

# Map window classes to launch commands
get_launch_cmd() {
    local class="$1"
    case "$class" in
        "com.mitchellh.ghostty")
            echo "ghostty"
            ;;
        "firefox"|"Firefox")
            echo "firefox"
            ;;
        "brave-browser"|"Brave-browser")
            echo "brave"
            ;;
        "chromium"|"Chromium")
            echo "chromium"
            ;;
        "google-chrome"|"Google-chrome")
            echo "google-chrome-stable"
            ;;
        "Spotify"|"spotify")
            echo "spotify"
            ;;
        "obsidian"|"Obsidian")
            echo "obsidian"
            ;;
        "code"|"Code")
            echo "code"
            ;;
        "Alacritty"|"alacritty")
            echo "alacritty"
            ;;
        "kitty"|"Kitty")
            echo "kitty"
            ;;
        *)
            # Try using the class name directly as command
            echo "${class,,}"
            ;;
    esac
}

# Process each workspace
jq -c '.[]' "$LAYOUT_FILE" | while read -r ws_data; do
    workspace=$(echo "$ws_data" | jq -r '.workspace')

    # Process each window in the workspace
    echo "$ws_data" | jq -c '.windows[]' | while read -r win_data; do
        class=$(echo "$win_data" | jq -r '.class')
        zone=$(echo "$win_data" | jq -r '.zone')

        launch_cmd=$(get_launch_cmd "$class")

        if [[ -n "$launch_cmd" ]]; then
            echo "Launching $launch_cmd on workspace $workspace (zone: $zone)"

            # Switch to workspace and launch
            hyprctl dispatch workspace "$workspace"
            sleep 0.2
            hyprctl dispatch exec "$launch_cmd"

            # Wait for window to appear and be positioned by handler
            sleep 0.5
        fi
    done
done

notify-send "Center Stage" "Layout restored"
