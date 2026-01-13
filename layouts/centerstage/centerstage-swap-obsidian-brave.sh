#!/bin/bash
# Swap Obsidian (left-secondary) with Brave (center)

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Find Obsidian and Brave windows
obsidian_addr=$(hyprctl clients -j | jq -r ".[] | select(.workspace.id == $workspace and .class == \"obsidian\") | .address" | head -1)
brave_addr=$(hyprctl clients -j | jq -r ".[] | select(.workspace.id == $workspace and .class == \"brave-browser\") | .address" | head -1)

if [[ -z "$obsidian_addr" || "$obsidian_addr" == "null" ]]; then
    notify-send "Center Stage" "No Obsidian window found"
    exit 1
fi

if [[ -z "$brave_addr" || "$brave_addr" == "null" ]]; then
    notify-send "Center Stage" "No Brave window found"
    exit 1
fi

# Get current zones
obsidian_zone=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$obsidian_addr\") | .tags[]" | grep "centerstage-" | grep -v "right-[0-9]" | grep -v "expanded" | head -1)

# Check if left-secondary window is currently expanded
was_expanded=""
if hyprctl clients -j | jq -e ".[] | select(.address == \"$obsidian_addr\" and .tags != null and (.tags | index(\"centerstage-left-expanded\")))" > /dev/null 2>&1; then
    was_expanded="obsidian"
elif hyprctl clients -j | jq -e ".[] | select(.address == \"$brave_addr\" and .tags != null and (.tags | index(\"centerstage-left-expanded\")))" > /dev/null 2>&1; then
    was_expanded="brave"
fi

# Helper to clear zone tags from a window
clear_zone_tags() {
    local addr="$1"
    hyprctl dispatch tagwindow -- "-centerstage-left" "address:$addr" 2>/dev/null || true
    hyprctl dispatch tagwindow -- "-centerstage-center" "address:$addr" 2>/dev/null || true
    hyprctl dispatch tagwindow -- "-centerstage-right" "address:$addr" 2>/dev/null || true
    hyprctl dispatch tagwindow -- "-centerstage-left-primary" "address:$addr" 2>/dev/null || true
    hyprctl dispatch tagwindow -- "-centerstage-left-secondary" "address:$addr" 2>/dev/null || true
    hyprctl dispatch tagwindow -- "-centerstage-left-expanded" "address:$addr" 2>/dev/null || true
}

# Clear tags from both windows first
clear_zone_tags "$obsidian_addr"
clear_zone_tags "$brave_addr"

# Determine swap direction and apply new tags
if [[ "$obsidian_zone" == "centerstage-left-secondary" ]]; then
    # Obsidian → center, Brave → left-secondary
    hyprctl dispatch tagwindow "+centerstage-center" "address:$obsidian_addr"
    hyprctl dispatch tagwindow "+centerstage-left-secondary" "address:$brave_addr"
    new_left_addr="$brave_addr"
    msg="Swapped: Brave → left, Obsidian → center"
else
    # Obsidian → left-secondary, Brave → center
    hyprctl dispatch tagwindow "+centerstage-left-secondary" "address:$obsidian_addr"
    hyprctl dispatch tagwindow "+centerstage-center" "address:$brave_addr"
    new_left_addr="$obsidian_addr"
    msg="Swapped: Obsidian → left, Brave → center"
fi

# Small delay to ensure tags are applied
sleep 0.05

# Retile both zones
~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"
~/.config/hypr/scripts/centerstage-retile.sh center "$workspace"

# If was expanded, apply expanded state to new left-secondary window
if [[ -n "$was_expanded" ]]; then
    hyprctl dispatch tagwindow "+centerstage-left-expanded" "address:$new_left_addr"
    read -r left_x left_width _tag <<< "$(get_zone_dimensions left)"
    hyprctl dispatch resizewindowpixel "exact $left_width $TOTAL_HEIGHT,address:$new_left_addr"
    hyprctl dispatch movewindowpixel "exact $left_x $ZONE_Y,address:$new_left_addr"
fi

notify-send "Center Stage" "$msg"
