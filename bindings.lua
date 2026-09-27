-- Complete personal keymap for the 7680x2160 Centerstage setup.
-- Omarchy defaults are disabled in hyprland.lua to avoid duplicate bindings.

local scripts = (os.getenv("HOME") or "") .. "/.config/hypr/scripts/"
local layout_scripts = (os.getenv("HOME") or "") .. "/.config/hypr/layouts/centerstage/"

-- Applications.
o.bind("SUPER + RETURN", "Terminal", "uwsm-app -- foot")
o.bind("SUPER + SHIFT + F", "File manager", "uwsm-app -- nautilus --new-window")
o.bind("SUPER + SHIFT + B", "Browser", "omarchy-launch-browser")
o.bind("SUPER + SHIFT + ALT + B", "Browser (private)", "omarchy-launch-browser --private")
o.bind("SUPER + SHIFT + M", "Music", "omarchy-launch-or-focus spotify")
o.bind("SUPER + SHIFT + N", "Editor", "omarchy-launch-editor")
o.bind("SUPER + SHIFT + T", "Activity", "omarchy-launch-tui btop")
o.bind("SUPER + SHIFT + D", "Docker", "omarchy-launch-tui lazydocker")
o.bind("SUPER + SHIFT + G", "Signal", "omarchy-launch-or-focus ^signal$ \"uwsm-app -- signal-desktop\"")
o.bind("SUPER + SHIFT + O", "Obsidian", "omarchy-launch-or-focus ^obsidian$ \"uwsm-app -- obsidian -disable-gpu --enable-wayland-ime\"")
o.bind("SUPER + SHIFT + W", "Typora", "uwsm-app -- typora --enable-wayland-ime")
o.bind("SUPER + SHIFT + SLASH", "Passwords", "uwsm-app -- 1password")
o.bind("SUPER + SHIFT + C", "Codex Desktop", "codex-desktop")
o.bind("SUPER + SPACE", "Application launcher", "rofi -show drun")
o.bind("SUPER + ALT + SPACE", "Omarchy menu", "omarchy-menu toggle")
o.bind("SUPER + CTRL + T", "Theme switcher", scripts .. "theme-switcher.sh")

-- Notifications: both chords were unused; keep the editor's Super+Shift+N.
o.bind("SUPER + N", "Show recent notifications", "omarchy-shell notifications showHistory")
o.bind("SUPER + CTRL + N", "Toggle notification Do Not Disturb", "omarchy-shell notifications toggleDnd")

-- Macro Workbench: explicit run-once and emergency stop; no browser focus change.
local workbench = '"' .. (os.getenv("HOME") or "") .. '/.local/bin/macro-workbench"'
o.bind("SUPER + CTRL + F8", "Macro Workbench: run once", workbench .. " --trigger")
o.bind("SUPER + CTRL + F9", "Macro Workbench: stop", workbench .. " --stop")

-- Centerstage zones and sizing (workspaces 1-3).
o.bind("SUPER + CTRL + bracketleft", "Move to left sidebar", scripts .. "centerstage-move.sh left")
o.bind("SUPER + CTRL + bracketright", "Move to right sidebar", scripts .. "centerstage-move.sh right")
o.bind("SUPER + CTRL + backslash", "Move to center stage", scripts .. "centerstage-move.sh center")
o.bind("SUPER + CTRL + SEMICOLON", "Toggle Centerstage", scripts .. "centerstage-toggle.sh")
o.bind("SUPER + CTRL + RETURN", "Add window to center", scripts .. "centerstage-add.sh center")
o.bind("SUPER + P", "Move window to center stage", scripts .. "centerstage-move.sh center")
o.bind("SUPER + ALT + PERIOD", "Cycle center width", scripts .. "centerstage-resize.sh")
o.bind("SUPER + ALT + COMMA", "Cycle center height", scripts .. "centerstage-height.sh")
o.bind("SUPER + CTRL + APOSTROPHE", "Cycle sidebar balance", scripts .. "centerstage-sidebar.sh")
o.bind("SUPER + CTRL + UP", "Move window up in zone", scripts .. "centerstage-swap.sh up")
o.bind("SUPER + CTRL + DOWN", "Move window down in zone", scripts .. "centerstage-swap.sh down")
o.bind("SUPER + SHIFT + LEFT", "Move window to left zone", scripts .. "centerstage-swap.sh left")
o.bind("SUPER + SHIFT + RIGHT", "Move window to right zone", scripts .. "centerstage-swap.sh right")
o.bind("SUPER + CTRL + S", "Save Centerstage layout", scripts .. "centerstage-save.sh")
o.bind("SUPER + CTRL + SLASH", "Toggle sidebar auto-shrink", scripts .. "centerstage-shrink-toggle.sh")
o.bind("SUPER + CTRL + SHIFT + bracketleft", "Cycle left sidebar layout", scripts .. "centerstage-left-layout.sh")
o.bind("SUPER + CTRL + ALT + bracketright", "Expand left primary column", scripts .. "centerstage-left-ratio.sh increase")
o.bind("SUPER + CTRL + ALT + bracketleft", "Shrink left primary column", scripts .. "centerstage-left-ratio.sh decrease")
o.bind("SUPER + CTRL + ALT + SEMICOLON", "Swap primary with center", scripts .. "centerstage-swap-primary-center.sh")
o.bind("SUPER + CTRL + ALT + PERIOD", "Expand Obsidian", scripts .. "centerstage-obsidian-gap.sh decrease")
o.bind("SUPER + CTRL + ALT + COMMA", "Compact Obsidian", scripts .. "centerstage-obsidian-gap.sh increase")
o.bind("ALT + SHIFT + S", "Swap Obsidian and Brave", layout_scripts .. "centerstage-swap-obsidian-brave.sh")
o.bind("ALT + SHIFT + E", "Expand left secondary", layout_scripts .. "centerstage-left-expand.sh")
o.bind("SUPER + ALT + 3", "Screenshot full screen", "omarchy capture screenshot fullscreen copy")
o.bind("CTRL + SHIFT + 4", "Screenshot selected area", "omarchy capture screenshot region copy")
o.bind("SUPER + ALT + 5", "Screenshot chooser", "omarchy capture screenshot smart copy")

-- Center and right-sidebar position focus.
o.bind("ALT + SHIFT + 0", "Focus center window", scripts .. "centerstage-focus.sh 0")
o.bind("ALT + SHIFT + G", "Focus center window", scripts .. "centerstage-focus.sh 0")
for position = 1, 9 do
  o.bind("ALT + SHIFT + " .. position, "Focus right position " .. position, scripts .. "centerstage-focus.sh " .. position)
end

-- Monitor PBP/PIP helpers.
o.bind("SUPER + ALT + bracketleft", "PBP left half", scripts .. "centerstage-pbp.sh left")
o.bind("SUPER + ALT + bracketright", "PBP right half", scripts .. "centerstage-pbp.sh right")
o.bind("SUPER + ALT + backslash", "PBP full left half", scripts .. "centerstage-pbp.sh full")
o.bind("SUPER + ALT + EQUAL", "PIP top-right small", scripts .. "centerstage-pip.sh tr small")
o.bind("SUPER + ALT + MINUS", "PIP top-right large", scripts .. "centerstage-pip.sh tr large")
o.bind("SUPER + ALT + P", "Toggle PIP-ready workspaces", scripts .. "centerstage-pip-workspace-toggle.sh")
o.bind("SUPER + ALT + O", "Cycle window opacity", scripts .. "opacity-cycle.sh")
o.bind("SUPER + ALT + W", "Cycle wallpaper", scripts .. "wallpaper-cycle.sh")

-- Core window management.
o.bind("SUPER + Q", "Close window", hl.dsp.window.close())
o.bind("SUPER + F", "Full screen", hl.dsp.window.fullscreen({ mode = "fullscreen" }))
o.bind("SUPER + V", "Toggle floating", hl.dsp.window.float({ action = "toggle" }))
o.bind("SUPER + H", "Focus left", hl.dsp.focus({ direction = "l" }))
o.bind("SUPER + J", "Focus down", hl.dsp.focus({ direction = "d" }))
o.bind("SUPER + K", "Focus up", hl.dsp.focus({ direction = "u" }))
o.bind("SUPER + L", "Focus right", hl.dsp.focus({ direction = "r" }))
-- Was native movement; managed Centerstage windows now use zone-aware movement.
for key, direction in pairs({ H = "left", J = "down", K = "up", L = "right" }) do
  hl.unbind("SUPER + SHIFT + " .. key)
  o.bind("SUPER + SHIFT + " .. key, "Move window " .. direction .. " (Centerstage-aware)",
    "python3 " .. scripts .. "keyboard-navigation.py move " .. direction)
end

-- Navigation and searchable, display-only shortcut reference.
o.bind("SUPER + TAB", "Previous window", "python3 " .. scripts .. "keyboard-navigation.py previous")
o.bind("SUPER + W", "Search open windows", "python3 " .. scripts .. "keyboard-navigation.py windows")
o.bind("SUPER + SLASH", "Shortcut help", "omarchy menu keybindings --print | rofi -dmenu -i -p 'Shortcuts (reference)'")

-- Release Super after entering; adjustments stay active until Escape/Return.
o.bind("SUPER + R", "Enter Centerstage adjustment mode", function()
  hl.dispatch(hl.dsp.submap("centerstage-adjust"))
  hl.exec_cmd("notify-send -t 6000 'Centerstage adjustment mode' 'W width · T height · B balance · L layout · H/J/K sizing · A auto-shrink · S save · Esc exit'")
end)
hl.define_submap("centerstage-adjust", function()
  o.bind("W", "Adjust: cycle center width", scripts .. "centerstage-resize.sh")
  o.bind("T", "Adjust: cycle center height", scripts .. "centerstage-height.sh")
  o.bind("B", "Adjust: cycle sidebar balance", scripts .. "centerstage-sidebar.sh")
  o.bind("L", "Adjust: cycle left layout", scripts .. "centerstage-left-layout.sh")
  o.bind("H", "Adjust: shrink left primary", scripts .. "centerstage-left-ratio.sh decrease")
  o.bind("K", "Adjust: expand left primary", scripts .. "centerstage-left-ratio.sh increase")
  o.bind("J", "Adjust: cycle center height (alias)", scripts .. "centerstage-height.sh")
  o.bind("A", "Adjust: toggle auto-shrink", scripts .. "centerstage-shrink-toggle.sh")
  o.bind("S", "Adjust: save layout", scripts .. "centerstage-save.sh")
  o.bind("ESCAPE", "Adjust: exit", hl.dsp.submap("reset"))
  o.bind("RETURN", "Adjust: finish", hl.dsp.submap("reset"))
  o.bind("SUPER + R", "Adjust: exit (toggle)", hl.dsp.submap("reset"))
end)

for workspace = 1, 9 do
  local number = tostring(workspace)
  o.bind("SUPER + " .. number, "Switch to workspace " .. number, hl.dsp.focus({ workspace = number }))
  o.bind("SUPER + SHIFT + " .. number, "Move window to workspace " .. number, hl.dsp.window.move({ workspace = number }))
end
