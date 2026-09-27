# Parent verification of the original standalone trial

Historical trial record: the Super+Alt entry described below has been disabled and superseded by the one-shot Kinesis Hotkey 1 integration. See `/home/t3rpz/.config/hypr/gesture-guide.txt` for the active controls.

The Astra child session was `20260920_084835_a50f43`, explicitly launched with model `gpt-6-astra` through Hermes. Its stream initialization confirmed that model. The child completed without changing production desktop configuration.

## Independently exercised

- `lua tests.lua`: 56 tests passed, 0 failed.
- `lua verify.lua`: 8 Lua files parsed; 90 synthetic parameter-sweep cases classified with the correct direction. The measured 512-point synthetic path averaged 7.465 ms CPU over 100 runs, maximum 7.692 ms CPU. This is a local observation, not a real-time guarantee.
- `lua demo.lua` and `lua demo.lua --replay synthetic-cw.csv`: executed successfully; CW/CCW classification and rejection examples are explicitly synthetic.
- Reviewed the recognizer, collector, adapter, and singleton. The adapter has no application/window/system-action dispatch; its result is a notification only.
- Loaded the inert singleton into the real Hyprland 0.56.2 Lua VM; it was disabled before enable.
- Native enable, repeated enable, disable, repeated disable, and re-enable all returned `ok`, with empty `hyprctl configerrors` after each action. Readback confirmed the expected enabled/disabled states.
- Evaluated the pure recognizer inside the compositor's Lua VM on explicitly synthetic clockwise/counterclockwise circles and a straight line. The direction/rejection assertions passed.
- Production `gestures.lua`, navigation/state modules, `hyprland.lua`, and `input.lua` matched the pre-subagent SHA-256 snapshot. Existing navigation remained enabled.

## Available now

The prototype is temporarily enabled in the current compositor session. No production config or autostart entry was added.

Hold Super + Alt, place three fingers on the trackpad, and move all three together around a circle. Lift the fingers while still holding the keys. This is translation of the fingers around a path, not twisting them around a fixed center. The expected outcome is a label such as `circle_cw`, `circle_ccw`, or a rejection reason. It never moves windows or launches applications.

Read last result:

    hyprctl repl 'return require("gesture_shapes").status()'

Disable just the prototype:

    hyprctl eval 'require("gesture_shapes").disable()'

A configuration reload can discard this temporary module/binding; re-enable with the command in README.md when deliberately testing again. The existing Super+Ctrl+G shortcut controls the production Centerstage gestures, not this separate prototype.

## Still unverified

Physical Magic Trackpad shape recognition, practical false-positive/false-negative rates, comfort of the chord, and hardware-input-to-notification behavior require a hands-on trial. Synthetic input and native registration do not establish those properties. The verdict remains PARTIAL.
