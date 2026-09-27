#!/usr/bin/env python3
"""
hypr-gamepad.py - Xbox controller daemon for Hyprland desktop control

Maps Xbox controller inputs to desktop actions (centerstage navigation,
media controls, mouse movement) with automatic game detection.
"""

import asyncio
import json
import subprocess
import os
import sys
import signal
import re
from pathlib import Path
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Set
import logging

try:
    import evdev
    from evdev import ecodes, InputDevice, categorize
except ImportError:
    print("Error: python-evdev not installed. Run: sudo pacman -S python-evdev")
    sys.exit(1)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
log = logging.getLogger('hypr-gamepad')

# Paths
CONFIG_DIR = Path.home() / '.config' / 'hypr' / 'gamepad'
STATE_DIR = Path.home() / '.config' / 'hypr' / 'state'
SCRIPTS_DIR = Path.home() / '.config' / 'hypr' / 'scripts'

# Ensure state dir exists
STATE_DIR.mkdir(parents=True, exist_ok=True)


class Mode(Enum):
    DESKTOP = 'desktop'
    GAME = 'game'
    DISABLED = 'disabled'


@dataclass
class Config:
    """Configuration loaded from config.json"""
    dead_zone: int = 8000
    trigger_threshold: int = 30
    mouse_sensitivity: float = 20.0
    mouse_acceleration: float = 1.3
    poll_interval_ms: int = 16
    window_poll_ms: int = 500
    volume_step: int = 5

    # Loaded from games.txt
    game_patterns: List[re.Pattern] = field(default_factory=list)

    @classmethod
    def load(cls) -> 'Config':
        config = cls()

        # Load config.json if exists
        config_file = CONFIG_DIR / 'config.json'
        if config_file.exists():
            try:
                data = json.loads(config_file.read_text())
                for key in ['dead_zone', 'trigger_threshold', 'mouse_sensitivity',
                            'mouse_acceleration', 'poll_interval_ms', 'window_poll_ms',
                            'volume_step']:
                    if key in data:
                        setattr(config, key, data[key])
            except Exception as e:
                log.warning(f"Error loading config.json: {e}")

        # Load game patterns
        games_file = CONFIG_DIR / 'games.txt'
        if games_file.exists():
            for line in games_file.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#'):
                    try:
                        config.game_patterns.append(re.compile(line, re.IGNORECASE))
                    except re.error as e:
                        log.warning(f"Invalid pattern '{line}': {e}")

        return config


@dataclass
class ControllerState:
    """Current state of controller inputs"""
    # Analog axes (raw values)
    left_x: int = 0
    left_y: int = 0
    right_x: int = 0
    right_y: int = 0
    left_trigger: int = 0
    right_trigger: int = 0

    # D-pad state
    dpad_x: int = 0  # -1 left, 0 center, 1 right
    dpad_y: int = 0  # -1 up, 0 center, 1 down

    # Modifier buttons held
    lb_held: bool = False
    rb_held: bool = False

    # Timing for held buttons
    view_press_time: float = 0


def controller_priority(name: str, vendor: int) -> int:
    """Rank physical Xbox-compatible devices and reject Steam Input outputs."""
    name_lower = name.lower()
    if not any(token in name_lower for token in ('xbox', 'microsoft', 'x-box')):
        return -1
    if vendor == 0x28DE:  # Valve/Steam virtual Xbox 360 controller
        return -1
    if vendor == 0x045E:  # Physical Microsoft controller
        return 100
    return 10


class HyprGamepad:
    """Main daemon class"""

    def __init__(self):
        self.config = Config.load()
        self.state = ControllerState()
        self.mode = Mode.DESKTOP
        self.device: Optional[InputDevice] = None
        self.running = True

        # Track right sidebar focus position (1-9)
        self.right_sidebar_pos = 1

        # Track last trigger values for analog volume
        self.last_lt_action = 0
        self.last_rt_action = 0

        # Load initial mode from state file
        self._load_mode()

        # Setup signal handlers
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

    def _signal_handler(self, signum, frame):
        log.info(f"Received signal {signum}, shutting down...")
        self.running = False

    def _load_mode(self):
        """Load mode from state file"""
        mode_file = STATE_DIR / 'gamepad-mode'
        if mode_file.exists():
            try:
                mode_str = mode_file.read_text().strip()
                self.mode = Mode(mode_str)
            except (ValueError, Exception):
                self.mode = Mode.DESKTOP

    def _save_mode(self):
        """Save mode to state file"""
        mode_file = STATE_DIR / 'gamepad-mode'
        mode_file.write_text(self.mode.value)

    def _save_connected(self, connected: bool):
        """Save connection status"""
        conn_file = STATE_DIR / 'gamepad-connected'
        conn_file.write_text('true' if connected else 'false')

    async def find_controller(self) -> Optional[InputDevice]:
        """Find Xbox controller device"""
        devices = [InputDevice(path) for path in evdev.list_devices()]
        candidates = []
        for device in devices:
            priority = controller_priority(device.name, device.info.vendor)
            caps = device.capabilities()
            if priority >= 0 and ecodes.EV_KEY in caps and ecodes.EV_ABS in caps:
                candidates.append((priority, device))

        if candidates:
            _, device = max(candidates, key=lambda candidate: candidate[0])
            log.info(
                f"Found controller: {device.name} at {device.path} "
                f"(vendor={device.info.vendor:04x})"
            )
            return device
        return None

    def run_cmd(self, cmd: str, check: bool = False) -> Optional[str]:
        """Run a shell command"""
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=5
            )
            if check and result.returncode != 0:
                log.warning(f"Command failed: {cmd}")
                return None
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            log.warning(f"Command timed out: {cmd}")
            return None
        except Exception as e:
            log.warning(f"Command error: {e}")
            return None

    def launch_cmd(self, args: List[str]):
        """Launch a desktop application without blocking the input loop."""
        try:
            subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except Exception as e:
            log.warning(f"Launch error ({args[0]}): {e}")

    def notify(self, title: str, message: str):
        """Send desktop notification — never unless a controller is connected.

        Hard gate: with no gamepad attached there is nothing to report, so
        suppress all notices. This covers every caller, including future
        ones, not just the window monitor.
        """
        if self.device is None:
            return
        self.run_cmd(f'notify-send "{title}" "{message}"')

    def hyprctl(self, cmd: str) -> Optional[str]:
        """Run hyprctl command"""
        return self.run_cmd(f'hyprctl {cmd}')

    def hyprctl_eval(self, expression: str) -> Optional[str]:
        """Run a typed Hyprland Lua expression (required by Hyprland 0.56+)."""
        return self.run_cmd(f"hyprctl eval '{expression}'")

    def centerstage(self, script: str, *args: str):
        """Run a centerstage script"""
        script_path = SCRIPTS_DIR / script
        if script_path.exists():
            cmd = f'"{script_path}" {" ".join(args)}'
            self.run_cmd(cmd)
        else:
            log.warning(f"Script not found: {script_path}")

    def ydotool(self, *args: str):
        """Run ydotool command"""
        self.run_cmd(f'ydotool {" ".join(args)}')

    def is_game_window(self, window_info: dict) -> bool:
        """Check if window is a game (should passthrough controller)"""
        if not window_info:
            return False

        window_class = window_info.get('class', '')
        window_title = window_info.get('title', '')

        # Web browser tabs are never game windows: any page title can contain
        # game keywords ("Minecraft guide", "Proton Mail") and flap modes.
        browser_classes = ('brave-browser', 'firefox', 'librewolf', 'chromium',
                           'google-chrome', 'vivaldi', 'opera', 'zen-browser')
        if any(window_class == b or window_class.startswith(b + '-')
               for b in browser_classes):
            return False

        # Check explicit patterns
        for pattern in self.config.game_patterns:
            if pattern.search(window_class) or pattern.search(window_title):
                return True

        # Heuristic: fullscreen + certain indicators
        if window_info.get('fullscreen') == 2:  # Fullscreen client
            # Check for game-like class names
            class_lower = window_class.lower()
            game_hints = ['game', 'steam_app', 'wine', 'proton', 'unity', 'godot', 'sdl']
            if any(hint in class_lower for hint in game_hints):
                return True

        return False

    def get_active_window(self) -> dict:
        """Get active window info"""
        result = self.hyprctl('activewindow -j')
        if result:
            try:
                return json.loads(result)
            except json.JSONDecodeError:
                pass
        return {}

    # ==================== Actions ====================

    def action_focus_direction(self, direction: str):
        """Move focus in direction (l/r/u/d)"""
        self.hyprctl_eval(
            f'hl.dispatch(hl.dsp.focus({{ direction = "{direction}" }}))'
        )

    def action_focus_center(self):
        """Focus center zone"""
        self.centerstage('centerstage-focus.sh', '0')

    def action_focus_left(self):
        """Focus left sidebar"""
        self.action_focus_direction('l')

    def action_focus_right_cycle(self):
        """Cycle through right sidebar positions"""
        self.right_sidebar_pos = (self.right_sidebar_pos % 9) + 1
        self.centerstage('centerstage-focus.sh', str(self.right_sidebar_pos))

    def action_focus_up(self):
        """Focus previous window"""
        self.hyprctl_eval('hl.dispatch(hl.dsp.window.cycle_next({ next = false }))')

    def action_focus_down(self):
        """Focus next window"""
        self.hyprctl_eval('hl.dispatch(hl.dsp.window.cycle_next())')

    def action_move_to_zone(self, zone: str):
        """Move window to zone (left/center/right)"""
        self.centerstage('centerstage-move.sh', zone)

    def action_swap_window(self, direction: str):
        """Swap window in stack (up/down/left/right)"""
        self.centerstage('centerstage-swap.sh', direction)

    def action_resize_center(self):
        """Cycle center width"""
        self.centerstage('centerstage-resize.sh')

    def action_resize_height(self):
        """Cycle center height"""
        self.centerstage('centerstage-height.sh')

    def action_sidebar_balance(self):
        """Cycle sidebar balance"""
        self.centerstage('centerstage-sidebar.sh')

    def action_confirm(self):
        """Enter/confirm"""
        self.ydotool('key', '28:1', '28:0')

    def action_escape(self):
        """Escape/back"""
        self.ydotool('key', '1:1', '1:0')

    def action_mouse_click(self):
        """Left mouse click"""
        self.ydotool('click', '0xC0')

    def action_mouse_right_click(self):
        """Right mouse click"""
        self.ydotool('click', '0xC1')

    def action_mouse_middle_click(self):
        """Middle mouse click"""
        self.ydotool('click', '0xC2')

    def action_launch_terminal(self):
        """Launch terminal to center"""
        self.launch_cmd(['uwsm-app', '--', 'foot'])
        # Give it a moment to spawn, then move to center
        asyncio.get_event_loop().call_later(0.5, lambda: self.action_move_to_zone('center'))

    def action_launch_browser(self):
        """Launch browser"""
        self.launch_cmd(['omarchy-launch-browser'])

    def _handle_x_button(self):
        """Launch a terminal only with the deliberate LB+RB+X chord."""
        if self.state.lb_held and self.state.rb_held:
            self.action_launch_terminal()

    def _handle_y_button(self):
        """Launch a browser only with the deliberate LB+RB+Y chord."""
        if self.state.lb_held and self.state.rb_held:
            self.action_launch_browser()

    def action_volume_down(self):
        """Volume down"""
        self.run_cmd(f'wpctl set-volume @DEFAULT_AUDIO_SINK@ {self.config.volume_step}%-')

    def action_volume_up(self):
        """Volume up"""
        self.run_cmd(f'wpctl set-volume @DEFAULT_AUDIO_SINK@ {self.config.volume_step}%+')

    def action_media_playpause(self):
        """Play/pause media"""
        self.run_cmd('playerctl play-pause')

    def action_media_prev(self):
        """Previous track"""
        self.run_cmd('playerctl previous')

    def action_media_next(self):
        """Next track"""
        self.run_cmd('playerctl next')

    def action_launcher(self):
        """Open app launcher"""
        self.launch_cmd(['omarchy-menu', 'toggle'])

    def action_toggle_mode(self):
        """Toggle desktop/game mode"""
        if self.mode == Mode.DESKTOP:
            self.mode = Mode.GAME
            self.notify('Gamepad', 'Game passthrough mode')
        else:
            self.mode = Mode.DESKTOP
            self.notify('Gamepad', 'Desktop mode enabled')
        self._save_mode()

    # ==================== Input Handling ====================

    async def handle_button(self, code: int, value: int):
        """Handle button press/release"""
        # Track modifiers
        if code == ecodes.BTN_TL:  # LB
            self.state.lb_held = (value == 1)
            return
        if code == ecodes.BTN_TR:  # RB
            self.state.rb_held = (value == 1)
            return

        # View button hold detection
        if code == ecodes.BTN_SELECT:  # View
            if value == 1:
                self.state.view_press_time = asyncio.get_event_loop().time()
            elif value == 0:
                hold_time = asyncio.get_event_loop().time() - self.state.view_press_time
                if hold_time >= 2.0:
                    if self.mode == Mode.DESKTOP:
                        self.mode = Mode.DISABLED
                        self.notify('Gamepad', 'Gamepad disabled')
                    else:
                        self.mode = Mode.DESKTOP
                        self.notify('Gamepad', 'Desktop mode enabled')
                    self._save_mode()
                elif self.mode == Mode.DESKTOP:
                    # In games, View is commonly bound to the map. Never let a
                    # normal tap re-enable desktop mouse/keyboard injection.
                    self.action_toggle_mode()
            return

        # Only handle presses (not releases) for other buttons
        if value != 1:
            return

        # Handle based on button
        actions = {
            ecodes.BTN_SOUTH: self.action_confirm,           # A
            ecodes.BTN_EAST: self.action_escape,             # B
            ecodes.BTN_WEST: self._handle_x_button,          # LB+RB+X: terminal
            ecodes.BTN_NORTH: self._handle_y_button,         # LB+RB+Y: browser
            ecodes.BTN_START: self.action_media_playpause,   # Menu
            ecodes.BTN_MODE: self.action_launcher,           # Xbox button
            ecodes.BTN_THUMBL: self._handle_left_stick_click,   # Left stick click
            ecodes.BTN_THUMBR: self._handle_right_stick_click,  # Mouse buttons
        }

        action = actions.get(code)
        if action:
            action()

    def _handle_left_stick_click(self):
        """Handle left stick click with modifiers"""
        if self.state.lb_held:
            self.action_move_to_zone('center')
        elif self.state.rb_held:
            self.action_sidebar_balance()
        else:
            self.action_focus_center()

    def _handle_right_stick_click(self):
        """Use shoulder modifiers for all three mouse buttons."""
        if self.state.rb_held:
            self.action_mouse_right_click()
        elif self.state.lb_held:
            self.action_mouse_middle_click()
        else:
            self.action_mouse_click()

    async def handle_dpad(self, code: int, value: int):
        """Handle D-pad input"""
        # Update state
        if code == ecodes.ABS_HAT0X:
            self.state.dpad_x = value
        elif code == ecodes.ABS_HAT0Y:
            self.state.dpad_y = value

        # Only act on press (value != 0)
        if value == 0:
            return

        # With LB held - window movement
        if self.state.lb_held:
            if code == ecodes.ABS_HAT0X:
                if value < 0:
                    self.action_move_to_zone('left')
                else:
                    self.action_move_to_zone('right')
            elif code == ecodes.ABS_HAT0Y:
                if value < 0:
                    self.action_swap_window('up')
                else:
                    self.action_swap_window('down')
            return

        # With RB held - layout adjustment
        if self.state.rb_held:
            if code == ecodes.ABS_HAT0X:
                self.action_resize_center()
            elif code == ecodes.ABS_HAT0Y:
                self.action_resize_height()
            return

        # No modifier - navigation
        if code == ecodes.ABS_HAT0X:
            if value < 0:
                self.action_focus_left()
            else:
                self.action_focus_right_cycle()
        elif code == ecodes.ABS_HAT0Y:
            if value < 0:
                self.action_focus_up()
            else:
                self.action_focus_down()

    async def handle_axis(self, code: int, value: int):
        """Handle analog axis input"""
        # D-pad comes as ABS_HAT0X/Y
        if code in (ecodes.ABS_HAT0X, ecodes.ABS_HAT0Y):
            await self.handle_dpad(code, value)
            return

        # Store raw values for sticks
        if code == ecodes.ABS_X:
            self.state.left_x = value
        elif code == ecodes.ABS_Y:
            self.state.left_y = value
        elif code == ecodes.ABS_RX:
            self.state.right_x = value
        elif code == ecodes.ABS_RY:
            self.state.right_y = value
        elif code == ecodes.ABS_Z:  # Left trigger
            self.state.left_trigger = value
        elif code == ecodes.ABS_RZ:  # Right trigger
            self.state.right_trigger = value

    def apply_dead_zone(self, value: int, center: int = 0) -> int:
        """Apply dead zone to analog value"""
        adjusted = value - center
        if abs(adjusted) < self.config.dead_zone:
            return 0
        return adjusted

    # ==================== Main Loops ====================

    async def input_loop(self):
        """Read and process controller events"""
        try:
            async for event in self.device.async_read_loop():
                if not self.running:
                    break

                # Skip if in game/disabled mode
                if self.mode != Mode.DESKTOP:
                    # Still need to handle View button to toggle back
                    if event.type == ecodes.EV_KEY and event.code == ecodes.BTN_SELECT:
                        await self.handle_button(event.code, event.value)
                    continue

                if event.type == ecodes.EV_KEY:
                    await self.handle_button(event.code, event.value)
                elif event.type == ecodes.EV_ABS:
                    await self.handle_axis(event.code, event.value)

        except OSError as e:
            log.warning(f"Device error: {e}")
            self.device = None
            self._save_connected(False)

    async def analog_loop(self):
        """Process analog inputs at fixed interval (mouse movement, triggers)"""
        while self.running:
            if self.device and self.mode == Mode.DESKTOP:
                # Mouse movement from right stick
                # xpad reports signed stick axes (-32768..32767), centered at 0.
                # Treating 32768 as the center makes an idle stick look fully
                # deflected and pins the cursor to the top-left corner.
                rx = self.apply_dead_zone(self.state.right_x, 0)
                ry = self.apply_dead_zone(self.state.right_y, 0)

                if rx != 0 or ry != 0:
                    # Apply sensitivity and acceleration
                    max_val = 32768 - self.config.dead_zone
                    norm_x = rx / max_val
                    norm_y = ry / max_val

                    # Apply acceleration curve
                    acc = self.config.mouse_acceleration
                    move_x = int(norm_x * abs(norm_x) ** (acc - 1) * self.config.mouse_sensitivity)
                    move_y = int(norm_y * abs(norm_y) ** (acc - 1) * self.config.mouse_sensitivity)

                    if move_x != 0 or move_y != 0:
                        self.ydotool('mousemove', '--', str(move_x), str(move_y))

                # Left stick focus movement disabled - use D-pad for navigation
                # (continuous polling caused focus lock issues)

                # Triggers for volume (analog)
                lt = self.state.left_trigger
                rt = self.state.right_trigger

                if lt > self.config.trigger_threshold:
                    if self.last_lt_action == 0:
                        self.action_volume_down()
                        self.last_lt_action = lt
                    elif lt - self.last_lt_action > 50:
                        self.action_volume_down()
                        self.last_lt_action = lt
                else:
                    self.last_lt_action = 0

                if rt > self.config.trigger_threshold:
                    if self.last_rt_action == 0:
                        self.action_volume_up()
                        self.last_rt_action = rt
                    elif rt - self.last_rt_action > 50:
                        self.action_volume_up()
                        self.last_rt_action = rt
                else:
                    self.last_rt_action = 0

            await asyncio.sleep(self.config.poll_interval_ms / 1000)

    async def window_monitor_loop(self):
        """Monitor active window for game detection"""
        last_game_state = False

        while self.running:
            # Only detect games while a controller is actually connected.
            # Without this gate, browsing alone flaps modes and spams
            # "Game detected"/"Desktop mode" notices with no gamepad attached.
            if self.device is not None and self.mode != Mode.DISABLED:
                window = self.get_active_window()
                is_game = self.is_game_window(window)

                if is_game != last_game_state:
                    if is_game:
                        self.mode = Mode.GAME
                        self._save_mode()
                        self.notify('Gamepad', 'Game detected - passthrough mode')
                    elif self.mode == Mode.GAME:
                        # Only switch back if we were auto-switched
                        self.mode = Mode.DESKTOP
                        self._save_mode()
                        self.notify('Gamepad', 'Desktop mode enabled')

                    last_game_state = is_game

            await asyncio.sleep(self.config.window_poll_ms / 1000)

    async def device_monitor_loop(self):
        """Monitor for controller connect/disconnect"""
        while self.running:
            if self.device is None:
                self.device = await self.find_controller()
                if self.device:
                    self._save_connected(True)
                    self.notify('Gamepad', f'Connected: {self.device.name}')
                    # Start input loop for this device
                    asyncio.create_task(self.input_loop())

            await asyncio.sleep(2)

    async def run(self):
        """Main entry point"""
        log.info("hypr-gamepad starting...")

        # Start all loops
        await asyncio.gather(
            self.device_monitor_loop(),
            self.window_monitor_loop(),
            self.analog_loop(),
        )


def main():
    daemon = HyprGamepad()
    try:
        asyncio.run(daemon.run())
    except KeyboardInterrupt:
        log.info("Interrupted")
    finally:
        daemon._save_connected(False)
        log.info("hypr-gamepad stopped")


if __name__ == '__main__':
    main()
