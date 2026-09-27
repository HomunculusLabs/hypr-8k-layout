#!/bin/bash
# hypr-gamepad-ctl.sh - Control interface for gamepad daemon

STATE_DIR="$HOME/.config/hypr/state"
MODE_FILE="$STATE_DIR/gamepad-mode"
CONN_FILE="$STATE_DIR/gamepad-connected"

usage() {
    echo "Usage: $0 {status|desktop|game|disable|toggle|restart|logs}"
    echo ""
    echo "Commands:"
    echo "  status   - Show current mode and connection status"
    echo "  desktop  - Switch to desktop control mode"
    echo "  game     - Switch to game passthrough mode"
    echo "  disable  - Disable gamepad daemon"
    echo "  toggle   - Toggle between desktop and game modes"
    echo "  restart  - Restart the daemon service"
    echo "  logs     - Show daemon logs (follow mode)"
    exit 1
}

case "$1" in
    status)
        mode=$(cat "$MODE_FILE" 2>/dev/null || echo "unknown")
        connected=$(cat "$CONN_FILE" 2>/dev/null || echo "false")
        active=$(systemctl --user is-active hypr-gamepad.service 2>/dev/null || echo "inactive")

        echo "Service: $active"
        echo "Mode: $mode"
        echo "Connected: $connected"
        ;;

    desktop)
        echo "desktop" > "$MODE_FILE"
        notify-send "Gamepad" "Desktop mode enabled"
        ;;

    game)
        echo "game" > "$MODE_FILE"
        notify-send "Gamepad" "Game passthrough mode"
        ;;

    disable)
        echo "disabled" > "$MODE_FILE"
        notify-send "Gamepad" "Gamepad disabled"
        ;;

    toggle)
        current=$(cat "$MODE_FILE" 2>/dev/null || echo "desktop")
        if [[ "$current" == "desktop" ]]; then
            echo "game" > "$MODE_FILE"
            notify-send "Gamepad" "Game passthrough mode"
        else
            echo "desktop" > "$MODE_FILE"
            notify-send "Gamepad" "Desktop mode enabled"
        fi
        ;;

    restart)
        systemctl --user restart hypr-gamepad.service
        echo "Restarted hypr-gamepad.service"
        ;;

    logs)
        journalctl --user -u hypr-gamepad.service -f
        ;;

    *)
        usage
        ;;
esac
