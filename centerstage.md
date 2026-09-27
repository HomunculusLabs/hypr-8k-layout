# Center Stage Layout

Center Stage is a Hyprland window layout for ultrawide screens. It splits the
screen into three zones: left sidebar, center stage, and right sidebar. Windows
are floated and positioned by scripts in `~/.config/hypr/scripts/`.

## Scope and prerequisites

- Active only on workspaces 1-3.
- Relies on Hyprland tags such as `centerstage-center` and `centerstage-right`.
- Uses `hyprctl`, `jq`, Python 3, `flock`, and `notify-send`.
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
- Obsidian goes left, initializing `obsidian-grid` only on a workspace with
  no explicit choice and no existing split. Existing left windows migrate
  with it; explicitly chosen single/split modes and other workspaces are
  preserved. In PBP mode it uses the available single left zone.
- Nautilus always goes to the left sidebar.
- Placement never explicitly refocuses the new window, including background
  launches. Ready windows have no initialization delay; not-yet-mapped windows
  receive a bounded retry.
- The handler remembers window workspaces and follows `movewindowv2` events.
  Closing a background layout window reflows that workspace in one transaction,
  not whichever workspace is currently focused. Closing an auxiliary window
  does not trigger a layout reflow, including after a handler restart.

### Auxiliary windows

`centerstage-windows.lua` gives Rabby extension windows, compositor-reported
modal dialogs, and GTK/KDE/GNOME portal prompts the `centerstage-auxiliary`
role (displayed with a trailing `*` when supplied by a window rule). These
windows open floating and centered, without occupying a Centerstage zone.
Native initial-focus behavior is retained: there is no forced refocus,
cross-workspace pinning, or persistent focus trap.

The handler also keeps small unassigned windows (width below 600 or height
below 400) outside the layout and persists that fallback as the
`centerstage-auxiliary` tag. If one arrives tiled, it is floated without an
explicit resize; an already-floating menu keeps its placement. Existing zone
membership takes precedence over this size fallback, including across a
handler restart. Normal additional browser/application windows are routed
normally even when they share a PID. Quick image-viewer routing and navigation
shortcuts are unchanged.

Run `python3 tests/test-centerstage-handler.py -v` and
`python3 tests/test-centerstage-auxiliary-rules.py -v` for isolated coverage.
For opt-in native rule verification, run
`python3 tests/verify-centerstage-auxiliary-live.py`; it creates disposable
terminal stand-ins on an unused background workspace, never opens a wallet,
and checks cleanup and preservation of working windows and focus.

Retiling is done by `~/.config/hypr/scripts/centerstage-retile.sh`, which:

- Uses a vertical stack for 1-3 windows.
- Uses a grid for 4-9 windows.
- For the right sidebar, scales width based on window count and assigns
  `centerstage-right-N` tags.
- For the left sidebar in split mode, the primary sub-column is a single tall
  window and the secondary sub-column uses the grid.

## Smooth transitions and responsiveness

New Foot terminals on workspaces 1-3 materialize in their assigned slot instead
of visibly travelling from their provisional tiled position. The native Lua
controller in `centerstage-terminal-entrance.lua` uses a temporary non-membership
tag to keep only the new terminal transparent and unanimated until Centerstage
has placed it and its geometry has settled. Removing the tag restores its normal
opacity and animations; other windows and later terminal moves are unchanged.
A one-second fail-open deadline, workspace/role checks, stable window IDs, and
reload cleanup prevent stranded invisible terminals. Popups, small utility
windows, and already-assigned terminals are not delayed.

`tests/test-centerstage-terminal-entrance.py` covers the controller and its
interaction with the real handler under isolated IPC. The opt-in
`tests/verify-centerstage-terminal-entrance-live.py` exercises native opening,
transparent placement, reveal, animation restoration, and timeout recovery on
an unused workspace with a uniquely identified terminal stand-in.

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
- The Hotkey 2 focused-center swap (`centerstage-swap-focused-center.sh`)
  exchanges the focused window with the first center cell, remembers the
  swapped pair per workspace, and swaps straight back when the window now
  holding the center cell is focused. Focus follows the window now in
  center stage (guarded so background-workspace swaps never change the
  active workspace). Stale memories (closed or moved windows, verified by
  stableId) fall back to the first center cell.
- Fullscreen, hidden, pinned, screensaver, and game windows are excluded from
  these automatic layout transactions. A changed workspace or zone membership
  between planning and application invalidates that window's queued updates.
- Width/height controls, left-layout cycling, and primary/center swaps use the
  shared transaction lock too. Older PIP and alternate-layout helpers retain
  their own behavior.
- A floating resize that would cross the screen origin is pre-positioned
  within the same batch. This avoids Hyprland's one-pixel edge-rounding growth
  without weakening geometry verification or displaying an intermediate frame.

`looknfeel.lua` sets a local non-overshooting ease-out curve, 240ms opening and
movement, 160ms closing/fades, and a 300ms workspace slide/fade over only 8% of
screen width. Blur remains enabled with two passes at size 6. Opacity, colors,
monitor mode, and keybindings are unchanged. Motion/blur tuning and the layout
pipeline are separate commits so either can be reverted independently.

Run everything with one command:

```sh
~/.config/hypr/tests/run-centerstage-checks.sh
~/.config/hypr/tests/run-centerstage-checks.sh --live
```

The default is isolated regressions plus syntax checks, with no desktop
interaction. `--live` additionally requires an unused, inactive workspace 3,
normal (non-PIP/PBP) mode, and a single 7680x2160 scale-1 display. It restarts
the handler, waits for the event listener to be ready, creates three uniquely
identified temporary terminals, and exercises automatic placement, background
closes, sizing, all four left-layout modes, and primary promotion. It checks
that existing windows and focus remain unchanged. The test temporarily pauses
autosave and changes width/height and workspace-3 left-layout test settings,
then removes its probes,
restores settings, and resumes autosave. Avoid changing windows or layout
settings during this brief live test; concurrent edits cause a failure rather
than being silently overwritten. Latencies include application startup and
placement, not frame-rate measurements.

Individual isolated regressions:

```sh
python3 tests/test-centerstage-controls.py -v
python3 tests/test-centerstage-live-runner.py -v
python3 tests/test-centerstage-handler.py -v
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

Toggled by `~/.config/hypr/scripts/centerstage-left-layout.sh [workspace]`:

- `single`: all left windows use the sidebar's adaptive grid.
- `obsidian-grid`: Obsidian is primary on the left, other windows are secondary.
- `grid-obsidian`: secondary grid on the left, primary on the right.
- `equal-split`: primary and secondary each receive half the usable width,
  without overwriting the saved custom ratio.

The cycle follows the order above. Tag migration and geometry updates share
one guarded compositor batch, without changing focus. The selected mode is
saved in `state/centerstage-left-layout-N` only after verifying geometry and
zone tags; a stale target cancels the group. The original shared
`state/centerstage-left-layout` remains the fallback for workspaces with no
explicit choice. PBP keeps its fixed single layout and rejects cycling.

The handler's `--initialize` option only enables an unconfigured split;
it rechecks the preference under the layout lock instead of cycling a choice
that the user may have made while it waited.

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

Width cycling follows the live center region, preserves sidebar grids, and
keeps the existing shared width preference. Width cycling is unavailable in
fixed-width PIP/PBP mode. Height is saved per workspace in
`state/centerstage-center-height-N`; absent/invalid values use the original
full-height layout. Chosen height survives ordinary retile, movement, and
close-triggered reflow. Both controls publish their pending state only after
reading back the requested geometry; an IPC failure or refused/stale resize
returns an error without saving the new preference. They also accept an
optional workspace ID for targeted background operation. Primary/center
promotion uses one batch and only deliberately changes focus when operating
on the currently active workspace.

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
