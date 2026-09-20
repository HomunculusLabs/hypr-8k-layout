#!/bin/bash
# Cycle left layout with one guarded batch, without changing keyboard focus.
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
source "$HOME/.config/hypr/scripts/centerstage-plan.sh"
[[ $# -le 2 && ( $# -lt 2 || "$2" == --initialize ) ]] || exit 1
centerstage_begin || exit 1
workspace=${1:-$(hyprctl activeworkspace -j | jq -r '.id')}
[[ "$workspace" =~ ^[1-3]$ ]] || exit 1
if is_pbp_mode; then
    notify-send "Center Stage" "Left layout is fixed in PBP mode"
    exit 1
fi
current_mode=$(get_left_layout_mode "$workspace")
# The handler may wait behind a user's adjustment: recheck intent under lock.
if [[ "${2:-}" == --initialize && ( -f "$LEFT_LAYOUT_FILE-$workspace" || "$current_mode" != single ) ]]; then
    exit 0
fi
case "$current_mode" in
    single) new_mode=obsidian-grid ;;
    obsidian-grid) new_mode=grid-obsidian ;;
    grid-obsidian) new_mode=equal-split ;;
    *) new_mode=single ;;
esac
mode_target="$LEFT_LAYOUT_FILE-$workspace"
pending=$(mktemp "$STATE_DIR/.centerstage-left-layout.XXXXXX") || exit 1
trap 'rm -f -- "$pending"' EXIT
printf '%s\n' "$new_mode" > "$pending" || exit 1
LEFT_LAYOUT_FILE=$pending
mapfile -t windows < <(jq -r --argjson ws "$workspace" '
    .[] | select(.workspace.id == $ws and
        ((.tags // []) | any(. == "centerstage-left" or
         . == "centerstage-left-primary" or . == "centerstage-left-secondary")))
    | .address' <<< "$CENTERSTAGE_CLIENTS")
# A layout migration is a group operation: do not retag only half the sidebar.
for addr in "${windows[@]}"; do
    CENTERSTAGE_COMMANDS+=("if not cs_snapshot['$addr'] then return end")
done
for addr in "${windows[@]}"; do
    if [[ "$new_mode" == single ]]; then
        tag=centerstage-left
    elif [[ "${CS_TAGS[$addr]}" == *" centerstage-left-primary "* ]]; then
        tag=centerstage-left-primary
    elif [[ "${CS_TAGS[$addr]}" == *" centerstage-left-secondary "* ]]; then
        tag=centerstage-left-secondary
    elif [[ "$(jq -r --arg addr "$addr" '.[] | select(.address == $addr) | .class' <<< "$CENTERSTAGE_CLIENTS")" == obsidian ]]; then
        tag=centerstage-left-primary
    else
        tag=centerstage-left-secondary
    fi
    for old_tag in ${CS_ZONE_TAGS[$addr]}; do
        [[ "$old_tag" == "$tag" ]] || centerstage_tag "$addr" "-$old_tag" || exit 1
    done
    centerstage_tag "$addr" "+$tag" || exit 1
    CENTERSTAGE_CLIENTS=$(jq -c --arg addr "$addr" --arg tag "$tag" '
        map(if .address == $addr then
            .tags = ((.tags // []) | map(select(test("^centerstage-(left(-(primary|secondary))?|center|right(-[1-9][0-9]*)?)$") | not)) + [$tag])
        else . end)' <<< "$CENTERSTAGE_CLIENTS") || exit 1
done
centerstage_plan_zone left "$workspace" || exit 1
centerstage_commit || exit 1
centerstage_verify || exit 1
mv -- "$pending" "$mode_target" || exit 1
notify-send "Center Stage" "Left sidebar: $new_mode"
