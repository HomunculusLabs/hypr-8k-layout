#!/bin/bash
# Wait for Bluetooth keyboard (Adv360 Pro) to connect before proceeding
# This ensures the keyboard is available for hyprlock password entry

KEYBOARD_MAC="CA:B2:81:24:01:44"
MAX_ATTEMPTS=30  # 30 attempts * 0.5s = 15 seconds max

for ((i=0; i<MAX_ATTEMPTS; i++)); do
    if bluetoothctl info "$KEYBOARD_MAC" 2>/dev/null | grep -q "Connected: yes"; then
        echo "Bluetooth keyboard connected after $((i/2))s"
        exit 0
    fi
    sleep 0.5
done

echo "Warning: Bluetooth keyboard not connected after 15s"
exit 1
