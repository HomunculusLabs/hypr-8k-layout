#!/usr/bin/env bash
# Isolated gesture tests only: does not reload config or touch live windows.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
for test in tests/test-centerstage-{navigation,gesture-state,gesture-bindings,gesture-stream}.lua; do
    lua "$test"
done
for file in centerstage-navigation.lua centerstage-gesture-state.lua centerstage-shape-mode.lua centerstage-gesture-stream.lua gestures.lua; do
    luac -p "$file"
done
python3 tests/test-keyboard-navigation.py -v
python3 tests/test-gesture-viewer.py -v
(
    cd spikes/001-gesture-shapes
    lua tests.lua
    lua tests-comfort.lua
)
printf '\nPASS: isolated Centerstage gesture checks completed.\n'
