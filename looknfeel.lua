-- 57-inch 7680x2160 ultrawide appearance and behavior.
hl.config({
  render = {
    direct_scanout = 2,
  },
  cursor = {
    no_hardware_cursors = true,
    min_refresh_rate = 120,
  },
  general = {
    gaps_in = 20,
    gaps_out = { top = 100, right = 80, bottom = 100, left = 80 },
    border_size = 4,
    col = {
      active_border = "rgba(a89984ff)",
      inactive_border = "rgba(665c5499)",
    },
    layout = "dwindle",
  },
  decoration = {
    rounding = 20,
    active_opacity = 0.9,
    inactive_opacity = 0.8,
    blur = {
      enabled = true,
      size = 6,
      passes = 2,
      new_optimizations = true,
      ignore_opacity = false,
    },
  },
  dwindle = {
    preserve_split = true,
  },
  layout = {
    single_window_aspect_ratio = { 1, 1 },
  },
  animations = {
    enabled = true,
  },
})

-- One non-overshooting ease-out for coordinated Centerstage transitions.
-- Speeds are deciseconds: 2.4 = 240ms. Explicit leaves override package defaults.
hl.curve("centerstageEase", { type = "bezier", points = { { 0.16, 1 }, { 0.3, 1 } } })
hl.animation({ leaf = "windows", enabled = true, speed = 2.4, bezier = "centerstageEase" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 2.4, bezier = "centerstageEase", style = "popin 96%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 1.6, bezier = "centerstageEase", style = "popin 96%" })
hl.animation({ leaf = "windowsMove", enabled = true, speed = 2.4, bezier = "centerstageEase" })
hl.animation({ leaf = "border", enabled = true, speed = 2, bezier = "centerstageEase" })
hl.animation({ leaf = "borderangle", enabled = false })
hl.animation({ leaf = "fade", enabled = true, speed = 1.6, bezier = "centerstageEase" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 1.6, bezier = "centerstageEase" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 1.6, bezier = "centerstageEase" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 3, bezier = "centerstageEase", style = "slidefade 8%" })

-- Window rules migrated to Hyprland's Lua API.
o.window("^(Alacritty)$", { opacity = "0.70 0.60" })
o.window({ class = "^(Alacritty)$", title = "^(btop-system)$" }, {
  float = true,
  move = { 80, 100 },
  size = { 750, 1960 },
})
o.window({ class = "^(Codex)$", title = "^(Codex)$" }, { size = { 1200, 1600 } })
o.window("^(Codex)$", { opacity = "1.0 0.92" })
o.window("^(com\\.usebottles\\.bottles)$", { float = true, workspace = "4" })
o.window("^(battle\\.net)", { float = true, workspace = "4" })

-- Battle.net bottle via the Steam shim: every window shares class
-- steam_app_4036538709, so match on title to tell them apart.
-- Launcher: float on workspace 4 (replaces the dead battle\.net class rule).
o.window({ class = "^steam_app_4036538709$", title = "^Battle\\.net" }, {
  float = true,
  workspace = "4",
})

-- World of Warcraft: locked to workspace 4. Fullscreen, not tiled: the
-- single-window 1:1 aspect rule squares a lone tiled window (~1923x1923),
-- and WoW's windowed resolution list only goes up to the current window
-- size — so tiling hid the 7680x2160 modes. Fullscreen sizes it to the
-- output and exposes the monitor's full mode list.
o.window({ class = "^steam_app_4036538709$", title = "^World of Warcraft" }, {
  workspace = "4",
  fullscreen = true,
})
-- Diablo II Resurrected: fullscreen on workspace 4 (Window Mode 0 in its
-- Settings.json; this rule makes Hyprland force the fullscreen state).
o.window({ class = "^steam_app_4036538709$", title = "^Diablo" }, {
  workspace = "4",
  fullscreen = true,
})
o.window("^(electron)$", { float = true })
