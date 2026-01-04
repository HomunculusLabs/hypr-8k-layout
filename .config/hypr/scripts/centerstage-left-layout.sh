#!/bin/bash
# centerstage-left-layout.sh - Toggle left sidebar layout mode
#
# Cycles through: single -> obsidian-grid -> equal-split -> single
#
# Usage: centerstage-left-layout.sh

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only work on workspaces 1-3
[[ "$workspace" -gt 3 ]] && { notify-send "Center Stage" "Only available on workspaces 1-3"; exit 1; }

current_mode=$(get_left_layout_mode)

# Migrate windows when switching modes
migrate_to_split() {
    # Find Obsidian and assign to primary, others to secondary
    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        local class=$(hyprctl clients -j | jq -r ".[] | select(.address == \"$addr\") | .class")
        hyprctl dispatch focuswindow "address:$addr"
        hyprctl dispatch tagwindow -- "-centerstage-left"
        if [[ "$class" == "obsidian" ]]; then
            hyprctl dispatch tagwindow "+centerstage-left-primary"
        else
            hyprctl dispatch tagwindow "+centerstage-left-secondary"
        fi
    done < <(get_zone_windows "centerstage-left" "$workspace")
}

migrate_to_single() {
    # Merge all sub-column windows back to centerstage-left
    for tag in "centerstage-left-primary" "centerstage-left-secondary"; do
        while IFS= read -r addr; do
            [[ -z "$addr" ]] && continue
            hyprctl dispatch focuswindow "address:$addr"
            hyprctl dispatch tagwindow -- "-$tag"
            hyprctl dispatch tagwindow "+centerstage-left"
        done < <(hyprctl clients -j | jq -r \
            ".[] | select(.workspace.id == $workspace and .tags != null and (.tags | index(\"$tag\")) != null) | .address")
    done
}

# Cycle through modes
case "$current_mode" in
    single)
        new_mode="obsidian-grid"
        migrate_to_split
        ;;
    obsidian-grid)
        new_mode="equal-split"
        # Keep sub-column assignments
        ;;
    equal-split)
        new_mode="single"
        migrate_to_single
        ;;
    *)
        new_mode="single"
        ;;
esac

echo "$new_mode" > "$LEFT_LAYOUT_FILE"
~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"

notify-send "Center Stage" "Left sidebar: $new_mode"
