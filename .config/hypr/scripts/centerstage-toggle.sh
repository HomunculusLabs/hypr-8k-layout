#!/bin/bash
# centerstage-toggle.sh - Toggle center-stage mode for current workspace
#
# When enabling: Float all windows and arrange into center zone
# When disabling: Un-float all windows and return to dwindle tiling

set -euo pipefail

workspace=$(hyprctl activeworkspace -j | jq -r .id)

# Only allow on workspaces 1-3
if [[ "$workspace" -gt 3 ]]; then
    notify-send "Center Stage" "Only available on workspaces 1-3"
    exit 1
fi

# Check if center-stage mode is active (look for tagged windows)
tagged_count=$(hyprctl clients -j | jq -r \
    "[.[] | select(.workspace.id == $workspace and .tags != null and ((.tags | index(\"centerstage-left\")) != null or (.tags | index(\"centerstage-center\")) != null or (.tags | index(\"centerstage-right\")) != null))] | length")

if [[ "$tagged_count" -gt 0 ]]; then
    # Disable: un-float all center-stage windows
    hyprctl clients -j | jq -r \
        ".[] | select(.workspace.id == $workspace and .floating == true) | .address" | \
        while read -r addr; do
            [[ -z "$addr" ]] && continue
            hyprctl --batch \
                "dispatch settiled address:$addr" \
                "dispatch tagwindow -- -centerstage-left address:$addr" \
                "dispatch tagwindow -- -centerstage-center address:$addr" \
                "dispatch tagwindow -- -centerstage-right address:$addr"
        done

    notify-send "Center Stage" "Disabled - returned to dwindle tiling"
else
    # Enable: move all windows to center zone
    windows=$(hyprctl clients -j | jq -r ".[] | select(.workspace.id == $workspace) | .address")

    while IFS= read -r addr; do
        [[ -z "$addr" ]] && continue
        # Focus this window first
        hyprctl dispatch focuswindow "address:$addr"
        # Move it to center
        ~/.config/hypr/scripts/centerstage-move.sh center
    done <<< "$windows"

    notify-send "Center Stage" "Enabled - windows moved to center"
fi
