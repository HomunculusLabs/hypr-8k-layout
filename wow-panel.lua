-- Actual overlay: only the Hermes window changes. WoW keeps its original size.
o.window({ tag = "wow-panel-ui" }, {
  opacity = "0.97 override 0.90 override",
  no_follow_mouse = true,
  no_anim = true,
  border_color = "rgb(bfa36a)",
  border_size = 2,
  rounding = 16,
})
o.bind("SUPER + ALT + H", "WoW: show/hide Hermes overlay", "hermes wow-panel toggle")
o.bind("SUPER + CTRL + H", "WoW: focus Hermes overlay or game", "hermes wow-panel focus")

