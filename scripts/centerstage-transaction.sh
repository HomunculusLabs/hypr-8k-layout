#!/bin/bash
# Shared batched, address-targeted updates for the active Centerstage scripts.
# Source after centerstage-lib.sh. The caller owns the transaction lock until exit.

centerstage_begin() {
    mkdir -p "$STATE_DIR"
    exec {CENTERSTAGE_LOCK_FD}>"$STATE_DIR/centerstage-layout.lock"
    flock "$CENTERSTAGE_LOCK_FD" || return 1
    CENTERSTAGE_CLIENTS=$(hyprctl clients -j) || return 1
    jq -e 'type == "array"' <<< "$CENTERSTAGE_CLIENTS" >/dev/null || return 1
    CENTERSTAGE_CLIENTS=$(jq -c '[.[] | select(
        .mapped != false and .hidden != true and (.fullscreen // 0) == 0 and
        .pinned != true and ((.tags // []) | index("centerstage-pinned") | not) and
        .class != "org.omarchy.screensaver" and
        (((.class // "") | startswith("steam_app_") | not) or
         ((.title // "") | startswith("Battle.net"))))]' <<< "$CENTERSTAGE_CLIENTS") || return 1
    CENTERSTAGE_COMMANDS=()
    declare -gA CS_GEOMETRY=() CS_FLOATING=() CS_TAGS=() CS_ZONE_TAGS=() CS_WORKSPACE=()
    local addr floating x y width height workspace tags zone_tags
    while IFS=$'\t' read -r addr floating x y width height workspace tags zone_tags; do
        [[ "$addr" =~ ^0x[[:xdigit:]]+$ && "$workspace" =~ ^-?[0-9]+$ ]] || continue
        CS_GEOMETRY[$addr]="$x $y $width $height"
        CS_FLOATING[$addr]=$floating
        CS_WORKSPACE[$addr]=$workspace
        CS_TAGS[$addr]=" $tags "
        CS_ZONE_TAGS[$addr]="$zone_tags"
    done < <(jq -r '.[] | [.address, .floating, .at[0], .at[1], .size[0], .size[1], .workspace.id,
                          ((.tags // []) | join(" ")),
                          ((.tags // []) | map(select(test("^centerstage-(left(-(primary|secondary))?|center|right(-[1-9][0-9]*)?)$"))) | join(" "))] | @tsv' <<< "$CENTERSTAGE_CLIENTS")
}

centerstage_place() {
    local addr=$1 x=$2 y=$3 width=$4 height=$5
    [[ "$addr" =~ ^0x[[:xdigit:]]+$ ]] || return 1
    [[ "$x" =~ ^-?[0-9]+$ && "$y" =~ ^-?[0-9]+$ ]] || return 1
    [[ "$width" =~ ^[0-9]+$ && "$height" =~ ^[0-9]+$ ]] || return 1
    (( width > 0 && height > 0 )) || return 1
    [[ -n "${CS_GEOMETRY[$addr]:-}" ]] || return 0
    local old_x old_y old_width old_height geometry=""
    read -r old_x old_y old_width old_height <<< "${CS_GEOMETRY[$addr]}"
    if [[ "$width $height" != "$old_width $old_height" || "${CS_FLOATING[$addr]}" != true ]]; then
        geometry+="hl.dispatch(hl.dsp.window.resize({x=$width,y=$height,exact=true,window='address:$addr'})) "
    fi
    # Floating resize preserves the center, not the top-left corner. Always
    # restore the anchor after a resize, even if the requested position matches.
    if [[ -n "$geometry" || "$x $y" != "$old_x $old_y" ]]; then
        geometry+="hl.dispatch(hl.dsp.window.move({x=$x,y=$y,exact=true,window='address:$addr'})) "
    fi
    [[ -n "$geometry" ]] || return 0
    # Query the live object inside the batch: action="set" can toggle an
    # already-floating window on 0.56.2, and tiled exact-resizes are unsafe.
    CENTERSTAGE_COMMANDS+=("do
        if cs_snapshot['$addr'] then
            local w = hl.get_window('address:$addr')
            if not w.floating then
                hl.dispatch(hl.dsp.window.float({action='set',window='address:$addr'}))
            end
            $geometry
        end
    end")
}

centerstage_tag() {
    local addr=$1 tag=$2
    [[ "$addr" =~ ^0x[[:xdigit:]]+$ ]] || return 1
    [[ "$tag" =~ ^[+-]centerstage-(left(-primary|-secondary)?|center|right(-[1-9][0-9]*)?)$ ]] || return 1
    [[ -n "${CS_WORKSPACE[$addr]:-}" ]] || return 0
    local name=${tag:1}
    if [[ "$tag" == +* ]]; then
        [[ "${CS_TAGS[$addr]:-}" == *" $name "* ]] && return 0
        CS_TAGS[$addr]="${CS_TAGS[$addr]:- }$name "
    else
        [[ "${CS_TAGS[$addr]:-}" == *" $name "* ]] || return 0
        CS_TAGS[$addr]=${CS_TAGS[$addr]//" $name "/ }
    fi
    CENTERSTAGE_COMMANDS+=("if cs_snapshot['$addr'] then
        hl.dispatch(hl.dsp.window.tag({tag='$tag',window='address:$addr'}))
    end")
}

centerstage_commit() {
    [[ ${#CENTERSTAGE_COMMANDS[@]} -eq 0 ]] && return 0
    local reply guard='
        local function cs_is_zone_tag(tag)
            return tag == "centerstage-left" or tag == "centerstage-left-primary" or
                   tag == "centerstage-left-secondary" or tag == "centerstage-center" or
                   tag == "centerstage-right" or tag:match("^centerstage%-right%-%d+$") ~= nil
        end
        local function cs_window(address, workspace, expected_zone_tags)
            local w = hl.get_window(address)
            if not w or not w.mapped or w.hidden or w.fullscreen ~= 0 or w.pinned or
               not w.workspace or w.workspace.id ~= workspace or type(w.tags) ~= "table" then return nil end
            if w.class == "org.omarchy.screensaver" or
               (w.class:match("^steam_app_") and not w.title:match("^Battle%.net")) then return nil end
            local actual_zone_tags = {}
            for _, tag in ipairs(w.tags) do
                if type(tag) == "string" and cs_is_zone_tag(tag) then
                    actual_zone_tags[tag] = true
                end
            end
            for tag in pairs(expected_zone_tags) do
                if not actual_zone_tags[tag] then return nil end
            end
            for tag in pairs(actual_zone_tags) do
                if not expected_zone_tags[tag] then return nil end
            end
            for _, tag in ipairs(w.tags) do
                if tag == "centerstage-pinned" then return nil end
            end
            return w
        end
        local cs_snapshot = {}
    '
    local addr tag
    for addr in "${!CS_WORKSPACE[@]}"; do
        guard+="
        cs_snapshot['$addr'] = cs_window('address:$addr', ${CS_WORKSPACE[$addr]}, {"
        for tag in ${CS_ZONE_TAGS[$addr]}; do
            guard+="['$tag'] = true,"
        done
        guard+="})
        "
    done
    reply=$(hyprctl eval "$guard ${CENTERSTAGE_COMMANDS[*]}") || return 1
    if [[ "$reply" != "ok" ]]; then
        printf 'Centerstage transaction failed: %s\n' "$reply" >&2
        return 1
    fi
}
