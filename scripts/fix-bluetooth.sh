#!/bin/bash
# Fix ASUS USB-BT500 Bluetooth adapter jankiness
# Disables USB autosuspend which causes latency, disconnects, and audio stuttering

set -e

echo "Fixing Bluetooth power management..."

# 1. Fix udev rule for ASUS USB-BT500
echo "Creating udev rule..."
sudo tee /etc/udev/rules.d/50-bluetooth-power.rules > /dev/null << 'EOF'
# Disable autosuspend for ASUS USB-BT500 Bluetooth adapter
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="0b05", ATTR{idProduct}=="190e", ATTR{power/control}="on"

# Fallback: disable autosuspend for any Bluetooth class device
ACTION=="add", SUBSYSTEM=="usb", ATTR{bDeviceClass}=="e0", ATTR{bDeviceSubClass}=="01", ATTR{power/control}="on"
EOF

# 2. Disable btusb module autosuspend
echo "Creating modprobe config..."
sudo tee /etc/modprobe.d/btusb.conf > /dev/null << 'EOF'
options btusb enable_autosuspend=N
EOF

# 3. Apply immediately
echo "Applying changes..."
sudo udevadm control --reload-rules

# Find and fix any currently connected BT adapters
for dev in /sys/bus/usb/devices/*/; do
    if [[ -f "${dev}idVendor" && -f "${dev}idProduct" ]]; then
        vendor=$(cat "${dev}idVendor" 2>/dev/null)
        product=$(cat "${dev}idProduct" 2>/dev/null)
        # ASUS USB-BT500
        if [[ "$vendor" == "0b05" && "$product" == "190e" ]]; then
            echo "Found ASUS USB-BT500 at ${dev}"
            echo on | sudo tee "${dev}power/control" > /dev/null
            echo "  Power control set to: $(cat "${dev}power/control")"
        fi
    fi
done

echo ""
echo "Done! Changes applied immediately."
echo "The modprobe change will take full effect after reboot (or reload btusb module)."
