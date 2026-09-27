# Source verification (read-only upstream inspection)

All upstream reads pinned to Hyprland v0.56.2. Installed `/usr/share/hypr/stubs/hl.meta.lua` was also inspected. The stub omits table-valued gesture callbacks; implementation source confirms them.

https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/managers/input/trackpad/TrackpadGestures.cpp
- Exact gesture matching includes finger count and modifier mask.
- Removal matches fingers, direction, modifiers, scale, and disableInhibit.
- Swipe selection waits until cumulative delta reaches roughly five units on an axis.
- The selecting update is passed to both begin and update; previous subthreshold updates are not replayed.
- Shortcut inhibition is checked at selection, not throughout the active stroke.
- Pinch activation requires abs(scale - 1) >= 0.1; pure rotation is not sufficient.

https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/managers/input/trackpad/gestures/LuaFunctionGesture.cpp
- Swipe start/update expose type, fingers, time_ms, delta.x/y.
- Finish exposes type, time_ms, cancelled; no fingers.

https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/config/lua/bindings/LuaBindingsToplevel.cpp
- hl.is_key_down accepts integer keycodes or case-sensitive XKB keysym strings, looking through pressed keys. Adapter uses named keysyms, not guessed modifier APIs.

https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/config/lua/LuaEventHandler.cpp
https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/managers/input/InputManager.cpp
- input.keyboard.key supplies (keycode + 8, time_ms, state), before keybind-manager pressed-key updates. Adapter ignores all arguments and cancels on any keyboard event, avoiding stale release-state polling and retaining no keystrokes.

https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/config/lua/bindings/LuaBindingsConfigRules.cpp
https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/config/lua/bindings/LuaBindingsInternal.cpp
- action='unset' removes the exact tuple.
- Native registration errors are reported through configError, which returns no Lua result rather than raising. Do not infer success from pcall or module status; check the enable eval response.

https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/config/lua/ConfigManager.cpp
https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/config/lua/ConfigManager.hpp
https://github.com/hyprwm/Hyprland/blob/v0.56.2/src/debug/HyprCtl.cpp
https://github.com/hyprwm/Hyprland/blob/v0.56.2/hyprctl/src/main.cpp
- hyprctl eval supports runtime Lua. repl with an argument is a single command with returned output, not the interactive REPL.
- Use eval for registration: repl may return printed/results output before reporting collected errors.
- Event callback timeout is 50 ms.

Downloaded read-only reference copies are retained in this spike directory: source-tree.json, query.cpp, events.cpp, rules.cpp, input.cpp, toplevel.cpp, registration.cpp, ipc.cpp, internal.cpp, config-manager.hpp, config-manager.cpp, hyprctl-main.cpp. These are research material, not compiled or loaded by the prototype. No compositor command was run.
