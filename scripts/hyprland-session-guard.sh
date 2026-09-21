#!/usr/bin/env bash
# hyprland-session-guard.sh - supervised Hyprland starter for uwsm.
#
# Why this exists (crash classes observed Aug-Sep 2026, Hyprland 0.56.2):
#   1. Layout asserts (session killers): floating newTarget assert while an
#      XWayland popup maps (Battle.net login, twice), dwindle resizeTarget
#      assert via a hyprctl-driven resize. Upstream bugs; not fixable from
#      config.
#   2. GL/EGL asserts on the NVIDIA RTX 5070 Ti hybrid setup: the built-in
#      watchdog relaunches Hyprland with --safe-mode, and that relaunch can
#      itself die in EGL init. The watchdog then gives up and exits 0, uwsm
#      tears the whole session down, and every terminal and ssh-agent is
#      SIGKILLed (Sep 2 20:28). Recovery then requires manual greeter login.
#   3. Aquamarine DRM-backend destructor segfaults during *deliberate*
#      exits: coredumps and crash reports, but the watchdog correctly says
#      "exit cleanly". Noise, not crashes.
#
# What the guard does:
#   - Runs /usr/bin/start-hyprland (keeping its in-process watchdog and one
#     safe-mode fallback) and supervises it.
#   - Classifies each exit from what start-hyprland itself reports:
#       "exit not-cleanly"  -> crash, even if start-hyprland exits 0
#                              (the Sep 2 give-up case).
#       "exit cleanly"      -> deliberate exit; guard exits 0 and lets uwsm
#                              end the session normally (class 3 reports
#                              are ignored).
#       nonzero rc, no verdict -> crash.
#   - After a crash: notifies, backs off, and starts a fresh start-hyprland
#     (normal mode, so autostart/exec-once re-runs and the session comes
#     back), capped at MAX_CRASHES per CRASH_WINDOW; beyond that it gives up
#     so uwsm hands back to greetd.
#   - Safe-mode auto-recovery: if the watchdog's --safe-mode instance is
#     stable for a while and the config verifies, the guard replaces the
#     whole tree with a fresh normal instance (budgeted per hour). Every
#     crash here was a runtime bug, never a config error.
#   - Escalation: from the second guard-level retry on, exports
#     AQ_NO_MODIFIERS=1 (aquamarine escape hatch for NVIDIA GBM modifier
#     trouble).
#
# Installed as ExecStart of wayland-wm@hyprland.desktop.service via
# ~/.config/systemd/user/wayland-wm@hyprland.desktop.service.d/60-guard.conf
# (sorts after uwsm's generated 50_custom.conf, so it wins). If the guard
# itself misbehaves, delete that drop-in and run
# `systemctl --user daemon-reload` to return to stock start-hyprland.
#
# Test harness overrides (tests/test-hyprland-session-guard.sh):
#   HYPR_GUARD_START, HYPR_GUARD_STATE_DIR, HYPR_GUARD_CRASH_DIR,
#   HYPR_GUARD_HYPRLAND_BIN, HYPR_GUARD_FAST.

set -Eeuo pipefail

START_HYPRLAND="${HYPR_GUARD_START:-/usr/bin/start-hyprland}"
HYPRLAND_BIN="${HYPR_GUARD_HYPRLAND_BIN:-/usr/bin/Hyprland}"
STATE_DIR="${HYPR_GUARD_STATE_DIR:-${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/hypr-guard}"
CRASH_DIR="${HYPR_GUARD_CRASH_DIR:-$HOME/.cache/hyprland}"

MAX_CRASHES=5            # give up beyond this many crashes in the window
CRASH_WINDOW=1800        # seconds
SAFE_MODE_STABLE_SEC=10  # safe mode must survive this long before recovery
RECOVER_BUDGET=2         # safe-mode recoveries per hour

if [[ "${HYPR_GUARD_FAST:-0}" == 1 ]]; then
    POLL=0.2; SAFE_MODE_STABLE_SEC=1; SLEEP_SCALE=0.02
else
    POLL=1; SLEEP_SCALE=1
fi

sleep_s() { # sleep scaled down for tests
    awk -v s="$1" -v k="$SLEEP_SCALE" 'BEGIN { printf "%.2f", s * k }' | xargs sleep
}

mkdir -p "$STATE_DIR"
LOG_FILE="$STATE_DIR/guard.log"
ATTEMPT_LOG="$STATE_DIR/attempt.log"

log() {
    printf '[hypr-guard] %s\n' "$*" >&2
    printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE" 2>/dev/null || true
}

notify() {
    command -v notify-send >/dev/null 2>&1 && \
        notify-send -u critical -t 10000 "Hyprland crash guard" "$*" >/dev/null 2>&1 || true
    log "notify: $*"
}

descendents_of() { # print pids below $1 (including $1), breadth first
    local queue=("$1") pid kids kid out=()
    while ((${#queue[@]})); do
        pid=${queue[0]}
        queue=("${queue[@]:1}")
        out+=("$pid")
        kids=$(cat "/proc/$pid/task/$pid/children" 2>/dev/null) || continue
        for kid in $kids; do
            queue+=("$kid")
        done
    done
    printf '%s\n' "${out[@]}"
}

pid_in_tree_matches() { # $1 root pid, $2 substring of cmdline; prints pid
    local pid cmdline
    while read -r pid; do
        [[ -n "${pid:-}" && -d "/proc/$pid" ]] || continue
        cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || continue
        if [[ "$cmdline" == *"$2"* ]]; then
            printf '%s\n' "$pid"
            return 0
        fi
    done < <(descendents_of "$1")
    return 1
}

cgroup_sweep() { # kill any Hyprland still alive in this unit's cgroup
    local cg pid cmdline
    cg=$(awk -F: '/^0::/{print $3}' /proc/self/cgroup 2>/dev/null) || return 0
    [[ -n "$cg" ]] || return 0
    while read -r pid; do
        [[ "$pid" =~ ^[0-9]+$ && "$pid" != "$$" ]] || continue
        cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || continue
        if [[ "$cmdline" == *"Hyprland --watchdog-fd"* ]]; then
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done < "/sys/fs/cgroup$cg/cgroup.procs" 2>/dev/null
    return 0
}

term_tree() { # stop the watchdog first so it cannot relaunch, then Hyprland
    (( CHILD )) || return 0
    kill -TERM "$CHILD" 2>/dev/null || true
    local pid
    for pid in $(pid_in_tree_matches "$CHILD" "Hyprland" || true); do
        kill -TERM "$pid" 2>/dev/null || true
    done
    for _ in $(seq 1 50); do
        kill -0 "$CHILD" 2>/dev/null || break
        sleep_s 0.2
    done
    for pid in $(descendents_of "$CHILD" 2>/dev/null || true); do
        kill -KILL "$pid" 2>/dev/null || true
    done
    cgroup_sweep
    CHILD=0
}

new_crash_report_since() { # $1 epoch
    [[ -d "$CRASH_DIR" ]] || return 1
    find "$CRASH_DIR" -maxdepth 1 -name 'hyprlandCrashReport*.txt' \
        -newermt "@$1" -print -quit 2>/dev/null | grep -q .
}

config_verifies() {
    timeout 15 "$HYPRLAND_BIN" --verify-config >/dev/null 2>&1
}

recent_count() { # $1 file of epoch lines, $2 window seconds
    local file=$1 window=$2 now count=0 line
    [[ -f "$file" ]] || { printf '0\n'; return; }
    now=$(date +%s)
    while read -r line; do
        [[ "$line" =~ ^[0-9]+$ ]] || continue
        (( now - line <= window )) && count=$((count + 1))
    done < "$file"
    printf '%s\n' "$count"
}

record_event() { date +%s >> "$1"; }

CHILD=0

on_term() {
    trap - TERM INT
    log "stop requested; forwarding to Hyprland tree"
    term_tree
    exit 0
}
trap on_term TERM INT

on_exit() {
    trap - TERM INT EXIT
    term_tree
}
trap on_exit EXIT

main_loop() {
    local attempt=0

    while true; do
        local started rc=0 runtime verdict
        started=$(date +%s)

        if (( attempt >= 2 )); then
            export AQ_NO_MODIFIERS=1
            log "attempt $attempt: AQ_NO_MODIFIERS=1 enabled"
        fi

        : > "$ATTEMPT_LOG"
        log "starting $START_HYPRLAND (attempt $attempt)"
        # tee keeps the watchdog's output in the journal; the guard reads its
        # verdict ("exit not-cleanly" / "exit cleanly") from the attempt log.
        "$START_HYPRLAND" > >(tee "$ATTEMPT_LOG" >&2) 2>&1 &
        CHILD=$!

        local forced=0 safe_first_seen=""
        while (( CHILD )) && kill -0 "$CHILD" 2>/dev/null; do
            local safe_pid
            safe_pid=$(pid_in_tree_matches "$CHILD" "--safe-mode" || true)
            if [[ -n "${safe_pid:-}" ]]; then
                if [[ -z "$safe_first_seen" ]]; then
                    safe_first_seen=$(date +%s)
                    log "safe-mode instance detected (pid $safe_pid)"
                elif (( $(date +%s) - safe_first_seen >= SAFE_MODE_STABLE_SEC )) && (( ! forced )); then
                    local recover_count
                    recover_count=$(recent_count "$STATE_DIR/recover.times" 3600)
                    if (( recover_count >= RECOVER_BUDGET )); then
                        log "safe-mode recovery budget exhausted ($recover_count/h); leaving safe mode"
                        forced=2 # stop asking, keep supervising
                    elif ! config_verifies; then
                        log "config does not verify; leaving safe mode for manual repair"
                        notify "Hyprland is in safe mode and the config has errors. Fix the config, then hyprctl reload."
                        forced=2
                    else
                        forced=1
                        record_event "$STATE_DIR/recover.times"
                        log "safe mode stable and config verifies; replacing with a normal instance"
                        notify "Recovering from Hyprland crash: leaving safe mode."
                        term_tree # watchdog first, then Hyprland, then sweep
                    fi
                fi
            else
                safe_first_seen=""
            fi
            if (( forced == 1 )); then
                break
            fi
            sleep_s "$POLL"
        done

        if (( CHILD )); then
            wait "$CHILD" || rc=$?
        fi
        runtime=$(( $(date +%s) - started ))

        # tee can lag one flush behind the exiting watchdog; the verdict is
        # load-bearing, so give it a moment to land.
        local tries=0
        while (( tries++ < 20 )); do
            grep -qE 'exit (not-cleanly|cleanly)' "$ATTEMPT_LOG" 2>/dev/null && break
            sleep_s 0.05
        done

        if (( forced == 1 )); then
            log "watchdog tree replaced after safe-mode recovery (rc $rc)"
            attempt=$((attempt + 1))
            continue # straight to a fresh normal instance
        fi

        verdict=$(grep -c 'exit not-cleanly' "$ATTEMPT_LOG" 2>/dev/null) || verdict=0

        local reason=""
        if (( verdict > 0 )); then
            reason="watchdog reported unclean exit" # even when it gave up with rc 0
        elif (( rc != 0 )); then
            reason="start-hyprland exited $rc without a verdict"
        elif grep -q 'exit cleanly' "$ATTEMPT_LOG" 2>/dev/null; then
            if new_crash_report_since "$started"; then
                log "crash report ignored: exit-path segfault on deliberate exit (runtime ${runtime}s)"
            fi
            log "clean exit (rc 0)"
            exit 0
        else
            reason="start-hyprland exited $rc without a verdict"
        fi

        record_event "$STATE_DIR/crash.times"
        local crash_count latest_report
        crash_count=$(recent_count "$STATE_DIR/crash.times" "$CRASH_WINDOW")
        latest_report=$(ls -t "$CRASH_DIR"/hyprlandCrashReport*.txt 2>/dev/null | head -1 || true)
        log "Hyprland crashed after ${runtime}s (rc $rc, $reason); crash $crash_count of $MAX_CRASHES in $((CRASH_WINDOW / 60))min; report: ${latest_report:-none}"
        notify "Hyprland crashed (report ${latest_report##*/}). Auto-restarting, attempt $crash_count/$MAX_CRASHES."
        if (( crash_count > MAX_CRASHES )); then
            log "crash budget exhausted; giving up so uwsm can return to greetd"
            notify "Hyprland keeps crashing; giving up. The greeter will take over."
            exit 1
        fi

        attempt=$((attempt + 1))
        local backoff=$(( 2 ** (attempt < 6 ? attempt - 1 : 5) ))
        (( backoff > 30 )) && backoff=30
        log "backing off ${backoff}s before restart"
        sleep_s "$backoff"
    done
}

main_loop
