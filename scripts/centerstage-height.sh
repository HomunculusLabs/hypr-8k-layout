#!/bin/bash
# Cycle a workspace's center-region height; preserve it through later reflows.
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
source "$HOME/.config/hypr/scripts/centerstage-plan.sh"
centerstage_begin || exit 1
workspace=${1:-$(hyprctl activeworkspace -j | jq -r '.id')}
[[ "$workspace" =~ ^[1-3]$ ]] || exit 1
current=$(jq -r --argjson ws "$workspace" '
    [.[] | select(.workspace.id == $ws and ((.tags // []) | index("centerstage-center")))] |
    if length == 0 then empty else (map(.at[1] + .size[1]) | max) - (map(.at[1]) | min) end' <<< "$CENTERSTAGE_CLIENTS")
[[ -n "$current" ]] || exit 1
height_target="$STATE_DIR/centerstage-center-height-$workspace"
if [[ -f "$height_target" ]]; then
    saved=$(<"$height_target")
    case "$saved" in 1080|1200|1400|1600|1800|1960) current=$saved ;; esac
fi
heights=(1080 1200 1400 1600 1800 1960)
next=${heights[0]}
for i in "${!heights[@]}"; do
    [[ "$current" == "${heights[$i]}" ]] && next=${heights[$(((i + 1) % ${#heights[@]}))]}
done
pending=$(mktemp "$STATE_DIR/.centerstage-height.XXXXXX") || exit 1
trap 'rm -f -- "$pending"' EXIT
printf '%s\n' "$next" > "$pending" || exit 1
CENTERSTAGE_HEIGHT_FILE=$pending
centerstage_plan_zone center "$workspace" || exit 1
centerstage_commit || exit 1
centerstage_verify || exit 1
mv -- "$pending" "$height_target"
