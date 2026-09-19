#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-"$HOME/.config/hypr"}
REAL_HOME=$HOME
TEST_HOME=$(mktemp -d)
trap 'rm -rf "$TEST_HOME"' EXIT
export HOME="$TEST_HOME"
export CLIENTS_FILE="$TEST_HOME/clients.json"
export DISPATCH_LOG="$TEST_HOME/dispatch.log"
export RETILE_LOG="$TEST_HOME/retile.log"
mkdir -p "$HOME/.config/hypr/scripts" "$HOME/.config/hypr/state" "$HOME/bin"
cp "$ROOT/scripts/centerstage-pip-workspace-toggle.sh" "$HOME/.config/hypr/scripts/"
cp "$ROOT/scripts/centerstage-lib.sh" "$HOME/.config/hypr/scripts/"

cat > "$HOME/bin/hyprctl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ ${1:-} == clients && ${2:-} == -j ]] || exit 2
cat "$CLIENTS_FILE"
MOCK

cat > "$HOME/bin/notify-send" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

cat > "$HOME/.config/hypr/scripts/centerstage-retile.sh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$RETILE_LOG"
MOCK

cat > "$HOME/.config/hypr/scripts/hypr-dispatch.sh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DISPATCH_LOG"
[[ -n ${MOCK_DISPATCH_DELAY:-} ]] && sleep "$MOCK_DISPATCH_DELAY"
case ${1:-} in
    movetoworkspacesilent)
        IFS=, read -r workspace selector <<< "$2"
        address=${selector#address:}
        tmp=$(mktemp)
        jq --arg address "$address" --arg workspace "$workspace" '
            map(if .address == $address then
                .workspace.id = ($workspace | tonumber) |
                .workspace.name = $workspace
            else . end)' "$CLIENTS_FILE" > "$tmp"
        mv "$tmp" "$CLIENTS_FILE"
        ;;
    setfloating)
        address=${2#address:}
        tmp=$(mktemp)
        jq --arg address "$address" '
            map(if .address == $address then .floating = (.floating | not) else . end)' \
            "$CLIENTS_FILE" > "$tmp"
        mv "$tmp" "$CLIENTS_FILE"
        ;;
    workspace)
        ;;
    *)
        exit 2
        ;;
esac
MOCK
chmod +x "$HOME/bin/hyprctl" "$HOME/bin/notify-send" "$HOME/.config/hypr/scripts/"*.sh
export PATH="$HOME/bin:$PATH"
TOGGLE="$HOME/.config/hypr/scripts/centerstage-pip-workspace-toggle.sh"
MODE_FILE="$HOME/.config/hypr/state/centerstage-pip-workspace-mode"
SAVED_FILE="$HOME/.config/hypr/state/centerstage-pip-workspace-saved.json"
PBP_FILE="$HOME/.config/hypr/state/centerstage-pbp-mode"

reset_case() {
    rm -f "$HOME/.config/hypr/state/"* "$DISPATCH_LOG" "$RETILE_LOG"
    : > "$DISPATCH_LOG"
    : > "$RETILE_LOG"
    unset MOCK_DISPATCH_DELAY
}

assert_client() {
    local address=$1 workspace=$2 floating=$3
    jq -e --arg address "$address" --argjson workspace "$workspace" --argjson floating "$floating" '
        any(.[]; .address == $address and .workspace.id == $workspace and .floating == $floating)' \
        "$CLIENTS_FILE" >/dev/null
}

# Empty layouts toggle cleanly and save an empty array.
reset_case
printf '[]\n' > "$CLIENTS_FILE"
"$TOGGLE"
[[ $(<"$MODE_FILE") == on ]]
[[ $(jq length "$SAVED_FILE") == 0 ]]
"$TOGGLE"
[[ $(<"$MODE_FILE") == off ]]

# Mixed workspaces, sub-zone tags, duplicate position tags, tiled windows, and
# unrelated windows all map and restore without collateral movement.
reset_case
cat > "$CLIENTS_FILE" <<'JSON'
[
  {"address":"0xleft","workspace":{"id":3,"name":"3"},"floating":true,"tags":["centerstage-left-primary"]},
  {"address":"0xright","workspace":{"id":1,"name":"1"},"floating":false,"tags":["centerstage-right","centerstage-right-4"]},
  {"address":"0xcenter","workspace":{"id":2,"name":"2"},"floating":true,"tags":["centerstage-center"]},
  {"address":"0xplain","workspace":{"id":7,"name":"7"},"floating":false,"tags":["terminal*"]}
]
JSON
"$TOGGLE"
assert_client 0xleft 3 true
assert_client 0xright 2 true
assert_client 0xcenter 1 true
assert_client 0xplain 7 false
"$TOGGLE"
assert_client 0xleft 3 true
assert_client 0xright 1 false
assert_client 0xcenter 2 true
assert_client 0xplain 7 false

# A window closed while active is ignored during restoration.
reset_case
cat > "$CLIENTS_FILE" <<'JSON'
[{"address":"0xclosed","workspace":{"id":2,"name":"2"},"floating":true,"tags":["centerstage-left"]}]
JSON
"$TOGGLE"
printf '[]\n' > "$CLIENTS_FILE"
"$TOGGLE"
[[ $(<"$MODE_FILE") == off ]]

# A tagged window opened while active joins workspace 1 on restore.
reset_case
cat > "$CLIENTS_FILE" <<'JSON'
[{"address":"0xexisting","workspace":{"id":1,"name":"1"},"floating":true,"tags":["centerstage-right"]}]
JSON
"$TOGGLE"
tmp=$(mktemp)
jq '. + [{"address":"0xnew","workspace":{"id":2,"name":"2"},"floating":true,"tags":["centerstage-right"]}]' \
    "$CLIENTS_FILE" > "$tmp"
mv "$tmp" "$CLIENTS_FILE"
"$TOGGLE"
assert_client 0xnew 1 true

# Recovery works when mode says on but the saved-state file is missing.
reset_case
printf 'on\n' > "$MODE_FILE"
cat > "$CLIENTS_FILE" <<'JSON'
[{"address":"0xorphan","workspace":{"id":3,"name":"3"},"floating":true,"tags":["centerstage-center"]}]
JSON
"$TOGGLE"
assert_client 0xorphan 1 true
[[ $(<"$MODE_FILE") == off ]]

# The old PBP mode blocks activation without creating PIP state.
reset_case
printf 'off\n' > "$MODE_FILE"
printf 'on\n' > "$PBP_FILE"
printf '[]\n' > "$CLIENTS_FILE"
if "$TOGGLE"; then
    printf 'PBP conflict unexpectedly succeeded\n' >&2
    exit 1
fi
[[ $(<"$MODE_FILE") == off ]]
[[ ! -e "$SAVED_FILE" ]]

# Two near-simultaneous key presses serialize into enable then disable.
reset_case
cat > "$CLIENTS_FILE" <<'JSON'
[{"address":"0xrace","workspace":{"id":1,"name":"1"},"floating":false,"tags":["centerstage-right"]}]
JSON
export MOCK_DISPATCH_DELAY=0.05
"$TOGGLE" & first=$!
"$TOGGLE" & second=$!
wait "$first"
wait "$second"
[[ $(<"$MODE_FILE") == off ]]
assert_client 0xrace 1 false

printf 'centerstage PIP workspace edge-case tests passed\n'
