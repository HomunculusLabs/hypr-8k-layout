#!/usr/bin/env bash
# Translate the legacy Hyprland dispatcher calls used by Centerstage to the
# typed Lua dispatcher API introduced in Hyprland 0.56.
set -euo pipefail

lua_string() {
    jq -Rn --arg value "$1" '$value'
}

fail() {
    printf 'hypr-dispatch: %s\n' "$*" >&2
    exit 2
}

window_is_floating() {
    local selector=${1:-}

    if [[ "$selector" == address:* ]]; then
        hyprctl clients -j | jq -e --arg address "${selector#address:}" \
            '.[] | select(.address == $address and .floating == true)' >/dev/null
    elif [[ -z "$selector" ]]; then
        hyprctl activewindow -j | jq -e '.floating == true' >/dev/null
    else
        return 1
    fi
}

ensure_floating() {
    local selector=${1:-} float_lua
    window_is_floating "$selector" && return

    if [[ -n "$selector" ]]; then
        float_lua="hl.dispatch(hl.dsp.window.float({action=\"set\",window=$(lua_string "$selector")}))"
    else
        float_lua='hl.dispatch(hl.dsp.window.float({action="set"}))'
    fi
    hyprctl eval "$float_lua" >/dev/null
}

[[ $# -gt 0 ]] || fail "missing dispatcher"

# A few older Centerstage calls put the dispatcher and argument in one shell
# word, e.g. "tagwindow -centerstage-left".
if [[ $# -eq 1 && "$1" == *" "* ]]; then
    combined=$1
    set -- "${combined%% *}" "${combined#* }"
fi

dispatcher=$1
shift
lua=""

case "$dispatcher" in
    focuswindow)
        [[ $# -eq 1 ]] || fail "focuswindow expects a window selector"
        lua="hl.dispatch(hl.dsp.focus({window=$(lua_string "$1")}))"
        ;;

    tagwindow)
        [[ ${1:-} == "--" ]] && shift
        [[ $# -ge 1 && $# -le 2 ]] || fail "tagwindow expects a tag and optional window selector"
        tag=$1
        if [[ $# -eq 2 ]]; then
            lua="hl.dispatch(hl.dsp.window.tag({tag=$(lua_string "$tag"),window=$(lua_string "$2")}))"
        else
            lua="hl.dispatch(hl.dsp.window.tag({tag=$(lua_string "$tag")}))"
        fi
        ;;

    setfloating)
        [[ $# -le 1 ]] || fail "setfloating expects an optional window selector"
        if [[ ${CENTERSTAGE_DISPATCH_DRY_RUN:-0} != 1 ]] && window_is_floating "${1:-}"; then
            printf 'ok\n'
            exit 0
        fi
        if [[ $# -eq 1 ]]; then
            lua="hl.dispatch(hl.dsp.window.float({action=\"set\",window=$(lua_string "$1")}))"
        else
            lua='hl.dispatch(hl.dsp.window.float({action="set"}))'
        fi
        ;;

    resizewindowpixel|movewindowpixel)
        [[ $# -eq 1 ]] || fail "$dispatcher expects one geometry argument"
        IFS=',' read -r geometry selector <<< "$1"
        read -r mode x y extra <<< "$geometry"
        [[ "$mode" == "exact" && -n "${x:-}" && -n "${y:-}" && -z "${extra:-}" ]] || fail "unsupported geometry: $geometry"
        [[ -n "${selector:-}" ]] || fail "$dispatcher requires a window selector"
        if [[ "$dispatcher" == resizewindowpixel ]]; then
            [[ ${CENTERSTAGE_DISPATCH_DRY_RUN:-0} == 1 ]] || ensure_floating "$selector"
            lua="hl.dispatch(hl.dsp.window.resize({x=$x,y=$y,exact=true,window=$(lua_string "$selector")}))"
        else
            lua="hl.dispatch(hl.dsp.window.move({x=$x,y=$y,exact=true,window=$(lua_string "$selector")}))"
        fi
        ;;

    resizeactive|moveactive)
        [[ $# -eq 3 && "$1" == "exact" ]] || fail "$dispatcher expects: exact X Y"
        x=$2
        y=$3
        if [[ "$dispatcher" == resizeactive ]]; then
            [[ ${CENTERSTAGE_DISPATCH_DRY_RUN:-0} == 1 ]] || ensure_floating
            lua="hl.dispatch(hl.dsp.window.resize({x=$x,y=$y,exact=true}))"
        else
            lua="hl.dispatch(hl.dsp.window.move({x=$x,y=$y,exact=true}))"
        fi
        ;;

    movetoworkspacesilent)
        [[ $# -eq 1 ]] || fail "movetoworkspacesilent expects WORKSPACE,WINDOW"
        IFS=',' read -r workspace selector <<< "$1"
        [[ -n "${workspace:-}" && -n "${selector:-}" ]] || fail "invalid workspace/window selector: $1"
        lua="hl.dispatch(hl.dsp.window.move({workspace=$(lua_string "$workspace"),follow=false,window=$(lua_string "$selector")}))"
        ;;

    workspace)
        [[ $# -eq 1 ]] || fail "workspace expects one workspace selector"
        lua="hl.dispatch(hl.dsp.focus({workspace=$(lua_string "$1")}))"
        ;;

    exec)
        [[ $# -ge 1 ]] || fail "exec expects a command"
        command=$*
        lua="hl.dispatch(hl.dsp.exec_cmd($(lua_string "$command")))"
        ;;

    setprop)
        [[ $# -ge 3 ]] || fail "setprop expects WINDOW PROPERTY VALUE [lock]"
        window=$1
        prop=$2
        shift 2
        values=("$@")
        lock=false
        last_index=$((${#values[@]} - 1))
        if [[ "${values[$last_index]}" == "lock" ]]; then
            lock=true
            unset 'values[last_index]'
        fi
        value="${values[*]}"
        lua="hl.dispatch(hl.dsp.window.set_prop({window=$(lua_string "$window"),prop=$(lua_string "$prop"),value=$(lua_string "$value"),lock=$lock}))"
        ;;

    *)
        fail "unsupported legacy dispatcher: $dispatcher"
        ;;
esac

if [[ ${CENTERSTAGE_DISPATCH_DRY_RUN:-0} == 1 ]]; then
    printf '%s\n' "$lua"
else
    exec hyprctl eval "$lua"
fi
