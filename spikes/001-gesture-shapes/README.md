# Comfortable circular-motion gestures

Tap physical Kinesis Hotkey 1, move three fingers around a relaxed loop, then lift. The result remains notification-only: `circle_cw` or `circle_ccw`. No keyboard key needs to remain held. Ordinary navigation and workspace gestures are unchanged.

The recognizer detects looping intent rather than mathematical circle precision. A rough oval, modest endpoint gap, boxy loop, small contact wobble, extra lap, or same-direction trailing arc can count. It reports at most one result on release. The viewer's end-gap measurement is informational; it is no longer a requirement to finish exactly at the starting point.

## Current behavior

- Accepts mostly completed circular motions in either direction, including the tested 0.8/0.9-turn examples.
- Accepts rough/elongated loops, modest drift, and local contact wobble.
- Recognizes a sufficient first-loop prefix even when the user continues past it before releasing.
- Uses whole-stroke direction coherence to reject substantial reversals, figure-eights, out-and-back strokes and chaotic scribbles.
- Keeps minimum movement, point-count, finite-coordinate, cancellation and duration bounds.
- Does not trigger early, repeat for extra laps, move windows or launch applications.

The latest viewer trace had been cleared when this change began. The change is grounded in the earlier observed open/partial-path failure and explicit comfort fixtures, not a claim that every physical hand movement has been calibrated. Real-device comfort and false-positive rates still need hands-on feedback.

## Algorithm

`recognizer.lua` validates a plain dense array of `{x,y}` points, copies it, and removes consecutive stationary points. It retains the existing bounds: at most 512 input points, finite coordinate magnitude at most 1,000,000, at least 12 distinct consecutive samples, path length at least 80 native gesture units, and span at least 30 units. These are not millimeters.

It resamples by arc length to 97 points and applies a short weighted smoothing window for classification only. The viewer still receives the original path. Whole-stroke heading change, directional coherence and raw/smoothed length reject non-looping or highly erratic motion. A bounded scan of initial prefixes then checks winding around a normalized bounding-box center, allowing oval geometry and imperfect closure. A useful first loop can be recognized without requiring the final release point to close it.

The contract deliberately no longer rejects every raw self-intersection: a tiny local contact wobble need not invalidate a large loop. Large figure-eights and reversing/scribbled strokes remain explicit negative tests. This is a comfortable circular-motion recognizer, not a general geometric-shape validator; an approximate polygonal loop may express the same intent.

Output is `{shape?, reason, score, metrics}`. `score` remains a heuristic quality index, not a calibrated probability. Full-path `closure` is retained for display; `turns`, `direction_consistency`, `radial_cv`, `circularity`, `loop_fraction` and related loop metrics describe the accepted prefix. `accepted_loop=1` marks success for diagnostic capture replay.

## Files and entry points

- `recognizer.lua`: pure bounded classifier.
- `collector.lua`: bounded three-finger stream collector; it accumulates updates only because native start repeats the first update delta.
- `tests-comfort.lua`: explicitly synthetic comfort and rejection cases.
- `tests.lua`, `fixtures.lua`, `verify.lua`: validation, collector/legacy-adapter regressions, synthetic variation sweep and timing.
- `demo.lua`: CLI examples and safe coordinate replay.
- `adapter.lua` and `gesture_shapes.lua`: original standalone Super+Alt experiment, retained for reference but not enabled. Do not use that awkward chord as the current entry point.
- The active one-shot controller is `../../centerstage-shape-mode.lua`; controls are documented in `../../gesture-guide.txt`.

The existing `red.log`, `red-intersection.log`, `green.log`, `RESULTS.md` and `PARENT_VERIFICATION.md` describe the earlier strict prototype, not the current comfort acceptance policy.

## Run isolated checks

    cd /home/t3rpz/.config/hypr/spikes/001-gesture-shapes
    lua tests-comfort.lua
    lua tests.lua
    lua verify.lua
    lua demo.lua
    lua demo.lua --replay synthetic-cw.csv

The comfort suite was first run against the old recognizer: its 10 permissive-motion tests failed while its rejection cases passed. With the new recognizer, all 21 comfort tests pass. The updated baseline suite passes 58 tests, including all existing bounds, collector and cancellation checks; 90 synthetic parameter variations also pass. All fixtures are explicitly synthetic, not hardware captures.

A local standalone-Lua timing run over a 512-point path returned a mean of 0.709 ms CPU and maximum 1.075 ms across 100 runs. This is an observation, not a compositor latency or frame-rate guarantee.

The real native-Lua and browser pipeline was separately exercised with an open-ended oval and overshoot, including counterclockwise classification and a nonzero displayed gap. The classifier's relaxed policy passed independent read-only review.

## Safety and remaining limits

The 5-second collector duration limit and 8-second one-shot arm timeout are unchanged. Finger changes, cancellation, changed focus/workspace, fullscreen and other existing context guards still cancel. Two-finger application scrolling/zoom and normal three/four-finger controls are unchanged.

Three fingers must translate around a path. A twist interpreted by libinput as a pinch is not the same signal. Native activation may omit a little initial subthreshold motion. Very tiny, incomplete, flattened, reversing or erratic attempts can still be rejected. The purpose is forgiving intentional looping, not accepting every stroke.

No new persistent trace collection was added. The local viewer remains memory-only and displays the actual received path. The latest result already on screen is not retroactively reclassified; start a new Hotkey 1 gesture to try the updated detector.
