#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-"$HOME/.config/hypr"}
SCRIPT="$ROOT/scripts/wallpaper-cycle.sh"
FIXTURES="$ROOT/tests/fixtures/bin"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/Pictures/Wallpapers" "$TMP/.local/state/omarchy/current"
touch "$TMP/Pictures/Wallpapers/01-first.jpg"
touch "$TMP/Pictures/Wallpapers/02 second.png"
chmod +x "$FIXTURES/omarchy" "$FIXTURES/notify-send"

# Advance from a personal wallpaper to the next personal wallpaper.
ln -s "$TMP/Pictures/Wallpapers/01-first.jpg" "$TMP/.local/state/omarchy/current/background"
HOME="$TMP" PATH="$FIXTURES:$PATH" "$SCRIPT"
expected="theme bg set $TMP/Pictures/Wallpapers/02 second.png"
actual=$(<"$TMP/omarchy-call")
[[ "$actual" == "$expected" ]] || {
    printf 'expected: %s\nactual:   %s\n' "$expected" "$actual" >&2
    exit 1
}

# If a theme background is active, start at the first personal wallpaper.
rm "$TMP/.local/state/omarchy/current/background"
ln -s "$TMP/theme-background.jpg" "$TMP/.local/state/omarchy/current/background"
HOME="$TMP" PATH="$FIXTURES:$PATH" "$SCRIPT"
expected="theme bg set $TMP/Pictures/Wallpapers/01-first.jpg"
actual=$(<"$TMP/omarchy-call")
[[ "$actual" == "$expected" ]] || {
    printf 'expected: %s\nactual:   %s\n' "$expected" "$actual" >&2
    exit 1
}

printf 'wallpaper cycle tests passed\n'
