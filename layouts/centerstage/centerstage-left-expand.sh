#!/bin/bash
# Toggle expand left-secondary window to cover entire left sidebar

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Find window in left-secondary
addr=$(hyprctl clients -j | jq -r ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"centerstage-left-secondary\"))) | .address" | head -1)

if [[ -z "$addr" || "$addr" == "null" ]]; then
    notify-send "Center Stage" "No window in left-secondary"
    exit 1
fi

# Check if already expanded (has the expanded tag)
is_expanded=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$addr\" and .tags != null and (.tags | index(\"centerstage-left-expanded\"))) | .address")

# Get full left sidebar dimensions
read -r left_x left_width _tag <<< "$(get_zone_dimensions left)"

if [[ -n "$is_expanded" ]]; then
    # Collapse: remove expanded tag and retile
    hyprctl dispatch tagwindow -- "-centerstage-left-expanded" "address:$addr"
    ~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"
    notify-send "Center Stage" "Left secondary collapsed"
else
    # Expand: add tag and resize to full left sidebar
    hyprctl dispatch tagwindow "+centerstage-left-expanded" "address:$addr"
    hyprctl dispatch resizewindowpixel "exact $left_width $TOTAL_HEIGHT,address:$addr"
    hyprctl dispatch movewindowpixel "exact $left_x $ZONE_Y,address:$addr"
    notify-send "Center Stage" "Left secondary expanded"
fi
