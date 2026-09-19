#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-"$HOME/.config/hypr"}

require_text() {
    local file=$1 pattern=$2
    rg -q -- "$pattern" "$file" || {
        printf 'missing %s in %s\n' "$pattern" "$file" >&2
        exit 1
    }
}

if rg -q 'hyprctl (?:--batch .*dispatch|dispatch)' "$ROOT/scripts" "$ROOT/layouts/centerstage" "$ROOT/layouts/triad" --glob '*.sh'; then
    printf 'legacy Hyprland dispatcher calls remain\n' >&2
    exit 1
fi

require_text "$ROOT/hyprland.lua" '^omarchy_default_bindings = false$'
require_text "$ROOT/bindings.lua" 'centerstage-move\.sh left'
require_text "$ROOT/bindings.lua" 'centerstage-resize\.sh'
require_text "$ROOT/bindings.lua" 'for position = 1, 9 do'
require_text "$ROOT/bindings.lua" 'centerstage-focus\.sh '
require_text "$ROOT/bindings.lua" 'o\.bind\("SUPER \+ RETURN", "Terminal", "uwsm-app -- foot"\)'
require_text "$ROOT/bindings.lua" 'o\.bind\("SUPER \+ SPACE", "Application launcher", "rofi -show drun"\)'
require_text "$ROOT/bindings.lua" 'o\.bind\("SUPER \+ ALT \+ SPACE", "Omarchy menu", "omarchy-menu toggle"\)'
require_text "$ROOT/bindings.lua" 'o\.bind\("SUPER \+ CTRL \+ T", "Theme switcher", scripts \.\. "theme-switcher\.sh"\)'
require_text "$ROOT/autostart.lua" 'centerstage-session-startup\.sh'
require_text "$ROOT/scripts/centerstage-session-startup.sh" 'venv/bin/hermes -p arthur'
require_text "$ROOT/scripts/centerstage-session-startup.sh" 'venv/bin/hermes -p surplus'
require_text "$ROOT/scripts/centerstage-session-startup.sh" 'place_window left-secondary'
require_text "$ROOT/looknfeel.lua" 'gaps_in = 20'
require_text "$ROOT/looknfeel.lua" 'rounding = 20'
require_text "$ROOT/input.lua" 'follow_mouse = 0'
require_text "$ROOT/scripts/centerstage-handler.sh" 'fullscreen='
require_text "$ROOT/scripts/centerstage-handler.sh" 'org\.omarchy\.screensaver'
require_text "$ROOT/bindings.lua" 'centerstage-pip-workspace-toggle\.sh'

printf 'centerstage Lua configuration tests passed\n'
