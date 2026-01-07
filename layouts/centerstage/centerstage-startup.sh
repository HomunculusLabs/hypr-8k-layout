#!/bin/bash
# centerstage-startup.sh - Launch EXACT workspace 1 layout
#
# Left-secondary: 2 Alacritty (btop, ssh homelab btop) - 758x930 each
# Left-primary: Obsidian - 982x1960
# Center: Brave - 2560x1960
# Right: 1 Ghostty (claude) - 1190x1960

STATE_DIR="$HOME/.config/hypr/state"

# Wait for a new window of given class to appear
wait_for_new_window() {
    local class="$1"
    local before_count="$2"
    local timeout=30
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        current=$(hyprctl clients -j | jq -r "[.[] | select(.class == \"$class\")] | length")
        if [[ "$current" -gt "$before_count" ]]; then
            # Return the newest window address
            hyprctl clients -j | jq -r ".[] | select(.class == \"$class\") | .address" | tail -1
            return 0
        fi
        sleep 0.2
        elapsed=$((elapsed + 1))
    done
    return 1
}

# Check if workspace 1 already has centerstage windows
existing=$(hyprctl clients -j | jq '[.[] | select(.workspace.id == 1 and .tags != null and (.tags | any(startswith("centerstage-"))))] | length')

if [[ "$existing" -gt 0 ]]; then
    echo "Workspace 1 already has $existing windows, skipping startup"
    notify-send "Center Stage" "Workspace 1 already set up ($existing windows)"
    exit 0
fi

# Stop handler to prevent race conditions
pkill -f centerstage-handler
rm -f "$STATE_DIR/centerstage-handler.lock"

# Set exact state values
echo "2560" > "$STATE_DIR/centerstage-center-width"
echo "grid-obsidian" > "$STATE_DIR/centerstage-left-layout"
echo "50" > "$STATE_DIR/centerstage-left-primary-ratio"
echo "540" > "$STATE_DIR/centerstage-obsidian-gap"
echo "off" > "$STATE_DIR/centerstage-shrink-mode"
echo "off" > "$STATE_DIR/centerstage-pbp-mode"

sleep 0.5

hyprctl dispatch workspace 1

# --- LEFT-SECONDARY: Tmux "system" session (btop + ssh homelab btop stacked) ---
# Position: x=80, y=100, 750x1960 (full height, tmux handles the split)
# Uses title "btop-system" so window rules can pin it in place
before=$(hyprctl clients -j | jq '[.[] | select(.class == "Alacritty")] | length')
hyprctl dispatch exec "alacritty --title 'btop-system' -e tmux new-session -d -s system 'btop' \\; split-window -v 'ssh homelab btop' \\; attach"
addr=$(wait_for_new_window "Alacritty" "$before")
if [[ -n "$addr" ]]; then
    hyprctl dispatch setfloating "address:$addr"
    hyprctl dispatch tagwindow "+centerstage-left-secondary" "address:$addr"
    hyprctl dispatch tagwindow "+centerstage-pinned" "address:$addr"
    hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact 750 1960 ; dispatch moveactive exact 80 100"
fi

# --- LEFT-PRIMARY: Obsidian ---
# Position: x=938, y=100, 982x1960
before=$(hyprctl clients -j | jq '[.[] | select(.class == "obsidian")] | length')
hyprctl dispatch exec "obsidian"
addr=$(wait_for_new_window "obsidian" "$before")
if [[ -n "$addr" ]]; then
    hyprctl dispatch setfloating "address:$addr"
    hyprctl dispatch tagwindow "+centerstage-left-primary" "address:$addr"
    hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact 982 1960 ; dispatch moveactive exact 938 100"
fi

# --- CENTER: Brave ---
# Position: x=2560, y=100, 2560x1960
before=$(hyprctl clients -j | jq '[.[] | select(.class == "brave-browser")] | length')
hyprctl dispatch exec "brave"
addr=$(wait_for_new_window "brave-browser" "$before")
if [[ -n "$addr" ]]; then
    hyprctl dispatch setfloating "address:$addr"
    hyprctl dispatch tagwindow "+centerstage-center" "address:$addr"
    hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact 2560 1960 ; dispatch moveactive exact 2560 100"
fi

# --- RIGHT: Ghostty (for claude) ---
# Position: x=6410, y=100, 1190x1960
before=$(hyprctl clients -j | jq '[.[] | select(.class == "com.mitchellh.ghostty")] | length')
hyprctl dispatch exec "ghostty"
addr=$(wait_for_new_window "com.mitchellh.ghostty" "$before")
if [[ -n "$addr" ]]; then
    hyprctl dispatch setfloating "address:$addr"
    hyprctl dispatch tagwindow "+centerstage-right" "address:$addr"
    hyprctl dispatch tagwindow "+centerstage-right-1" "address:$addr"
    hyprctl --batch "dispatch focuswindow address:$addr ; dispatch resizeactive exact 1190 1960 ; dispatch moveactive exact 6410 100"
fi

# Restart handler now that windows are positioned
sleep 0.5
$HOME/.config/hypr/layouts/centerstage/centerstage-handler.sh &

notify-send "Center Stage" "Workspace 1 ready"
