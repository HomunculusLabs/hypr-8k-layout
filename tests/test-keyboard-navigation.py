#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/keyboard-navigation.py'

class NavigationTests(unittest.TestCase):
    def test_movement_routing(self):
        self.assertTrue(SCRIPT.exists(), 'keyboard navigation helper is not implemented')
        spec = importlib.util.spec_from_file_location('navigation', SCRIPT)
        assert spec and spec.loader
        nav = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(nav)
        for direction in ('left', 'down', 'up', 'right'):
            window = {'workspace': {'id': 1}, 'tags': ['centerstage-left-secondary']}
            self.assertEqual(nav.move_command(window, direction)[0], str(SCRIPT.parent / 'centerstage-swap.sh'))
            for workspace in (4, -1):
                window['workspace']['id'] = workspace
                self.assertEqual(nav.move_command(window, direction)[0:2], ['hyprctl', 'eval'])
        self.assertEqual(nav.move_command({}, 'left'), None)
        self.assertEqual(nav.move_command({'workspace': {'id': 1}, 'tags': []}, 'left')[0:2], ['hyprctl', 'eval'])
        with self.assertRaises(ValueError):
            nav.move_command({}, 'invalid')

    def test_window_picker_and_previous(self):
        spec = importlib.util.spec_from_file_location('navigation', SCRIPT)
        assert spec and spec.loader
        nav = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(nav)
        self.assertTrue(hasattr(nav, 'window_choices'), 'window picker is not implemented')
        windows = [
            {'address': '0x1', 'mapped': True, 'hidden': False, 'focusHistoryID': 0, 'class': 'foot', 'title': 'a\nb\x00c', 'workspace': {'id': 1}},
            {'address': '0x2', 'mapped': True, 'hidden': False, 'focusHistoryID': 1, 'class': 'browser', 'workspace': {'id': 2}},
            {'address': '0x3', 'mapped': True, 'hidden': True, 'focusHistoryID': 2},
        ]
        choices = nav.window_choices(windows)
        self.assertEqual([w['address'] for w in choices], ['0x1', '0x2'])
        self.assertNotIn('\n', nav.window_label(choices[0]))
        self.assertNotIn('\x00', nav.window_label(choices[0]))
        self.assertEqual(nav.previous_window(windows, '0x1')['address'], '0x2')
        self.assertIsNone(nav.previous_window(windows[:1], '0x1'))
        self.assertIn('address:0x2', nav.focus_command('0x2')[2])
        with self.assertRaises(ValueError):
            nav.focus_command('not-an-address')

if __name__ == '__main__':
    unittest.main()
