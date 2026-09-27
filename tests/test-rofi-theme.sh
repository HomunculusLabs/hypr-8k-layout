#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-"$HOME/.config/hypr"}
GENERATOR="$HOME/.config/rofi/sync-omarchy-theme.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

OMARCHY_COLORS_FILE="$ROOT/tests/fixtures/rofi-colors.toml" \
ROFI_THEME_OUTPUT="$TMP/omarchy.rasi" \
    "$GENERATOR"

rg -q 'background: #101820F2;' "$TMP/omarchy.rasi"
rg -q 'foreground: #ddeeff;' "$TMP/omarchy.rasi"
rg -q 'accent: #112233;' "$TMP/omarchy.rasi"
rg -q 'selected-background: #445566;' "$TMP/omarchy.rasi"
rg -q 'selected-foreground: #ffffff;' "$TMP/omarchy.rasi"

rofi -no-config -theme "$TMP/omarchy.rasi" -dump-theme >/dev/null
rofi -config "$HOME/.config/rofi/config.rasi" -dump-config >/dev/null

printf 'rofi theme tests passed\n'
