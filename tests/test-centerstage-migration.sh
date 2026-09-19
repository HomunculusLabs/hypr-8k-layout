#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-"$HOME/.config/hypr"}
DISPATCH="$ROOT/scripts/hypr-dispatch.sh"

assert_eq() {
    local expected=$1 actual=$2
    if [[ "$actual" != "$expected" ]]; then
        printf 'expected: %s\nactual:   %s\n' "$expected" "$actual" >&2
        exit 1
    fi
}

dry() {
    CENTERSTAGE_DISPATCH_DRY_RUN=1 "$DISPATCH" "$@"
}

assert_eq 'hl.dispatch(hl.dsp.focus({window="address:0xabc"}))' "$(dry focuswindow address:0xabc)"
assert_eq 'hl.dispatch(hl.dsp.window.tag({tag="+centerstage-center",window="address:0xabc"}))' "$(dry tagwindow +centerstage-center address:0xabc)"
assert_eq 'hl.dispatch(hl.dsp.window.tag({tag="-centerstage-center"}))' "$(dry 'tagwindow -centerstage-center')"
assert_eq 'hl.dispatch(hl.dsp.window.float({action="set",window="address:0xabc"}))' "$(dry setfloating address:0xabc)"
assert_eq 'hl.dispatch(hl.dsp.window.resize({x=1920,y=1080,exact=true,window="address:0xabc"}))' "$(dry resizewindowpixel 'exact 1920 1080,address:0xabc')"
assert_eq 'hl.dispatch(hl.dsp.window.move({x=2880,y=100,exact=true}))' "$(dry moveactive exact 2880 100)"
assert_eq 'hl.dispatch(hl.dsp.window.move({workspace="2",follow=false,window="address:0xabc"}))' "$(dry movetoworkspacesilent '2,address:0xabc')"
assert_eq 'hl.dispatch(hl.dsp.focus({workspace="3"}))' "$(dry workspace 3)"
assert_eq 'hl.dispatch(hl.dsp.exec_cmd("printf \"hello world\""))' "$(dry exec 'printf "hello world"')"
assert_eq 'hl.dispatch(hl.dsp.window.set_prop({window="address:0xabc",prop="opaque",value="1",lock=true}))' "$(dry setprop address:0xabc opaque 1 lock)"

# Runtime regression tests: Hyprland 0.56.2 may treat action="set" as a
# toggle, and exact-resizing a tiled dwindle target can crash the compositor.
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
cat > "$tmpdir/hyprctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$HYPRCTL_LOG"
case "${1:-}" in
    clients)
        printf '[{"address":"0xabc","floating":%s}]\n' "$HYPRCTL_FLOATING"
        ;;
    activewindow)
        printf '{"address":"0xabc","floating":%s}\n' "$HYPRCTL_FLOATING"
        ;;
    eval)
        printf 'ok\n'
        ;;
esac
EOF
chmod +x "$tmpdir/hyprctl"

runtime_log="$tmpdir/runtime.log"
: > "$runtime_log"
PATH="$tmpdir:$PATH" HYPRCTL_LOG="$runtime_log" HYPRCTL_FLOATING=true \
    "$DISPATCH" setfloating address:0xabc >/dev/null
assert_eq 'clients -j' "$(< "$runtime_log")"

: > "$runtime_log"
PATH="$tmpdir:$PATH" HYPRCTL_LOG="$runtime_log" HYPRCTL_FLOATING=false \
    "$DISPATCH" resizewindowpixel 'exact 1920 1080,address:0xabc' >/dev/null
assert_eq $'clients -j\neval hl.dispatch(hl.dsp.window.float({action="set",window="address:0xabc"}))\neval hl.dispatch(hl.dsp.window.resize({x=1920,y=1080,exact=true,window="address:0xabc"}))' \
    "$(< "$runtime_log")"

handler_source=$(< "$ROOT/scripts/centerstage-handler.sh")
if [[ "$handler_source" != *'hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock'* ]]; then
    printf 'centerstage handler must select the current Hyprland instance socket\n' >&2
    exit 1
fi
if [[ "$handler_source" == *'find /run/user/'* ]]; then
    printf 'centerstage handler must not select an arbitrary stale socket\n' >&2
    exit 1
fi

printf 'centerstage dispatch compatibility tests passed\n'
