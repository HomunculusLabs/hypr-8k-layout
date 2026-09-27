#!/usr/bin/env bash
# Select and apply an Omarchy theme. The theme-set hook updates Rofi colors.
set -euo pipefail

theme=$(omarchy-theme-switcher)
[[ -n "$theme" ]] || exit 0
omarchy-theme-set "$theme"
