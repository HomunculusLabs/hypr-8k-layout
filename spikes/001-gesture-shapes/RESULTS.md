# Results: PARTIAL

Standalone, dependency-free Lua prototype completed in this directory only. Suitable for a recognition-only hands-on trial; NOT hardware validated or production activated.

## Created

Runtime: recognizer.lua, collector.lua, adapter.lua, gesture_shapes.lua.
Isolated exercise: fixtures.lua, tests.lua, demo.lua, verify.lua, synthetic-cw.csv.
Evidence: red.log, red-intersection.log, green.log, demo.log, replay.log, verify.log.
Documentation: README.md, SOURCE_NOTES.md, RESULTS.md.
Read-only upstream research copies: source-tree.json, query.cpp, events.cpp, rules.cpp, input.cpp, toplevel.cpp, registration.cpp, ipc.cpp, internal.cpp, config-manager.hpp, config-manager.cpp, hyprctl-main.cpp.
Pre-existing BRIEF.md unchanged.

## Actual execution

Working directory: /home/t3rpz/.config/hypr/spikes/001-gesture-shapes

- `lua -v`: Lua 5.5.1.
- `lua tests.lua > red.log 2>&1`: exit 1; 50 tests, 0 passed, 50 failed before implementation (missing modules).
- `lua tests.lua > red-intersection.log 2>&1`: exit 1; 51 tests, 50 passed, 1 failed. Embedded self-touching loop incorrectly classified circle_cw. Added original-segment crossing/touch/overlap detection rather than relying only on resampling.
- Final `lua tests.lua > green.log 2>&1`: exit 0; 56 tests, 56 passed, 0 failed.
- `lua verify.lua > verify.log`: exit 0; 8 Lua files parse, 90 synthetic parameter-sweep cases correct. 100 runs of a 512-point synthetic circle: mean 7.419 ms CPU, maximum 7.786 ms CPU (not a compositor latency guarantee).
- `lua demo.lua > demo.log`: exit 0; CW/CCW/noisy circles recognized, straight/partial/jitter/outback/figure-eight/reversal/square rejected.
- `lua demo.lua --emit-synthetic circle_cw synthetic-cw.csv`: exit 0; generated explicitly synthetic coordinate data.
- `lua demo.lua --replay synthetic-cw.csv > replay.log`: exit 0; circle_cw, quality 0.998 (heuristic, not probability).
- Final combined tests/verify/demo/replay command exited 0.
- Upstream source reads used curl. Initial Python -c retrieval attempt was blocked by tool approval policy before execution; direct curl succeeded. No packages installed.

## Native adapter and remaining validation

Inert singleton package.loaded['gesture_shapes']; explicit enable/disable/status/last. Only SUPER ALT / 3 / swipe, scale=1, disable_inhibit=false; unset uses identical tuple. Only release-time result notification; no dispatch/exec. Sticky context and keyboard cancellation, explicit submap/fullscreen/special/layer guards. Collector accumulates ONLY updates; native duplicate start-delta handled. Coordinates dropped after release; no persistent live capture.

Read README.md for exact temporary enable/status/disable commands and failed-registration cleanup. Installation was NOT exercised: no hyprctl calls, production edits, service changes, other profiles, commits, or desktop actions. API behavior was source-checked and adapter behavior mock-tested only.

Important native limitation: shortcut inhibition is checked at selection; no exposed live inhibition getter/event supports independent mid-stroke revalidation. Registration also returns nil on both success and native error; check eval output and do not unset a colliding foreign tuple after failure. Both are explicitly documented.

Parent must independently run tests/demo/replay, review code, then (only with consent) test real Magic Trackpad directions, false positives/negatives, sizes/speeds, native callback timing, key release/repress, finger changes, context guards, inhibition, tuple cleanup/re-enable, and preservation of ordinary scrolling/unmodified 3/4-finger gestures. Synthetic paths do not establish physical reliability. Two-finger shapes remain out of scope. No optional L recognizer or live trace-export feature was added.
