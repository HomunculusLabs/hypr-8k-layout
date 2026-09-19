# Center Stage Layout

Center Stage is a Hyprland window layout for ultrawide screens. It splits the
screen into three zones: left sidebar, center stage, and right sidebar. Windows
are floated and positioned by scripts in `~/.config/hypr/scripts/`.

## Scope and prerequisites

- Active only on workspaces 1-3.
- Relies on Hyprland tags such as `centerstage-center` and `centerstage-right`.
- Uses `hyprctl`, `jq`, `socat`, and `notify-send`.
- Geometry is tuned for a 7680x2160 display with fixed gaps.

## Zones and tags

Each window in the layout is tagged to a zone:

- Left sidebar: `centerstage-left`
- Center stage: `centerstage-center`
- Right sidebar: `centerstage-right`

Left sidebar also supports split sub-columns:

- Primary: `centerstage-left-primary`
- Secondary: `centerstage-left-secondary`

Right sidebar positions are tagged when retiling:

- `centerstage-right-1` through `centerstage-right-9`

## Geometry and layout rules

Defined in `~/.config/hypr/scripts/centerstage-lib.sh`:

- Screen: 7680x2160
- Zone y position: 100
- Total height: 1960
- Inner gap: 100
- Edge margin: 80

Sidebars are computed from the center width and anchored to the edges. The
center is always centered; sidebars consume the remaining space.

## Auto placement and retile behavior

`~/.config/hypr/scripts/centerstage-handler.sh` listens to Hyprland socket
events:

- First window in a workspace goes to the center.
- Next windows go to the right sidebar until full, then to left.
- Obsidian goes to left-primary and sets left split mode to `obsidian-grid`.
- Nautilus always goes to the left sidebar.

Retiling is done by `~/.config/hypr/scripts/centerstage-retile.sh`, which:

- Uses a vertical stack for 1-3 windows.
- Uses a grid for 4-9 windows.
- For the right sidebar, scales width based on window count and assigns
  `centerstage-right-N` tags.
- For the left sidebar in split mode, the primary sub-column is a single tall
  window and the secondary sub-column uses the grid.

## Smooth transitions and responsiveness

The active `scripts/` entrypoints for retile, move, and directional swap share
`centerstage-transaction.sh` and `centerstage-plan.sh`. The separate legacy
`layouts/centerstage/` helpers are not replaced by this change.

- Each operation takes one client snapshot under a shared layout lock and
  submits its geometry and tag changes in one Lua compositor update.
- An already-settled retile sends no mutations. Resizing still restores the
  top-left anchor because Hyprland resizes floating windows around their center.
- Moving a window reflows both its old zone and its new zone together, without
  a fixed sleep or a keyboard-focus change.
- Up/down swaps exchange existing cell rectangles, preserving their widths
  and right-sidebar numbered shortcuts. Left/right follows the visual order
  in `grid-obsidian` mode as well as the other left layouts.
- Fullscreen, hidden, pinned, screensaver, and game windows are excluded from
  these automatic layout transactions. A changed workspace or zone membership
  between planning and application invalidates that window's queued updates.
- The handler and other legacy sizing/PIP helpers retain their own behavior;
  not every legacy helper participates in the new lock.

`looknfeel.lua` sets a local non-overshooting ease-out curve, 240ms opening and
movement, 160ms closing/fades, and a 300ms workspace slide/fade over only 8% of
screen width. Blur remains enabled with two passes at size 6. Opacity, colors,
monitor mode, and keybindings are unchanged. Motion/blur tuning and the layout
pipeline are separate commits so either can be reverted independently.

Run the isolated regressions (no desktop interaction):

```sh
python3 tests/test-centerstage-smoothness.py -v
python3 tests/test-centerstage-interactions.py -v
python3 tests/test-centerstage-motion.py -v
bash tests/test-centerstage-config.sh
bash tests/test-centerstage-migration.sh
bash tests/test-centerstage-pip-workspaces.sh
bash tests/test-centerstage-pip-workspace-edge-cases.sh
```

The Python tests require Python 3 and `lua`, and execute the production shell
entrypoints against a Lua-backed Hyprland fixture with an isolated HOME. They
exercise batching, no-op layouts, resize anchoring, stable swaps, protection
races, tiled clients, left layout variants, and 1–9 right-sidebar cells in
normal and PIP workspace modes. Fixture timings measure command overhead,
not compositor frame rate.

## Sidebar behavior

### Left sidebar modes

Toggled by `~/.config/hypr/scripts/centerstage-left-layout.sh`:

- `single`: all left windows share one column (tag `centerstage-left`).
- `obsidian-grid`: Obsidian is primary, other windows are secondary.
- `equal-split`: same as split, but no app-based routing changes.

Primary/secondary width is controlled by
`~/.config/hypr/scripts/centerstage-left-ratio.sh` with presets 50/60/70/80.

### Right sidebar focus positions

Right sidebar windows are tagged with a position after every retile. Use
`centerstage-focus.sh` to jump to a specific position.

### Sidebar balance

`~/.config/hypr/scripts/centerstage-sidebar.sh` cycles a left/right width offset:

- -400, -200, 0, 200, 400
- Positive values widen the left sidebar, negative values widen the right.

## Auto shrink mode

`~/.config/hypr/scripts/centerstage-shrink-toggle.sh` toggles:

- `fixed`: sidebars keep their computed widths.
- `auto`: sidebars shrink based on app minimum widths from
  `~/.config/hypr/state/centerstage-min-widths`.

Auto shrink stores overrides in:

- `~/.config/hypr/state/centerstage-left-width`
- `~/.config/hypr/state/centerstage-right-width`

## Center stage sizing

Center window sizes are controlled by:

- `centerstage-resize.sh` (width presets 1920, 2200, 2560, 3000, 3840)
- `centerstage-height.sh` (height presets 1080, 1200, 1400, 1600, 1800, 1960)

## PIP/PBP-ready workspace mode

`SUPER+ALT+P` toggles a monitor-split-friendly layout. It saves the current
workspace assignments, then maps the center zone to workspace 1, the right zone
to workspace 2, and the left zone to workspace 3. Each zone is retiled into
a 3840x2160-safe viewport. Toggling again restores the saved workspace
assignments; windows opened while active join the normal workspace 1 layout.

## Workspace save and restore

- `centerstage-save.sh` saves window zone assignments to
  `~/.config/hypr/state/centerstage-layout.json`.
- `centerstage-restore.sh` remains available for generic class-based restores.
- `centerstage-session-startup.sh` restores the named workspace 1 session:
  Obsidian on the left, Brave in the center, and the four Hermes terminals in
  stable right-sidebar order. It is referenced from the Hyprland autostart
  files.

## Key bindings

Defined in `~/.config/hypr/bindings.conf`:

- Move window to left sidebar: `SUPER+CTRL+[`
- Move window to right sidebar: `SUPER+CTRL+]`
- Move window to center stage: `SUPER+CTRL+\`
- Toggle center-stage mode: `SUPER+CTRL+;`
- Cycle center width: `SUPER+ALT+.`
- Cycle center height: `SUPER+ALT+,`
- Cycle sidebar balance: `SUPER+CTRL+'`
- Move window up/down in stack: `SUPER+CTRL+UP` / `SUPER+CTRL+DOWN`
- Move window between zones: `SUPER+SHIFT+LEFT` / `SUPER+SHIFT+RIGHT`
- Save layout: `SUPER+CTRL+S`
- Toggle sidebar auto-shrink: `SUPER+CTRL+/`
- Cycle left layout mode: `SUPER+CTRL+SHIFT+[`
- Expand/shrink left primary column: `SUPER+CTRL+ALT+]` / `SUPER+CTRL+ALT+[`
- Swap left primary with center: `SUPER+CTRL+ALT+;`
- Focus center/right positions: `ALT+SHIFT+0..9`

## Related scripts

All Center Stage scripts live in `~/.config/hypr/scripts/` and start with
`centerstage-`. The main entrypoints are:

- `centerstage-handler.sh` for auto placement
- `centerstage-move.sh` for manual placement
- `centerstage-retile.sh` for layout calculations
