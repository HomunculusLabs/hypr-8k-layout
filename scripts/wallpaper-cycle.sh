#!/usr/bin/env bash
# Cycle through personal wallpapers using Omarchy Shell's background API.
set -euo pipefail

WALLPAPER_DIR="$HOME/Pictures/Wallpapers"
CURRENT_BACKGROUND_LINK="$HOME/.local/state/omarchy/current/background"

mapfile -d '' -t wallpapers < <(
    find "$WALLPAPER_DIR" -maxdepth 1 -type f \
        \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.bmp' -o -iname '*.webp' \) \
        -print0 2>/dev/null | sort -z
)

if (( ${#wallpapers[@]} == 0 )); then
    notify-send "Wallpaper" "No wallpapers found in $WALLPAPER_DIR"
    exit 1
fi

current_wallpaper=$(readlink -f "$CURRENT_BACKGROUND_LINK" 2>/dev/null || true)
current_index=-1
for i in "${!wallpapers[@]}"; do
    if [[ "${wallpapers[$i]}" == "$current_wallpaper" ]]; then
        current_index=$i
        break
    fi
done

next_index=$(( (current_index + 1) % ${#wallpapers[@]} ))
next_wallpaper="${wallpapers[$next_index]}"

omarchy theme bg set "$next_wallpaper"
notify-send "Wallpaper" "$(basename "$next_wallpaper")" -t 2000
