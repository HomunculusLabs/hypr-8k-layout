# Center Stage Layout

Center Stage is a Hyprland window layout for ultrawide screens. It splits the
screen into three zones: left sidebar, center stage, and right sidebar. Windows
are floated and positioned by scripts in `~/.config/hypr/scripts/`.

## Scope and prerequisites

- Active only on workspaces 1-3 (PBP mode is restricted to workspace 1).
- Relies on Hyprland tags such as `centerstage-center` and `centerstage-right`.
- Uses `hyprctl`, `jq`, `socat`, `notify-send`, and `flock`.
- Geometry is tuned for a 7680x2160 display with fixed gaps.

## Zones and tags

Each window in the layout is tagged to a zone:

- Left sidebar: `centerstage-left`
- Center stage: `centerstage-center`
- Right sidebar: `centerstage-right`

Left sidebar split sub-columns:

- Primary: `centerstage-left-primary`
- Secondary: `centerstage-left-secondary`

Right sidebar split sub-columns (terminal-grid mode):

- Primary: `centerstage-right-primary`
- Secondary: `centerstage-right-secondary`

Right sidebar focus positions (assigned on retile):

- `centerstage-right-1` through `centerstage-right-9`

PBP mode stashing tag:

- `centerstage-pbp-stashed` (center windows moved to workspace 2)

## Geometry and layout rules

Defined in `~/.config/hypr/scripts/centerstage-lib.sh`:

- Screen: 7680x2160
- Zone y position: 100
- Total height: 1960
- Inner gap: 100
- Edge margin: 80

Sidebars are computed from the center width and anchored to the edges. The
center is always centered; sidebars consume the remaining space.

PBP mode uses a 3840px half-screen with a 50px inner gap. In PBP mode the center
zone is disabled and the left/right zones fill the 4K half.

## Auto placement and retile behavior

`~/.config/hypr/scripts/centerstage-handler.sh` listens to Hyprland socket
events:

- First window in a workspace goes to the center (unless PBP mode is active).
- Next windows go to the right sidebar until full, then to the left.
- Obsidian goes to left-primary and sets left layout to `obsidian-grid`.
- Nautilus always goes to the left sidebar.
- In right `terminal-grid` mode, new windows go to `right-secondary`.

Retiling is done by `~/.config/hypr/scripts/centerstage-retile.sh`, which:

- Uses a vertical stack for 1-3 windows.
- Uses a grid for 4-9 windows.
- For the right sidebar, scales width based on window count and assigns
  `centerstage-right-N` tags.
- For the left sidebar in split mode, the primary sub-column is a single tall
  window and the secondary sub-column uses the grid.
- For the right sidebar in `terminal-grid` mode, the primary column is stacked
  vertically and the secondary column uses the grid.

## Sidebar behavior

### Left sidebar modes

Toggled by `~/.config/hypr/scripts/centerstage-left-layout.sh` in this order:

- `single`: all left windows share one column (tag `centerstage-left`).
- `obsidian-grid`: Obsidian is primary (left), other windows are secondary.
- `grid-obsidian`: grid secondary left, Obsidian primary right with extra gap.
- `equal-split`: 50/50 split, no app-based routing changes.

Primary/secondary width is controlled by
`~/.config/hypr/scripts/centerstage-left-ratio.sh` with presets 50/60/70/80.
Note: `grid-obsidian` ignores the ratio and uses the right column width plus
an extra gap.

### Right sidebar modes

Right sidebar modes are controlled by the state file
`~/.config/hypr/state/centerstage-right-layout`:

- `single` (default): all right windows share one column.
- `terminal-grid`: primary column is a fixed width (default 750px) and stacked
  vertically; secondary column uses the grid.

Terminal width can be overridden in
`~/.config/hypr/state/centerstage-right-terminal-width`.

### Sidebar balance

`~/.config/hypr/scripts/centerstage-sidebar.sh` cycles a left/right width offset:

- -400, -200, 0, 200, 400
- Positive values widen the left sidebar, negative values widen the right.

This uses `centerstage-left` and `centerstage-right` tags, so it only affects
single-column layouts (not split sub-columns).

## Auto shrink mode

`~/.config/hypr/scripts/centerstage-shrink-toggle.sh` toggles:

- `fixed`: sidebars keep their computed widths.
- `auto`: sidebars shrink based on app minimum widths from
  `~/.config/hypr/state/centerstage-min-widths`.

`centerstage-min-widths` uses `class:min_width` lines, for example:

- `Alacritty:750`
- `obsidian:900`
- `default:500`

Auto shrink stores overrides in:

- `~/.config/hypr/state/centerstage-left-width`
- `~/.config/hypr/state/centerstage-right-width`

## Center stage sizing

Center window sizes are controlled by:

- `centerstage-resize.sh` (width presets 1920, 2200, 2560, 3000, 3840)
- `centerstage-height.sh` (height presets 1080, 1200, 1400, 1600, 1800, 1960)

Width presets are stored in `~/.config/hypr/state/centerstage-center-width`.

## Obsidian gap (grid-obsidian)

`centerstage-obsidian-gap.sh` adjusts the extra gap between the grid column and
Obsidian in `grid-obsidian` mode. Presets are total gaps of 100, 200, 400, 640.

## PBP and PIP

PBP (Picture-by-Picture) mode uses:

- `centerstage-pbp-toggle.sh` to toggle PBP on workspace 1. When enabled, center
  windows are moved to workspace 2, sidebars fill the 4K half, and normal layout
  is restored when disabled.
- `centerstage-pbp.sh` to fit the active window into the left/right/full PBP
  half (manual placement).

PIP (Picture-in-Picture) positioning uses:

- `centerstage-pip.sh <corner> <size>` to resize the active window so it avoids
  a PIP overlay (corner: tr/tl/br/bl, size: small/medium/large).

## Workspace save and restore

- `centerstage-save.sh` saves window zone assignments for workspaces 1-3 to
  `~/.config/hypr/state/centerstage-layout.json`.
- `centerstage-restore.sh` launches apps by class and moves them into zones.
- Both are referenced from `~/.config/hypr/autostart.conf`.

## Startup layout

`centerstage-startup.sh` launches a fixed workspace 1 layout (Obsidian, Brave,
terminals, etc.) and restarts the handler after positioning windows.

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
- Swap Obsidian and Brave: `SUPER+ALT+O`
- Expand/compact Obsidian (grid-obsidian gap): `SUPER+CTRL+ALT+.` / `SUPER+CTRL+ALT+,`
- Focus center/right positions: `ALT+SHIFT+0..9`
- PBP fit left/right/full: `SUPER+ALT+[` / `SUPER+ALT+]` / `SUPER+ALT+\\`
- Toggle PBP mode: `SUPER+ALT+P`
- PIP avoid top-right (small/large): `SUPER+ALT+=` / `SUPER+ALT+-`

## CLI and entrypoints

All Center Stage scripts live in `~/.config/hypr/scripts/` and start with
`centerstage-`. The main entrypoints are:

- `centerstage-handler.sh` for auto placement
- `centerstage-move.sh` for manual placement
- `centerstage-retile.sh` for layout calculations
- `centerstage` for the CLI wrapper (see `centerstage help`)
- `centerstage-completion.bash` for bash completion
