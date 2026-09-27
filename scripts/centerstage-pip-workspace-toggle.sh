#!/usr/bin/env bash
# Toggle a PIP/PBP-ready layout: center on WS1, right on WS2, left on WS3.
set -euo pipefail

source "$HOME/.config/hypr/scripts/centerstage-lib.sh"

dispatch="$HOME/.config/hypr/scripts/hypr-dispatch.sh"
retile="$HOME/.config/hypr/scripts/centerstage-retile.sh"
mkdir -p "$STATE_DIR"

# Serialize rapid key presses so two toggles cannot both observe the same mode.
exec 9>"$STATE_DIR/centerstage-pip-workspace-toggle.lock"
flock 9

window_zone_filter='(.tags // []) | any(.[]; startswith("centerstage-left") or startswith("centerstage-center") or startswith("centerstage-right"))'

mode=off
[[ -f "$PIP_WORKSPACE_MODE_FILE" ]] && mode=$(<"$PIP_WORKSPACE_MODE_FILE")

if [[ "$mode" != on ]]; then
    if is_pbp_mode; then
        notify-send "PIP-ready mode" "Turn off the old PBP mode first" -t 2500
        exit 1
    fi

    clients=$(hyprctl clients -j)
    jq "[.[] | select($window_zone_filter) | {address, workspace: .workspace.id, floating: .floating, tags: (.tags // [])}]" \
        <<<"$clients" > "$PIP_WORKSPACE_SAVED_FILE"
    printf 'on\n' > "$PIP_WORKSPACE_MODE_FILE"

    jq -r '.[] | select((.tags // []) | any(.[]; startswith("centerstage-left"))) | [.address, 3] | @tsv' \
        <<<"$clients" |
        while IFS=$'\t' read -r address workspace; do
            "$dispatch" movetoworkspacesilent "$workspace,address:$address"
        done
    jq -r '.[] | select((.tags // []) | any(.[]; startswith("centerstage-right"))) | [.address, 2] | @tsv' \
        <<<"$clients" |
        while IFS=$'\t' read -r address workspace; do
            "$dispatch" movetoworkspacesilent "$workspace,address:$address"
        done
    jq -r '.[] | select((.tags // []) | any(.[]; startswith("centerstage-center"))) | [.address, 1] | @tsv' \
        <<<"$clients" |
        while IFS=$'\t' read -r address workspace; do
            "$dispatch" movetoworkspacesilent "$workspace,address:$address"
        done

    # Exact floating geometry is required because tiled windows ignore pixel
    # moves/resizes. This dispatcher toggles on this Hyprland build, so invoke
    # it only for windows that were tiled in the captured client state.
    jq -r '.[] | select(.floating == false and ((.tags // []) | any(.[]; startswith("centerstage-left") or startswith("centerstage-center") or startswith("centerstage-right")))) | .address' <<<"$clients" |
        while IFS= read -r address; do
            [[ -n "$address" ]] && "$dispatch" setfloating "address:$address"
        done

    sleep 0.15
    "$retile" center 1
    "$retile" right 2
    "$retile" left 3
    "$dispatch" workspace 1
    notify-send "PBP workspace mode" "Center: WS1  •  Right: WS2  •  Left: WS3" -t 2500
else
    clients=$(hyprctl clients -j)
    declare -A saved_addresses=()

    if [[ -f "$PIP_WORKSPACE_SAVED_FILE" ]]; then
        while IFS=$'\t' read -r address workspace floating; do
            [[ -z "$address" ]] && continue
            saved_addresses["$address"]=1
            if jq -e --arg address "$address" '.[] | select(.address == $address)' <<<"$clients" >/dev/null; then
                "$dispatch" movetoworkspacesilent "$workspace,address:$address"
                current_floating=$(jq -r --arg address "$address" '.[] | select(.address == $address) | .floating' <<<"$clients")
                if [[ "$current_floating" != "$floating" ]]; then
                    "$dispatch" setfloating "address:$address"
                fi
            fi
        done < <(jq -r '.[] | [.address, .workspace, .floating] | @tsv' "$PIP_WORKSPACE_SAVED_FILE")
    fi

    # Windows opened while the mode was active join the normal WS1 layout.
    while IFS= read -r address; do
        [[ -z "$address" || -n "${saved_addresses[$address]:-}" ]] && continue
        "$dispatch" movetoworkspacesilent "1,address:$address"
    done < <(jq -r ".[] | select($window_zone_filter) | .address" <<<"$clients")

    printf 'off\n' > "$PIP_WORKSPACE_MODE_FILE"
    rm -f "$PIP_WORKSPACE_SAVED_FILE"
    sleep 0.15
    for workspace in 1 2 3; do
        "$retile" left "$workspace"
        "$retile" right "$workspace"
        "$retile" center "$workspace"
    done
    "$dispatch" workspace 1
    notify-send "PIP-ready mode" "Centerstage workspaces restored" -t 2000
fi
