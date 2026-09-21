#!/usr/bin/env bash
# Default: isolated tests only. --live also creates temporary desktop probes.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export ROOT
live=false
case "${1:-}" in
    "") ;;
    --live) live=true ;;
    --help|-h)
        printf 'Usage: %s [--live]\nDefault: isolated regressions and syntax checks.\n--live: also test temporary windows on unused workspace 3, then restore settings.\n' "$0"
        exit 0
        ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { printf 'Too many arguments\n' >&2; exit 2; }
cd -- "$ROOT"
for test in tests/test-centerstage-{controls,interactions,smoothness,handler,motion,live-runner}.py; do
    python3 "$test" -v
done
for test in tests/test-centerstage-{config,migration,pip-workspaces,pip-workspace-edge-cases}.sh; do
    bash "$test"
done
for script in scripts/centerstage-{lib,transaction,plan,move,retile,reflow,swap,swap-primary-center,resize,height,left-layout,handler}.sh; do
    bash -n "$script"
done
bash -n scripts/hyprland-session-guard.sh
bash tests/test-hyprland-session-guard.sh
luac -p looknfeel.lua
if "$live"; then
    python3 tests/verify-centerstage-live.py
fi
printf '\nPASS: Centerstage checks completed%s.\n' "$(if "$live"; then printf ' including live desktop probes'; fi)"
