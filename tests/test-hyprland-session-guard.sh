#!/usr/bin/env bash
# test-hyprland-session-guard.sh - exercise every classification and recovery
# path of scripts/hyprland-session-guard.sh using fake binaries. Never touches
# the live Hyprland session, real crash dir, or real guard state.
set -uo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
GUARD="$ROOT/scripts/hyprland-session-guard.sh"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/hypr-guard-test.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

FAKE_BIN="$WORK/bin"
mkdir -p "$FAKE_BIN"

# Stub notify-send so guard tests never notify the real desktop.
cat > "$FAKE_BIN/notify-send" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$FAKE_BIN/notify-send"
PATH="$FAKE_BIN:$PATH"

# Fake Hyprland: succeeds for --verify-config.
cat > "$FAKE_BIN/Hyprland" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$FAKE_BIN/Hyprland"

# Fake start-hyprland. Behavior selected by FAKE_MODE; stateful modes use a
# counter file ($FAKE_HOME/counter). Verdict strings mirror the real
# watchdog's journal output.
cat > "$FAKE_BIN/start-hyprland" <<EOF
#!/usr/bin/env bash
mode=\${FAKE_MODE:-clean}
counter_file="\$FAKE_HOME/counter"
n=\$(cat "\$counter_file" 2>/dev/null || printf 0)
n=\$((n + 1))
printf '%s' "\$n" > "\$counter_file"

case "\$mode" in
  clean)
    printf 'Hyprland exit cleanly.\n'
    exit 0
    ;;
  watchdog-gave-up)      # Sep 2 class: safe-mode relaunch died, rc still 0
    if (( n == 1 )); then
      printf 'Hyprland exit not-cleanly, restarting\n'
      printf 'Hyprland exit cleanly.\n'
    else
      printf 'Hyprland exit cleanly.\n'
    fi
    exit 0
    ;;
  silent-nonzero)        # crash without any watchdog verdict
    if (( n == 1 )); then exit 3; fi
    printf 'Hyprland exit cleanly.\n'
    exit 0
    ;;
  exit-path-segfault)    # deliberate exit that segfaults on the way out
    printf 'Hyprland exit cleanly.\n'
    : > "\$FAKE_CRASH_DIR/hyprlandCrashReport\$$.txt"
    exit 0
    ;;
  crash-loop)            # crash forever: guard must exhaust its budget
    printf 'Hyprland exit not-cleanly, restarting\n'
    : > "\$FAKE_CRASH_DIR/hyprlandCrashReport\$$.txt"
    printf 'Hyprland exit not-cleanly, restarting\n'
    printf 'Hyprland exit cleanly.\n'
    exit 0
    ;;
  safe-mode-then-ok)     # first run parks in safe mode; second run is clean
    if (( n == 1 )); then
      exec -a "Hyprland --watchdog-fd 4 --safe-mode" /bin/sleep 30
    fi
    printf 'Hyprland exit cleanly.\n'
    exit 0
    ;;
  forever)               # stable instance; used for the SIGTERM path test
    exec -a "Hyprland --watchdog-fd 4" /bin/sleep 300
    ;;
esac
exit 99
EOF
chmod +x "$FAKE_BIN/start-hyprland"

FAILURES=0
RUN_RC=0
mode_current=""

run_guard() { # $1=mode, $2=state dir
    local mode=$1 state=$2
    mode_current=$mode
    rm -rf "$state" "$WORK/crashdir.$mode" "$WORK/counter"; mkdir -p "$state" "$WORK/crashdir.$mode"
    FAKE_MODE="$mode" \
    FAKE_HOME="$WORK" \
    FAKE_CRASH_DIR="$WORK/crashdir.$mode" \
    HYPR_GUARD_START="$FAKE_BIN/start-hyprland" \
    HYPR_GUARD_HYPRLAND_BIN="$FAKE_BIN/Hyprland" \
    HYPR_GUARD_STATE_DIR="$state" \
    HYPR_GUARD_CRASH_DIR="$WORK/crashdir.$mode" \
    HYPR_GUARD_FAST=1 \
    timeout 25 "$GUARD" > "$WORK/out.$mode" 2>&1
    RUN_RC=$?
}

check() { # $1 description, $2 expected, $3 actual
    if [[ "$2" == "$3" ]]; then
        printf '  ok: %s\n' "$1"
    else
        printf '  FAIL: %s (expected %q, got %q)\n' "$1" "$2" "$3"
        FAILURES=$((FAILURES + 1))
    fi
}

in_log() { # $1 mode, $2 pattern -> single count, 0 when absent
    local n
    n=$(grep -c -- "$2" "$WORK/out.$1" 2>/dev/null) || n=0
    printf '%s\n' "$n"
}

lines_in() { # $1 file -> count, 0 when missing
    [[ -f "$1" ]] || { printf '0\n'; return; }
    wc -l < "$1"
}

# --- 1. Clean exit ------------------------------------------------------------
printf 'scenario: clean exit\n'
run_guard clean "$WORK/state.clean"
check 'guard exits 0' 0 "$RUN_RC"
check 'clean exit logged' 1 "$(in_log clean 'clean exit (rc 0)')"
check 'no crash recorded' 0 "$(lines_in "$WORK/state.clean/crash.times")"

# --- 2. Watchdog gave up (Sep 2 class): rc 0 + not-cleanly verdict = crash ----
printf 'scenario: watchdog gave up after safe-mode death\n'
run_guard watchdog-gave-up "$WORK/state.wu"
check 'guard exits 0 (second attempt clean)' 0 "$RUN_RC"
check 'crash classified from verdict' 1 "$(in_log watchdog-gave-up 'Hyprland crashed after')"
check 'crash counted once' 1 "$(lines_in "$WORK/state.wu/crash.times")"

# --- 3. Silent nonzero exit = crash -------------------------------------------
printf 'scenario: silent nonzero crash then recovery\n'
run_guard silent-nonzero "$WORK/state.sn"
check 'guard exits 0' 0 "$RUN_RC"
check 'treated as crash' 1 "$(in_log silent-nonzero 'without a verdict')"
check 'crash counted' 1 "$(lines_in "$WORK/state.sn/crash.times")"

# --- 4. exit-path segfault is NOT a crash -------------------------------------
printf 'scenario: exit-path destructor segfault on deliberate exit\n'
run_guard exit-path-segfault "$WORK/state.eps"
check 'guard exits 0' 0 "$RUN_RC"
check 'report ignored' 1 "$(in_log exit-path-segfault 'exit-path segfault')"
check 'no crash counted' 0 "$(lines_in "$WORK/state.eps/crash.times")"

# --- 5. crash loop exhausts budget --------------------------------------------
printf 'scenario: crash loop exhausts budget\n'
run_guard crash-loop "$WORK/state.cl"
check 'guard gives up with rc 1' 1 "$RUN_RC"
check 'budget exhausted logged' 1 "$(( $(in_log crash-loop 'crash budget exhausted') >= 1 ? 1 : 0 ))"
check 'AQ_NO_MODIFIERS escalation' 1 "$(( $(in_log crash-loop 'AQ_NO_MODIFIERS=1 enabled') >= 1 ? 1 : 0 ))"
check 'crash times recorded' 1 "$(( $(lines_in "$WORK/state.cl/crash.times") >= 6 ? 1 : 0 ))"

# --- 6. safe-mode auto-recovery -----------------------------------------------
printf 'scenario: safe-mode stable, config verifies -> normal restart\n'
run_guard safe-mode-then-ok "$WORK/state.sm"
check 'guard exits 0' 0 "$RUN_RC"
check 'safe mode detected' 1 "$(in_log safe-mode-then-ok 'safe-mode instance detected')"
check 'recovery decision' 1 "$(in_log safe-mode-then-ok 'stable and config verifies; replacing')"
check 'recovery recorded' 1 "$(lines_in "$WORK/state.sm/recover.times")"
check 'no crash from forced replacement' 0 "$(in_log safe-mode-then-ok 'Hyprland crashed after')"

# --- 7. SIGTERM (uwsm session stop) exits cleanly, no crash bookkeeping ------
printf 'scenario: SIGTERM stop while Hyprland runs\n'
state="$WORK/state.term"
rm -rf "$state" "$WORK/crashdir.forever" "$WORK/counter"; mkdir -p "$state" "$WORK/crashdir.forever"
FAKE_MODE=forever \
FAKE_HOME="$WORK" \
FAKE_CRASH_DIR="$WORK/crashdir.forever" \
HYPR_GUARD_START="$FAKE_BIN/start-hyprland" \
HYPR_GUARD_HYPRLAND_BIN="$FAKE_BIN/Hyprland" \
HYPR_GUARD_STATE_DIR="$state" \
HYPR_GUARD_CRASH_DIR="$WORK/crashdir.forever" \
HYPR_GUARD_FAST=1 \
    "$GUARD" > "$WORK/out.term" 2>&1 &
GUARD_PID=$!
sleep 2
kill -TERM "$GUARD_PID"
TERM_RC=0
wait "$GUARD_PID" || TERM_RC=$?
check 'guard exits 0 on TERM' 0 "$TERM_RC"
check 'stop forwarded' 1 "$(in_log term 'stop requested')"
check 'no crash recorded on stop' 0 "$(lines_in "$state/crash.times")"
# Match only fakes (comm=sleep); the real Hyprland matches this pattern too.
leaked=$(ps -eo comm,args | awk '$1=="sleep" && $0 ~ /--watchdog-fd/' | wc -l)
check 'no leaked fake Hyprland' 0 "$leaked"

printf '\n'
if (( FAILURES )); then
    printf 'FAIL: %d check(s) failed\n' "$FAILURES"
    exit 1
fi
printf 'PASS: hyprland-session-guard checks completed\n'
