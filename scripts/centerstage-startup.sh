#!/bin/bash
# centerstage-startup.sh - Launch workspace 1 layout on startup
#
# Launches btop, Obsidian, Brave, and terminals in centerstage layout

set -euo pipefail

SCRIPTS="$HOME/.config/hypr/scripts"

# Wait for Hyprland and handler to be ready (handler managed by systemd)
sleep 2

# Switch to workspace 1
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" workspace 1

# Launch btop in ghostty FIRST (goes to left-primary, leftmost position)
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" exec "uwsm-app -- ghostty -e btop"
sleep 1

# Find and position btop ghostty window
btop_addr=$(hyprctl clients -j | jq -r '.[] | select(.class == "com.mitchellh.ghostty" and .workspace.id == 1) | .address' | head -1)
if [[ -n "$btop_addr" ]]; then
    "$SCRIPTS/centerstage-move.sh" left-primary "$btop_addr"
    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" resizewindowpixel "exact 750 1960,address:$btop_addr"
fi

# Launch Obsidian (will go to left-secondary)
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" exec "uwsm-app -- obsidian --disable-gpu --enable-wayland-ime"
sleep 1

# Launch Brave browser (will go to center)
"$HOME/.config/hypr/scripts/hypr-dispatch.sh" exec "omarchy-launch-browser"
sleep 1

# Launch terminals (will go to right sidebar)
for i in {1..2}; do
    "$HOME/.config/hypr/scripts/hypr-dispatch.sh" exec "uwsm-app -- alacritty"
    sleep 0.3
done

notify-send "Center Stage" "Workspace 1 ready"
