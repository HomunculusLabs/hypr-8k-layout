#!/bin/bash
# Queue layouts against the transaction snapshot; never dispatch or refocus here.

centerstage_plan_grid() {
    local tag=$1 workspace=$2 zone_x=$3 zone_width=$4
    local count cols rows cell_width cell_height x y i pos
    local zone_height=$TOTAL_HEIGHT zone_y=$ZONE_Y center_height
    local -a windows
    mapfile -t windows < <(jq -r --arg tag "$tag" --argjson ws "$workspace" '
        [.[] | select(.workspace.id == $ws and ((.tags // []) | index($tag)))
         | . + {position: ((.tags // []) | map(select(test("^centerstage-right-[1-9][0-9]*$"))
                           | ltrimstr("centerstage-right-") | tonumber) | first // 999)}]
        | sort_by([.position, .at[1], .at[0]]) | .[].address' <<< "$CENTERSTAGE_CLIENTS")
    count=${#windows[@]}
    [[ "$count" -gt 0 ]] || return 0

    if [[ "$tag" == centerstage-right ]] && ! is_pip_workspace_mode && ! is_pbp_mode; then
        if [[ "$count" -lt 4 ]]; then
            zone_width=$((zone_width / 2))
        elif [[ "$count" -lt 7 ]]; then
            zone_width=$((zone_width * 4 / 5))
        fi
        zone_x=$((SCREEN_WIDTH - EDGE_MARGIN - zone_width))
    fi

    if [[ "$tag" == centerstage-center ]]; then
        local height_file=${CENTERSTAGE_HEIGHT_FILE:-$STATE_DIR/centerstage-center-height-$workspace}
        [[ -f "$height_file" ]] && center_height=$(<"$height_file")
        case "$center_height" in
            1080|1200|1400|1600|1800|1960)
                zone_height=$center_height
                zone_y=$(((SCREEN_HEIGHT - zone_height) / 2))
                ;;
        esac
        read -r cols rows <<< "$(calculate_grid_center "$count")"
    else
        read -r cols rows <<< "$(calculate_grid "$count")"
    fi
    cell_width=$(((zone_width - (cols - 1) * GAP_IN) / cols))
    cell_height=$(((zone_height - (rows - 1) * GAP_IN) / rows))
    for i in "${!windows[@]}"; do
        x=$((zone_x + (i % cols) * (cell_width + GAP_IN)))
        y=$((zone_y + (i / cols) * (cell_height + GAP_IN)))
        centerstage_place "${windows[$i]}" "$x" "$y" "$cell_width" "$cell_height" || return 1
        if [[ "$tag" == centerstage-right ]]; then
            for pos in {1..9}; do
                [[ "$pos" -eq $((i + 1)) ]] && continue
                centerstage_tag "${windows[$i]}" "-centerstage-right-$pos" || return 1
            done
            centerstage_tag "${windows[$i]}" "+centerstage-right-$((i + 1))" || return 1
        fi
    done
    return 0
}

centerstage_plan_zone() {
    local zone=$1 workspace=$2 zone_x zone_width tag addr left_mode old_tag
    [[ "$zone" =~ ^(left|center|right)$ && "$workspace" =~ ^[1-3]$ ]] || return 1
    if [[ "$zone" == left ]]; then
        left_mode=$(get_left_layout_mode "$workspace")
        # Workspace/PIP transfers can bring memberships from a different mode.
        # Reconcile them inside this same batch before computing cell geometry.
        while read -r addr tag; do
            [[ -n "$addr" ]] || continue
            for old_tag in centerstage-left centerstage-left-primary centerstage-left-secondary; do
                [[ "$old_tag" == "$tag" ]] || centerstage_tag "$addr" "-$old_tag" || return 1
            done
            centerstage_tag "$addr" "+$tag" || return 1
            CENTERSTAGE_CLIENTS=$(jq -c --arg addr "$addr" --arg tag "$tag" '
                map(if .address == $addr then
                    .tags = ((.tags // []) | map(select(test("^centerstage-left(-(primary|secondary))?$") | not))) + [$tag]
                else . end)' <<< "$CENTERSTAGE_CLIENTS") || return 1
        done < <(jq -r --argjson ws "$workspace" --arg mode "$left_mode" '
            .[] | select(.workspace.id == $ws) |
            ((.tags // []) | map(select(test("^centerstage-left(-(primary|secondary))?$")))) as $left |
            select($left | length > 0) |
            (if $mode == "single" then "centerstage-left"
             elif $left | index("centerstage-left-primary") then "centerstage-left-primary"
             elif $left | index("centerstage-left-secondary") then "centerstage-left-secondary"
             elif .class == "obsidian" or .class == "Mai Buddy" then "centerstage-left-primary"
             else "centerstage-left-secondary" end) as $tag |
            select($left != [$tag]) | [.address, $tag] | @tsv' <<< "$CENTERSTAGE_CLIENTS")
    fi
    if [[ "$zone" == left && "$left_mode" != single ]]; then
        read -r zone_x zone_width tag <<< "$(get_left_subcolumn_dimensions primary)"
        while IFS= read -r addr; do
            [[ -n "$addr" ]] || continue
            centerstage_place "$addr" "$zone_x" "$ZONE_Y" "$zone_width" "$TOTAL_HEIGHT" || return 1
        done < <(jq -r --arg tag "$tag" --argjson ws "$workspace" '
            .[] | select(.workspace.id == $ws and ((.tags // []) | index($tag))) | .address' <<< "$CENTERSTAGE_CLIENTS")
        read -r zone_x zone_width tag <<< "$(get_left_subcolumn_dimensions secondary)"
    else
        read -r zone_x zone_width tag <<< "$(get_zone_dimensions "$zone")"
    fi
    centerstage_plan_grid "$tag" "$workspace" "$zone_x" "$zone_width"
}

centerstage_change_zone() {
    local addr=$1 zone=$2 workspace=${CS_WORKSPACE[$1]:-} tag class old_tag old_zone
    local -A affected=()
    [[ "$zone" =~ ^(left|left-primary|left-secondary|center|right)$ && "$workspace" =~ ^[1-3]$ ]] || return 1
    if [[ "$zone" == left && "$(get_left_layout_mode)" != single ]]; then
        class=$(jq -r --arg addr "$addr" '.[] | select(.address == $addr) | .class' <<< "$CENTERSTAGE_CLIENTS")
        if [[ "$class" == obsidian || "$class" == "Mai Buddy" ]]; then zone=left-primary; else zone=left-secondary; fi
    fi
    tag="centerstage-$zone"
    # Give an explicitly centered game the whole stage, not half of a narrow
    # two-window grid. Keep displaced work available in the right sidebar.
    if [[ "$zone" == center && "${CS_WOW[$addr]:-}" == true ]]; then
        local displaced
        CENTERSTAGE_COMMANDS+=("if not cs_snapshot['$addr'] then return end")
        while IFS= read -r displaced; do
            [[ -n "$displaced" ]] || continue
            CENTERSTAGE_COMMANDS+=("if not cs_snapshot['$displaced'] then return end")
        done < <(jq -r --arg addr "$addr" --argjson ws "$workspace" '
            .[] | select(.address != $addr and .workspace.id == $ws and
            ((.tags // []) | index("centerstage-center"))) | .address' <<< "$CENTERSTAGE_CLIENTS")
        while IFS= read -r displaced; do
            [[ -n "$displaced" ]] || continue
            centerstage_tag "$displaced" -centerstage-center || return 1
            centerstage_tag "$displaced" +centerstage-right || return 1
            affected[right]=1
        done < <(jq -r --arg addr "$addr" --argjson ws "$workspace" '
            .[] | select(.address != $addr and .workspace.id == $ws and
            ((.tags // []) | index("centerstage-center"))) | .address' <<< "$CENTERSTAGE_CLIENTS")
        CENTERSTAGE_CLIENTS=$(jq -c --arg addr "$addr" --argjson ws "$workspace" '
            map(if .address != $addr and .workspace.id == $ws and
                ((.tags // []) | index("centerstage-center")) then
                .tags = ((.tags // []) | map(select(. != "centerstage-center"))) + ["centerstage-right"]
            else . end)' <<< "$CENTERSTAGE_CLIENTS") || return 1
    fi
    for old_tag in ${CS_ZONE_TAGS[$addr]}; do
        old_zone=${old_tag#centerstage-}
        affected[${old_zone%%-*}]=1
        [[ "$old_tag" == "$tag" ]] || centerstage_tag "$addr" "-$old_tag" || return 1
    done
    centerstage_tag "$addr" "+$tag" || return 1
    affected[${zone%%-*}]=1
    # The planner sees the intended membership; the commit guard retains the
    # original snapshot and validates it before applying any of these changes.
    CENTERSTAGE_CLIENTS=$(jq -c --arg addr "$addr" --arg tag "$tag" '
        map(if .address == $addr then
            .tags = ((.tags // []) | map(select(test("^centerstage-(left(-(primary|secondary))?|center|right(-[1-9][0-9]*)?)$") | not)) + [$tag])
        else . end)' <<< "$CENTERSTAGE_CLIENTS") || return 1
    for old_zone in left center right; do
        [[ -n "${affected[$old_zone]:-}" ]] || continue
        centerstage_plan_zone "$old_zone" "$workspace" || return 1
    done
}
