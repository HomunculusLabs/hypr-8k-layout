Triad workspace layout (workspace 2)
==================================

This is a standalone 3-region layout for a 7680x2160 display. It manages
workspace 2 only and does not touch workspace 1.

Regions (tags)
-------------
- Left:  triad-left
- Center: triad-center
- Right: triad-right

Geometry
--------
- Y: 100
- Height: 1960
- Inner gap: 100
- Edge margin: 80
- Center width: 2560 (override via ~/.config/hypr/state/triad-center-width)

Scripts
-------
- triad-handler.sh: auto-assign windows on workspace 2
- triad-move.sh <zone> [address]: manual placement (left|center|right)
- triad-retile.sh <zone> <workspace_id>: re-tile a single zone

Autostart
---------
Add to ~/.config/hypr/autostart.conf:
  exec-once = sleep 2 && ~/.config/hypr/layouts/triad/triad-handler.sh

Manual usage
------------
- Move active window: ~/.config/hypr/layouts/triad/triad-move.sh left|center|right
- Retile all: run triad-retile.sh for left/center/right
