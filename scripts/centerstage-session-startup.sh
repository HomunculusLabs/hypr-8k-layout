#!/usr/bin/env bash
# Restore the named workstation session on workspace 1.
#
# Right-sidebar order:
#   1: SSH + Hermes profile arthur
#   2: SSH + Hermes profile surplus
#   3: local Hermes
#   4: SSH + default Hermes profile
#
# The SSH commands intentionally match the live session discovered on the
# remote Mac. The absolute Hermes path is required because SSH command mode
# does not load the remote interactive shell PATH. The handler is paused while
# windows are launched so it cannot race the explicit zone assignments.

set -Eeuo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=1
fi

readonly SCRIPTS="$HOME/.config/hypr/scripts"
readonly STATE_DIR="$HOME/.config/hypr/state"
readonly DISPATCH="$SCRIPTS/hypr-dispatch.sh"
readonly MOVE="$SCRIPTS/centerstage-move.sh"
readonly RETILE="$SCRIPTS/centerstage-retile.sh"
readonly STARTUP_LOCK="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/centerstage-session-startup.lock"

DRY_RUN_WINDOW_INDEX=0

mkdir -p "$STATE_DIR" "$(dirname "$STARTUP_LOCK")"
exec 9>"$STARTUP_LOCK"
flock -n 9 || exit 0

handler_stopped=0

log() {
    printf '[centerstage-session] %s\n' "$*" >&2
}

restart_handler() {
    local status=$?
    trap - EXIT

    if (( handler_stopped && DRY_RUN )); then
        log 'dry-run: would start centerstage-handler.service'
    elif (( handler_stopped )); then
        systemctl --user start centerstage-handler.service >/dev/null 2>&1 || \
            log 'warning: could not start centerstage-handler.service'
    fi

    exit "$status"
}
trap restart_handler EXIT

wait_for_hyprland() {
    local attempt

    (( DRY_RUN )) && return 0

    for ((attempt = 0; attempt < 60; attempt++)); do
        if hyprctl monitors -j >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.5
    done

    log 'Hyprland was not ready in time'
    return 1
}

matching_addresses() {
    local regex=$1
    hyprctl clients -j | jq -c --arg re "$regex" \
        '[.[] | select((.class // "") | test($re)) | .address]'
}

wait_for_new_window() {
    local regex=$1
    local before=$2
    local address
    local attempt

    for ((attempt = 0; attempt < 180; attempt++)); do
        address=$(hyprctl clients -j 2>/dev/null | jq -r \
            --arg re "$regex" --argjson before "$before" '
            [
                .[]
                | select((.class // "") | test($re))
                | select(.address as $address | (($before | index($address)) == null))
            ]
            | .[-1].address // empty
        ' 2>/dev/null || true)

        if [[ -n "$address" ]]; then
            printf '%s\n' "$address"
            return 0
        fi
        sleep 0.25
    done

    log "timed out waiting for window matching $regex"
    return 1
}

launch_window() {
    local regex=$1
    shift
    local before

    if (( DRY_RUN )); then
        DRY_RUN_WINDOW_INDEX=$((DRY_RUN_WINDOW_INDEX + 1))
        log "dry-run: launching: $*"
        printf 'dry-run-%s\n' "$DRY_RUN_WINDOW_INDEX"
        return 0
    fi

    before=$(matching_addresses "$regex")
    log "launching: $*"
    "$@" >/dev/null 2>&1 &
    wait_for_new_window "$regex" "$before"
}

place_window() {
    local zone=$1
    local address=$2

    if (( DRY_RUN )); then
        log "dry-run: place $address in $zone"
        return 0
    fi

    "$MOVE" "$zone" "$address"
}

wait_for_hyprland
if (( DRY_RUN )); then
    log 'dry-run: would wait two seconds for the desktop'
else
    sleep 2
fi

# Do not let the event-driven handler place windows while this script is
# assigning the saved arrangement. systemd starts it again in the EXIT trap.
if (( DRY_RUN )); then
    log 'dry-run: would stop centerstage-handler.service'
else
    systemctl --user stop centerstage-handler.service >/dev/null 2>&1 || true
fi
handler_stopped=1
if (( DRY_RUN )); then
    log 'dry-run: would clear the handler lock'
else
    rm -f "$STATE_DIR/centerstage-handler.lock"
fi

# Make the geometry deterministic for the 7680x2160 monitor.
if (( DRY_RUN )); then
    log 'dry-run: would set Centerstage width 2560, Obsidian-left mode, and fixed sidebars'
else
    printf '%s\n' 2560 > "$STATE_DIR/centerstage-center-width"
    printf '%s\n' obsidian-grid > "$STATE_DIR/centerstage-left-layout"
    printf '%s\n' 50 > "$STATE_DIR/centerstage-left-primary-ratio"
    printf '%s\n' 100 > "$STATE_DIR/centerstage-obsidian-gap"
    printf '%s\n' fixed > "$STATE_DIR/centerstage-shrink-mode"
    printf '%s\n' off > "$STATE_DIR/centerstage-pbp-mode"
    printf '%s\n' off > "$STATE_DIR/centerstage-pip-workspace-mode"
fi

if (( DRY_RUN )); then
    log 'dry-run: focus workspace 1'
else
    "$DISPATCH" workspace 1
fi

# Left side: the existing Obsidian vault, in its current left-secondary slot.
obsidian=$(launch_window 'obsidian' uwsm-app -- obsidian -disable-gpu --enable-wayland-ime)
place_window left-secondary "$obsidian"

# Middle: the default Brave window/session.
brave=$(launch_window '^brave-browser$' omarchy-launch-browser)
place_window center "$brave"

# Right side: keep the four terminal positions stable by launching them in
# the same order as the current 2x2 grid.
arthur=$(launch_window '^foot$' uwsm-app -- foot --title=arthur ssh -tt \
    t3rpz@192.168.50.86 'cd ~ && exec /Users/t3rpz/.hermes/hermes-agent/venv/bin/hermes -p arthur')
place_window right "$arthur"

surplus=$(launch_window '^foot$' uwsm-app -- foot --title=surplus ssh -tt \
    t3rpz@192.168.50.86 'cd ~ && exec /Users/t3rpz/.hermes/hermes-agent/venv/bin/hermes -p surplus')
place_window right "$surplus"

local_hermes=$(launch_window '^foot$' uwsm-app -- foot --title=hermes-local hermes)
place_window right "$local_hermes"

default_remote=$(launch_window '^foot$' uwsm-app -- foot --title=hermes ssh -tt \
    t3rpz@192.168.50.86 'cd ~ && exec /Users/t3rpz/.hermes/hermes-agent/venv/bin/hermes')
place_window right "$default_remote"

# Reapply all zones once after the four right-sidebar windows exist. The
# position tags assigned by centerstage-move.sh preserve the 1/2/3/4 order.
if (( DRY_RUN )); then
    log 'dry-run: retile left, right, and center zones; focus Brave'
else
    "$RETILE" left 1
    "$RETILE" right 1
    "$RETILE" center 1

    # Match the current session's final focus.
    "$DISPATCH" focuswindow "address:$brave"
    notify-send 'Center Stage' 'Workspace 1 session restored'
fi
log 'workspace 1 session restored'
