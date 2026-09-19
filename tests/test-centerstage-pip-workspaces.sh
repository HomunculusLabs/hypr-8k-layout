#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-"$HOME/.config/hypr"}
TEST_HOME=$(mktemp -d)
trap 'rm -rf "$TEST_HOME"' EXIT
mkdir -p "$TEST_HOME/.config/hypr/state"

HOME="$TEST_HOME" source "$ROOT/scripts/centerstage-lib.sh"

[[ "$(get_pip_workspace_for_zone center)" == 1 ]]
[[ "$(get_pip_workspace_for_zone right)" == 2 ]]
[[ "$(get_pip_workspace_for_zone left)" == 3 ]]

printf 'on\n' > "$TEST_HOME/.config/hypr/state/centerstage-pip-workspace-mode"
HOME="$TEST_HOME"
read -r zone_x zone_width zone_tag <<< "$(get_zone_dimensions right)"
[[ "$zone_x" == 80 ]]
[[ "$zone_width" == 3680 ]]
[[ "$zone_tag" == centerstage-right ]]

rg -q 'centerstage-pip-workspace-toggle\.sh' "$ROOT/bindings.lua"
[[ -x "$ROOT/scripts/centerstage-pip-workspace-toggle.sh" ]]
rg -q 'floating: \.floating' "$ROOT/scripts/centerstage-pip-workspace-toggle.sh"
rg -q 'select\(\.floating == false and' "$ROOT/scripts/centerstage-pip-workspace-toggle.sh"
rg -q 'current_floating.*floating' "$ROOT/scripts/centerstage-pip-workspace-toggle.sh"

printf 'centerstage PIP workspace tests passed\n'
