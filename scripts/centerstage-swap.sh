#!/bin/bash
# Reorder using existing cell rectangles, or move to the adjacent visual zone.
# All changes are address-targeted; keyboard focus stays on the chosen window.
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
source "$HOME/.config/hypr/scripts/centerstage-plan.sh"

DIRECTION="${1:-}"
[[ "$DIRECTION" =~ ^(up|down|left|right)$ ]] || exit 1
centerstage_begin || exit 1
focused_addr=$(hyprctl activewindow -j | jq -r '.address // empty') || exit 1
[[ "$focused_addr" =~ ^0x[[:xdigit:]]+$ ]] || exit 1
workspace=${CS_WORKSPACE[$focused_addr]:-}
[[ "$workspace" =~ ^[1-3]$ ]] || exit 1
current_zone=""
for zone in left-primary left-secondary left center right; do
    if [[ "${CS_TAGS[$focused_addr]}" == *" centerstage-$zone "* ]]; then
        current_zone=$zone
        break
    fi
done
[[ -n "$current_zone" ]] || exit 1

if [[ "$DIRECTION" == left || "$DIRECTION" == right ]]; then
    case "$(get_left_layout_mode)" in
        single) zones=(left center right) ;;
        grid-obsidian) zones=(left-secondary left-primary center right) ;;
        *) zones=(left-primary left-secondary center right) ;;
    esac
    for i in "${!zones[@]}"; do
        [[ "${zones[$i]}" == "$current_zone" ]] || continue
        if [[ "$DIRECTION" == left ]]; then target=$((i - 1)); else target=$((i + 1)); fi
        (( target >= 0 && target < ${#zones[@]} )) || exit 0
        centerstage_change_zone "$focused_addr" "${zones[$target]}" || exit 1
        centerstage_commit
        exit $?
    done
    exit 0
fi

mapfile -t windows < <(jq -r --arg tag "centerstage-$current_zone" --argjson ws "$workspace" '
    [.[] | select(.workspace.id == $ws and ((.tags // []) | index($tag)))]
    | sort_by([.at[1], .at[0]]) | .[].address' <<< "$CENTERSTAGE_CLIENTS")
count=${#windows[@]}
(( count >= 2 )) || exit 0
focused_idx=-1
for i in "${!windows[@]}"; do
    [[ "${windows[$i]}" == "$focused_addr" ]] && focused_idx=$i
done
(( focused_idx >= 0 )) || exit 1
read -r cols rows <<< "$(calculate_grid "$count")"
if [[ "$DIRECTION" == up ]]; then step=-1; else step=1; fi
if (( cols == 1 )); then
    swap_idx=$(((focused_idx + step + count) % count))
else
    row=$((focused_idx / cols))
    swap_idx=$((((row + step + rows) % rows) * cols + focused_idx % cols))
    (( swap_idx < count )) || swap_idx=$((count - 1))
fi
(( swap_idx != focused_idx )) || exit 0
other=${windows[$swap_idx]}
read -r x y width height <<< "${CS_GEOMETRY[$other]}"
centerstage_place "$focused_addr" "$x" "$y" "$width" "$height" || exit 1
read -r x y width height <<< "${CS_GEOMETRY[$focused_addr]}"
centerstage_place "$other" "$x" "$y" "$width" "$height" || exit 1
if [[ "$current_zone" == right ]]; then
    for i in "$focused_idx" "$swap_idx"; do
        addr=${windows[$i]}
        if [[ "$i" -eq "$focused_idx" ]]; then position=$((swap_idx + 1)); else position=$((focused_idx + 1)); fi
        for pos in {1..9}; do
            [[ "$pos" -eq "$position" ]] && continue
            centerstage_tag "$addr" "-centerstage-right-$pos" || exit 1
        done
        centerstage_tag "$addr" "+centerstage-right-$position" || exit 1
    done
fi
centerstage_commit
