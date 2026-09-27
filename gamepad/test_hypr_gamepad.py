#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("hypr-gamepad.py")
SPEC = importlib.util.spec_from_file_location("hypr_gamepad", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PalworldDetectionTests(unittest.TestCase):
    def setUp(self):
        self.mapper = object.__new__(MODULE.HyprGamepad)
        self.mapper.config = MODULE.Config.load()

    def test_palworld_steam_app_class_enables_passthrough(self):
        window = {"class": "steam_app_1623730", "title": "Palworld", "fullscreen": 0}
        self.assertTrue(self.mapper.is_game_window(window))

    def test_palworld_shipping_executable_enables_passthrough(self):
        window = {"class": "Pal-Win64-Shipping.exe", "title": "Palworld", "fullscreen": 0}
        self.assertTrue(self.mapper.is_game_window(window))

    def test_browser_page_about_palworld_does_not_enable_passthrough(self):
        window = {
            "class": "brave-browser",
            "title": "Palworld guide - Brave",
            "fullscreen": 0,
        }
        self.assertFalse(self.mapper.is_game_window(window))

    def test_proton_mail_tab_does_not_enable_passthrough(self):
        window = {
            "class": "brave-browser",
            "title": "Proton Mail - Brave",
            "fullscreen": 0,
        }
        self.assertFalse(self.mapper.is_game_window(window))

    def test_window_monitor_skips_detection_when_no_controller(self):
        mapper = object.__new__(MODULE.HyprGamepad)
        mapper.mode = MODULE.Mode.DESKTOP
        mapper.device = None
        mapper.running = True
        mapper.config = MODULE.Config()
        probed = []

        mapper.get_active_window = lambda: probed.append(1) or {}
        mapper._save_mode = lambda: None
        mapper.notify = lambda *_: None

        import asyncio

        async def run_for(seconds):
            task = asyncio.create_task(
                MODULE.HyprGamepad.window_monitor_loop(mapper)
            )
            await asyncio.sleep(seconds)
            task.cancel()

        # ~3 poll cycles with no controller: must never probe the window
        asyncio.run(run_for(1.2))
        self.assertEqual([], probed)

    def test_window_monitor_probes_when_controller_connected(self):
        mapper = object.__new__(MODULE.HyprGamepad)
        mapper.mode = MODULE.Mode.DESKTOP
        mapper.device = object()  # truthy: controller present
        mapper.running = True
        mapper.config = MODULE.Config()
        probed = []

        mapper.get_active_window = lambda: probed.append(1) or {}
        mapper._save_mode = lambda: None
        mapper.notify = lambda *_: None

        import asyncio

        async def run_for(seconds):
            task = asyncio.create_task(
                MODULE.HyprGamepad.window_monitor_loop(mapper)
            )
            await asyncio.sleep(seconds)
            task.cancel()

        asyncio.run(run_for(1.2))
        self.assertNotEqual([], probed)

    def test_connected_controller_still_detects_games(self):
        self.assertTrue(
            self.mapper.is_game_window(
                {"class": "steam_app_1623730", "title": "Palworld", "fullscreen": 0}
            )
        )


class ControllerSelectionTests(unittest.TestCase):
    def test_physical_microsoft_controller_beats_steam_virtual_controller(self):
        physical = MODULE.controller_priority(
            "Microsoft X-Box One Elite 2 pad", 0x045E
        )
        steam_virtual = MODULE.controller_priority("Microsoft X-Box 360 pad 0", 0x28DE)

        self.assertGreater(physical, steam_virtual)
        self.assertLess(steam_virtual, 0)


class GameModeButtonTests(unittest.IsolatedAsyncioTestCase):
    async def test_short_view_press_in_game_does_not_leave_passthrough(self):
        mapper = object.__new__(MODULE.HyprGamepad)
        mapper.mode = MODULE.Mode.GAME
        mapper.state = MODULE.ControllerState()
        mapper._save_mode = lambda: None
        mapper.notify = lambda _title, _message: None

        await mapper.handle_button(MODULE.ecodes.BTN_SELECT, 1)
        await mapper.handle_button(MODULE.ecodes.BTN_SELECT, 0)

        self.assertEqual(MODULE.Mode.GAME, mapper.mode)

    async def test_long_view_press_in_game_returns_to_desktop(self):
        mapper = object.__new__(MODULE.HyprGamepad)
        mapper.mode = MODULE.Mode.GAME
        mapper.state = MODULE.ControllerState()
        mapper._save_mode = lambda: None
        mapper.notify = lambda _title, _message: None

        loop = MODULE.asyncio.get_running_loop()
        mapper.state.view_press_time = loop.time() - 2.1
        await mapper.handle_button(MODULE.ecodes.BTN_SELECT, 0)

        self.assertEqual(MODULE.Mode.DESKTOP, mapper.mode)


class NotifyGateTests(unittest.TestCase):
    def _make_mapper(self, device):
        mapper = object.__new__(MODULE.HyprGamepad)
        mapper.device = device
        return mapper

    def test_notify_suppressed_when_no_controller(self):
        mapper = self._make_mapper(None)
        sent = []
        mapper.run_cmd = lambda cmd: sent.append(cmd)
        mapper.notify("Gamepad", "Game detected - passthrough mode")
        self.assertEqual([], sent)

    def test_notify_allowed_when_controller_connected(self):
        mapper = self._make_mapper(object())  # truthy: controller present
        sent = []
        mapper.run_cmd = lambda cmd: sent.append(cmd)
        mapper.notify("Gamepad", "Connected: Xbox pad")
        self.assertEqual(1, len(sent))
        self.assertIn("notify-send", sent[0])


if __name__ == "__main__":
    unittest.main()
