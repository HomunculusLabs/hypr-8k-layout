# Repository Guidelines

## Project Structure & Module Organization
- Root config files: `hyprland.conf`, `bindings.conf`, `input.conf`, `monitors.conf`, `autostart.conf`, `hypridle.conf`, `hyprlock.conf`, `hyprpaper.conf`, `hyprsunset.conf`, `looknfeel.conf`, `xdph.conf`.
- Layout systems: `layouts/centerstage/` (primary 3-zone ultrawide layout) and `layouts/triad/` (alternate 3-zone layout). See `layouts/README.md`.
- Helper scripts: `scripts/` for automation utilities (e.g., wallpaper cycling, device waits).
- Visuals: `shaders/` for Hyprland shader assets.
- Runtime state: `state/` stores layout state files and locks (generated at runtime; do not hand-edit unless you know the impact).

## Build, Test, and Development Commands
This repository is a Hyprland configuration; there is no build step.
- Reload Hyprland config: `hyprctl reload` (apply changes after editing `.conf` files).
- Centerstage layout (manual): `layouts/centerstage/centerstage-retile.sh` (repositions windows based on tags).
- Startup layout: `scripts/centerstage-session-startup.sh` (restores the named workspace 1 session).

## Coding Style & Naming Conventions
- Shell scripts are Bash (`#!/bin/bash`) with 4-space indentation.
- Script names are kebab-case and descriptive (e.g., `centerstage-retile.sh`, `wallpaper-cycle.sh`).
- Hyprland config files are `.conf` in the repository root; keep settings grouped by purpose and add brief comments only when rules are non-obvious.

## Testing Guidelines
- No automated test suite exists.
- Validate changes manually: reload (`hyprctl reload`), then exercise relevant keybindings and layout scripts.
- For layout changes, verify workspace 1-3 behavior and tags described in `layouts/centerstage/centerstage.md`.

## Commit & Pull Request Guidelines
- Git history is minimal (single “Initial commit”); there is no established convention.
- Use short, imperative commit summaries (e.g., “Adjust centerstage sidebar widths”).
- PRs should describe the behavior change, list affected config files/scripts, and include screenshots or GIFs for visible layout changes when possible.

## Configuration & Dependencies
- Centerstage scripts rely on `hyprctl`, `jq`, `socat`, `notify-send`, and `flock` (see `layouts/centerstage/centerstage.md`).
- Paths are expected under `~/.config/hypr/`; keep relative references consistent with that layout.
