-- Learn how to configure Hyprland: https://wiki.hypr.land/Configuring/Start/

-- Omarchy's bootstrap keeps path setup out of this user config.
dofile((os.getenv("OMARCHY_PATH") or "/usr/share/omarchy") .. "/default/hypr/bootstrap.lua")

-- Disable all Omarchy default bindings. Add your own in hypr/bindings.lua.
-- Disable Omarchy's default bindings; bindings.lua defines the complete
-- Centerstage-oriented keymap used on this workstation.
omarchy_default_bindings = false

-- Load Omarchy defaults.
require("default.hypr.omarchy")

-- Put your personal overrides in these files. They're loaded after Omarchy's
-- defaults so package updates can improve the defaults without rewriting your
-- ~/.config/hypr files.
require("hypr.monitors")
require("hypr.input")
require("hypr.bindings")
require("hypr.looknfeel")
require("hypr.centerstage-windows")
require("hypr.mai-buddy")
require("hypr.autostart")

-- Toggle config flags dynamically.
require("default.hypr.toggles")

-- Add any other personal Hyprland configuration below.
-- o.window("qemu", { workspace = "5" })
require("hypr.wow-panel")

-- Trackpad focus navigation and native workspace swipes.
require("hypr.gestures")

-- Reveal new terminals in their assigned slot, without the initial cross-screen move.
local terminal_entrance = require("hypr.centerstage-terminal-entrance")
if terminal_entrance.rule then hl.window_rule(terminal_entrance.rule) end
terminal_entrance.install(hl)
