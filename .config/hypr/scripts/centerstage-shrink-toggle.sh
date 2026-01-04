#!/bin/bash
# centerstage-shrink-toggle.sh - Toggle between auto and fixed sidebar shrink mode

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

read_state

if [[ "$shrink_mode" == "auto" ]]; then
    echo "fixed" > "$SHRINK_MODE_FILE"
    notify-send "Center Stage" "Sidebar shrink: Fixed"
else
    echo "auto" > "$SHRINK_MODE_FILE"
    notify-send "Center Stage" "Sidebar shrink: Auto"

    # Apply shrink immediately
    workspace=$(hyprctl activeworkspace -j | jq -r .id)
    if [[ "$workspace" -ge 1 && "$workspace" -le 3 ]]; then
        # Trigger retile to apply shrink
        ~/.config/hypr/scripts/centerstage-retile.sh left "$workspace"
        ~/.config/hypr/scripts/centerstage-retile.sh right "$workspace"
    fi
fi
