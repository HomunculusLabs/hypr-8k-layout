#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-"$HOME/.config/hypr"}
GENERATOR="$HOME/.config/omarchy/scripts/sync-hermes-theme.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

OMARCHY_COLORS_FILE="$ROOT/tests/fixtures/rofi-colors.toml" \
HERMES_SKIN_OUTPUT="$TMP/omarchy-sync.yaml" \
    "$GENERATOR"

[[ "$(yq -r '.name' "$TMP/omarchy-sync.yaml")" == "omarchy-sync" ]]
[[ "$(yq -r '.colors.background' "$TMP/omarchy-sync.yaml")" == "#101820" ]]
[[ "$(yq -r '.colors.ui_accent' "$TMP/omarchy-sync.yaml")" == "#112233" ]]
[[ "$(yq -r '.colors.ui_primary' "$TMP/omarchy-sync.yaml")" == "#112233" ]]
[[ "$(yq -r '.colors.completion_menu_current_bg' "$TMP/omarchy-sync.yaml")" == "#445566" ]]
[[ "$(yq -r '.colors.ui_text' "$TMP/omarchy-sync.yaml")" == "#ddeeff" ]]
[[ "$(yq -r '.colors.ui_ok' "$TMP/omarchy-sync.yaml")" == "#a7c080" ]]
[[ "$(yq -r '.banner_logo' "$TMP/omarchy-sync.yaml")" == *'#112233'* ]]
[[ "$(yq -r '.banner_hero' "$TMP/omarchy-sync.yaml")" == *'#112233'* ]]
! rg -q '#FFD700|#FFBF00|#CD7F32' "$TMP/omarchy-sync.yaml"

printf 'Hermes Omarchy skin tests passed\n'
