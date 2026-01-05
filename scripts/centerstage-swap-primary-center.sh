#!/bin/bash
# centerstage-swap-primary-center.sh - Swap left-primary with center window
#
# Swaps tags between:
#   - centerstage-left-primary window -> centerstage-center
#   - centerstage-center window -> centerstage-left-primary
#
# Usage: centerstage-swap-primary-center.sh

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

# Check layout mode - swap only works in split modes
layout_mode=$(get_left_layout_mode)
[[ "$layout_mode" == "single" ]] && { notify-send "Center Stage" "Enable split mode first"; exit 1; }

# Get left-primary window
primary_addr=$(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-left-primary\")) != null) | .address" | head -1)

# Get center window
center_addr=$(hyprctl clients -j | jq -r \
    ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-center\")) != null) | .address" | head -1)

# Validate both windows exist
[[ -z "$primary_addr" || "$primary_addr" == "null" ]] && { notify-send "Center Stage" "No window in left-primary"; exit 1; }
[[ -z "$center_addr" || "$center_addr" == "null" ]] && { notify-send "Center Stage" "No window in center"; exit 1; }

# Get window classes for notification
primary_class=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$primary_addr\") | .class")
center_class=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$center_addr\") | .class")

# Swap tags - remove old, add new

# Primary window: remove left-primary, add center
hyprctl dispatch focuswindow "address:$primary_addr"
hyprctl dispatch tagwindow -- "-centerstage-left-primary"
hyprctl dispatch tagwindow "+centerstage-center"

# Center window: remove center, add left-primary
hyprctl dispatch focuswindow "address:$center_addr"
hyprctl dispatch tagwindow -- "-centerstage-center"
hyprctl dispatch tagwindow "+centerstage-left-primary"

# Small delay for tag application
sleep 0.05

# Retile both zones
~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"
~/.config/hypr/scripts/centerstage-retile.sh center "$workspace"

# Focus the window that is now in center (was primary)
hyprctl dispatch focuswindow "address:$primary_addr"

notify-send "Center Stage" "Swapped: $primary_class <-> $center_class"
