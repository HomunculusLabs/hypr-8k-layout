#!/usr/bin/env bash
set -euo pipefail

PLUGIN="$HOME/.config/omarchy/plugins/t3rpz.bar"
CONFIG="$HOME/.config/omarchy/shell.json"

rg -q 'property real compactWidthRatio' "$PLUGIN/Bar.qml"
rg -q 'implicitWidth: root\.vertical \? root\.barSize : root\.compactBarWidth\(barWindow\.screen\.width\)' "$PLUGIN/Bar.qml"
rg -q 'left: root\.position === "left"$' "$PLUGIN/Bar.qml"
rg -q 'right: root\.position === "right"$' "$PLUGIN/Bar.qml"
python3 "$HOME/.config/hypr/tests/test-desktop-refresh.py" -q
! rg -q '^\s*required property (string omarchyPath|var barWidgetRegistry|var barConfig)' "$PLUGIN/Bar.qml"
[[ "$(jq -r '.bar.id' "$CONFIG")" == "t3rpz.bar" ]]
[[ "$(jq -r '.bar.widthRatio' "$CONFIG")" == "0.24" ]]
[[ "$(jq -r '.bar.maxWidth' "$CONFIG")" == "1900" ]]
omarchy plugin validate "$PLUGIN" >/dev/null

printf 'compact Omarchy bar tests passed\n'
