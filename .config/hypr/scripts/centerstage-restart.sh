#!/bin/bash
# Restart centerstage handler cleanly

pkill -9 -f centerstage-handler
pkill -9 -f "socat.*socket2"
rm -f ~/.config/hypr/state/centerstage-handler.lock
sleep 0.5
~/.config/hypr/scripts/centerstage-handler.sh &
echo "Centerstage handler restarted"
