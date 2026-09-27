#!/bin/bash
# centerstage-restore.sh - Restore workspace layouts from saved state
#
# Launches saved applications on their respective workspaces
# Explicitly moves windows to saved zones (doesn't rely on handler)
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

# Wait for a window of given class to appear and return its address
wait_for_window() {
    local class="$1"
    local timeout=5
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        addr=$(hyprctl clients -j | jq -r ".[] | select(.class == \"$class\") | .address" | tail -1)
        if [[ -n "$addr" && "$addr" != "null" ]]; then
            echo "$addr"
            return 0
        fi
        sleep 0.3
        elapsed=$((elapsed + 1))
    done
    return 1
}

# Track launched windows to avoid duplicates
declare -A launched

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
            "$HOME/.config/hypr/scripts/hypr-dispatch.sh" workspace "$workspace"
            sleep 0.3

            # Get window count before launch
            before_count=$(hyprctl clients -j | jq "[.[] | select(.class == \"$class\")] | length")

            "$HOME/.config/hypr/scripts/hypr-dispatch.sh" exec "$launch_cmd"

            # Wait for new window to appear
            sleep 1

            # Get the newest window of this class
            addr=$(hyprctl clients -j | jq -r ".[] | select(.class == \"$class\") | .address" | tail -1)

            if [[ -n "$addr" && "$addr" != "null" ]]; then
                echo "Moving $class ($addr) to $zone"
                $HOME/.config/hypr/layouts/centerstage/centerstage-move.sh "$zone" "$addr"
            fi

            sleep 0.3
        fi
    done
done

notify-send "Center Stage" "Layout restored"
