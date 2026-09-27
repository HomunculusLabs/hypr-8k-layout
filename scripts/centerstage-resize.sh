#!/bin/bash
# Cycle center width without changing focus or flattening sidebar grids.
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
source "$HOME/.config/hypr/scripts/centerstage-plan.sh"
centerstage_begin || exit 1
if is_pip_workspace_mode || is_pbp_mode; then
    printf 'Centerstage: center width is fixed in PIP/PBP mode\n' >&2
    notify-send "Center Stage" "Center width is fixed in PIP/PBP mode"
    exit 1
fi
workspace=${1:-$(hyprctl activeworkspace -j | jq -r '.id')}
[[ "$workspace" =~ ^[1-3]$ ]] || exit 1
mapfile -t centers < <(jq -r --argjson ws "$workspace" '
    .[] | select(.workspace.id == $ws and ((.tags // []) | index("centerstage-center"))) | .address' <<< "$CENTERSTAGE_CLIENTS")
[[ ${#centers[@]} -gt 0 ]] || exit 1
read_state
sizes=(1920 2200 2560 3000 3840)
current=$(jq -r --argjson ws "$workspace" '
    [.[] | select(.workspace.id == $ws and ((.tags // []) | index("centerstage-center")))] |
    if length == 0 then empty
    else (map(.at[0] + .size[0]) | max) - (map(.at[0]) | min)
    end' <<< "$CENTERSTAGE_CLIENTS")
[[ "$current" =~ ^[0-9]+$ ]] || exit 1
next=${sizes[0]}
for i in "${!sizes[@]}"; do
    [[ "$current" == "${sizes[$i]}" ]] && next=${sizes[$(((i + 1) % ${#sizes[@]}))]}
done
if [[ ${#centers[@]} -eq 1 && "${CS_WOW[${centers[0]}]:-}" == true ]]; then
    # WoW's fitted viewport can be narrower than its nominal slot (e.g. 2992
    # in a 3000px slot). Advance by visible fitted widths, not exact presets
    # or another workspace's globally saved preference. Skip height-limited
    # duplicate sizes rather than making the shortcut appear stuck.
    next=${sizes[0]}
    height_limit=$TOTAL_HEIGHT
    height_file="$STATE_DIR/centerstage-center-height-$workspace"
    if [[ -f "$height_file" ]]; then
        saved_height=$(<"$height_file")
        case "$saved_height" in 1080|1200|1400|1600|1800|1960) height_limit=$saved_height ;; esac
    fi
    for candidate in "${sizes[@]}"; do
        fit_units=$((candidate / 16))
        (( height_limit / 9 < fit_units )) && fit_units=$((height_limit / 9))
        if (( fit_units * 16 > current )); then next=$candidate; break; fi
    done
fi
# Plan against a private pending state file; publish only after successful IPC.
width_target=$WIDTH_FILE
pending=$(mktemp "$STATE_DIR/.centerstage-width.XXXXXX") || exit 1
trap 'rm -f -- "$pending"' EXIT
printf '%s\n' "$next" > "$pending" || exit 1
WIDTH_FILE=$pending
for zone in left right; do
    centerstage_plan_zone "$zone" "$workspace" || exit 1
done
if [[ ${#centers[@]} -eq 1 && "${CS_WOW[${centers[0]}]:-}" != true ]]; then
    read -r new_x new_width _ <<< "$(get_zone_dimensions center)"
    read -r _ old_y _ old_height <<< "${CS_GEOMETRY[${centers[0]}]}"
    centerstage_place "${centers[0]}" "$new_x" "$old_y" "$new_width" "$old_height" || exit 1
else
    centerstage_plan_zone center "$workspace" || exit 1
fi
centerstage_commit || exit 1
centerstage_verify || exit 1
mv -- "$pending" "$width_target"
