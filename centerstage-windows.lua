-- Auxiliary windows float above Centerstage without occupying a layout zone.
-- Match Rabby's extension identity, not its changing/initially opaque title.
o.window({ initial_class = "^brave-acmacodkjbdgmoleebolmdjonilkdbch-.*$" }, {
  tag = "+centerstage-auxiliary",
  float = true,
  center = true,
})

-- Semantic dialogs and portal prompts are auxiliary even when their initial
-- mapped dimensions are large. Do not classify every floating app as a dialog.
o.window({ modal = true }, {
  tag = "+centerstage-auxiliary",
  float = true,
  center = true,
})
o.window({ initial_class = "^xdg-desktop-portal-(gtk|kde|gnome)$" }, {
  tag = "+centerstage-auxiliary",
  float = true,
  center = true,
})
