-- Mai is a transparent character surface, not a frosted desktop panel.
-- Match the observed build narrowly by its own app class; never affect all
-- Electron apps. Keep geometry, focus, pinning and zone tags under
-- Centerstage/user control — but float at map time so the companion never
-- flashes as a tiled mid-screen window before the handler places it.
hl.window_rule({
  name = "mai-buddy-transparent-surface",
  match = {
    initial_class = "^Mai Buddy$",
    initial_title = "^Bonzi Desktop Companion$",
  },
  float = true,
  no_blur = true,
  no_shadow = true,
  no_dim = true,
  decorate = false,
  border_size = 0,
  rounding = 0,
  opacity = "1.0 override 1.0 override 1.0 override",
  opaque = false,
})
