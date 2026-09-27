-- Start the scheduled blue-light filter with the Hyprland session.
o.launch_on_start("hyprsunset")

-- Restore the named workstation session after Hyprland is ready.
o.exec_on_start((os.getenv("HOME") or "") .. "/.config/hypr/scripts/centerstage-session-startup.sh")
