#!/bin/bash
# Swap the focused window with a center-zone window, 1:1.
# All operations are address-targeted. When the swap finishes, the window
# now holding the center cell is focused: on a forward swap that is the
# user's own window (no focus change); on swap-back focus follows the
# partner returning to center. The last swapped pair is remembered per
# workspace: focusing the window now holding the center cell and tapping
# again swaps straight back with the same partner, even when it is no
# longer the first cell by reading order. Stale memories (closed, moved,
# or address-reused windows) fall back to the first center cell by
# reading order.
source "$HOME/.config/hypr/scripts/centerstage-lib.sh"
source "$HOME/.config/hypr/scripts/centerstage-transaction.sh"

centerstage_begin || exit 1
focused_addr=$(hyprctl activewindow -j | jq -r '.address // empty') || exit 1
[[ "$focused_addr" =~ ^0x[[:xdigit:]]+$ ]] || exit 1
workspace=${CS_WORKSPACE[$focused_addr]:-}
[[ "$workspace" =~ ^[1-3]$ ]] || exit 1
active_workspace=$(hyprctl activeworkspace -j | jq -r '.id // 0')
is_pbp_mode && { printf 'Centerstage: center zone is unavailable in PBP mode\n' >&2; exit 1; }
current_zone=""
for zone in left-primary left-secondary left center right; do
    if [[ "${CS_TAGS[$focused_addr]}" == *" centerstage-$zone "* ]]; then
        current_zone=$zone
        break
    fi
done
[[ -n "$current_zone" ]] || exit 1

stable_id() {
    jq -r --arg addr "$1" 'first(.[] | select(.address == $addr) | .stableId // empty)' <<< "$CENTERSTAGE_CLIENTS"
}

SWAP_STATE_FILE="$STATE_DIR/centerstage-swap-last-$workspace"
target_addr=""
# Swap-back: the focused window is the center member of the last swap.
if [[ "$current_zone" == center && -f "$SWAP_STATE_FILE" ]]; then
    read -r saved_center saved_center_stable saved_partner saved_partner_stable < "$SWAP_STATE_FILE"
    if [[ "$saved_center" == "$focused_addr" && "$saved_partner" =~ ^0x[[:xdigit:]]+$ ]] \
        && [[ "$saved_partner" != "$focused_addr" ]] \
        && [[ -n "${CS_GEOMETRY[$saved_partner]:-}" ]] \
        && [[ "${CS_WORKSPACE[$saved_partner]:-}" == "$workspace" ]] \
        && [[ -n "${CS_ZONE_TAGS[$saved_partner]:-}" ]] \
        && [[ "$(stable_id "$focused_addr")" == "$saved_center_stable" ]] \
        && [[ -n "$saved_center_stable" ]] \
        && [[ "$(stable_id "$saved_partner")" == "$saved_partner_stable" ]] \
        && [[ -n "$saved_partner_stable" ]]; then
        target_addr=$saved_partner
    fi
fi
# Default: the window "in the middle of center stage", first by cell order.
if [[ -z "$target_addr" ]]; then
    target_addr=$(jq -r --arg focused "$focused_addr" --argjson ws "$workspace" '
        [.[] | select(.workspace.id == $ws and ((.tags // []) | index("centerstage-center")) and .address != $focused)]
        | sort_by([.at[1], .at[0]]) | (first.address // "none")' <<< "$CENTERSTAGE_CLIENTS")
fi
[[ "$target_addr" =~ ^0x[[:xdigit:]]+$ ]] || exit 1
target_zone=""
for zone in left-primary left-secondary left center right; do
    if [[ "${CS_TAGS[$target_addr]}" == *" centerstage-$zone "* ]]; then
        target_zone=$zone
        break
    fi
done
[[ -n "$target_zone" ]] || exit 1
# A swap is a pair operation: never apply just one half of a stale snapshot.
CENTERSTAGE_COMMANDS+=("if not cs_snapshot['$focused_addr'] or not cs_snapshot['$target_addr'] then return end")
read -r x y width height <<< "${CS_GEOMETRY[$target_addr]}"
centerstage_place "$focused_addr" "$x" "$y" "$width" "$height" || exit 1
read -r x y width height <<< "${CS_GEOMETRY[$focused_addr]}"
centerstage_place "$target_addr" "$x" "$y" "$width" "$height" || exit 1
# Same-zone swaps exchange geometry only; cross-zone swaps also exchange
# membership in either direction, transferring right-zone position tags with
# the inherited cell.
if [[ "$current_zone" != "$target_zone" ]]; then
    for old_tag in ${CS_ZONE_TAGS[$focused_addr]}; do
        centerstage_tag "$focused_addr" "-$old_tag" || exit 1
        centerstage_tag "$target_addr" "+$old_tag" || exit 1
    done
    for old_tag in ${CS_ZONE_TAGS[$target_addr]}; do
        centerstage_tag "$target_addr" "-$old_tag" || exit 1
        centerstage_tag "$focused_addr" "+$old_tag" || exit 1
    done
fi
# Focus the window now in center stage when the swap finishes: on a forward
# swap that is the user's own window; on swap-back it is the partner. A
# background-workspace swap must never drag the user to another workspace.
if [[ "$current_zone" != center ]]; then
    new_center=$focused_addr new_partner=$target_addr
elif [[ "$target_zone" != center ]]; then
    new_center=$target_addr new_partner=$focused_addr
else
    new_center=$focused_addr new_partner=$target_addr
fi
if [[ "$active_workspace" == "$workspace" ]]; then
    CENTERSTAGE_COMMANDS+=("if cs_snapshot['$new_center'] then
        hl.dispatch(hl.dsp.focus({window='address:$new_center'}))
    end")
fi
centerstage_commit || exit 1
# Remember the pair: whichever window now holds the center cell, and its
# partner. A reverse swap flips the record, so repeated taps ping-pong.
printf '%s %s %s %s\n' "$new_center" "$(stable_id "$new_center")" \
    "$new_partner" "$(stable_id "$new_partner")" > "$SWAP_STATE_FILE"
