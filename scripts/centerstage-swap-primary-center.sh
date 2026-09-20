#!/bin/bash
# Swap left-primary with one center cell without intermediate focus changes.
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"
centerstage_begin || exit 1
active_workspace=$(hyprctl activeworkspace -j | jq -r '.id') || exit 1
workspace=${1:-$active_workspace}
[[ "$workspace" =~ ^[1-3]$ ]] || exit 1
[[ "$(get_left_layout_mode)" != single ]] || exit 1
read -r primary_addr center_addr < <(jq -r --argjson ws "$workspace" '
    map(select(.workspace.id == $ws)) as $windows |
    ["centerstage-left-primary", "centerstage-center"] |
    map(. as $tag | [$windows[] | select((.tags // []) | index($tag))] |
        sort_by([.at[1], .at[0]]) | first.address // "none") | @tsv' <<< "$CENTERSTAGE_CLIENTS")
[[ "$primary_addr" =~ ^0x[[:xdigit:]]+$ && "$center_addr" =~ ^0x[[:xdigit:]]+$ ]] || exit 1
[[ "$primary_addr" != "$center_addr" ]] || exit 1
# A swap is a pair operation: never apply just one half of a stale snapshot.
CENTERSTAGE_COMMANDS+=("if not cs_snapshot['$primary_addr'] or not cs_snapshot['$center_addr'] then return end")
read -r x y width height <<< "${CS_GEOMETRY[$center_addr]}"
centerstage_place "$primary_addr" "$x" "$y" "$width" "$height" || exit 1
read -r x y width height <<< "${CS_GEOMETRY[$primary_addr]}"
centerstage_place "$center_addr" "$x" "$y" "$width" "$height" || exit 1
centerstage_tag "$primary_addr" -centerstage-left-primary || exit 1
centerstage_tag "$primary_addr" +centerstage-center || exit 1
centerstage_tag "$center_addr" -centerstage-center || exit 1
centerstage_tag "$center_addr" +centerstage-left-primary || exit 1
# Promotion deliberately focuses the new center, but a background workspace
# operation must not drag the user away from their current workspace.
if [[ "$workspace" == "$active_workspace" ]]; then
    CENTERSTAGE_COMMANDS+=("if cs_snapshot['$primary_addr'] and cs_snapshot['$center_addr'] then
        hl.dispatch(hl.dsp.focus({window='address:$primary_addr'}))
    end")
fi
centerstage_commit
