#!/usr/bin/env python3
"""Presentation contract; runtime rendering is verified separately with Quickshell."""
from pathlib import Path
import json
import re
import tomllib
import unittest

HOME = Path.home()
OMARCHY = HOME / '.config/omarchy'

class DesktopRefreshTest(unittest.TestCase):
    def test_readable_shell_and_uncluttered_bar(self):
        theme_path = OMARCHY / 'themes/everforest/shell.toml'
        self.assertTrue(theme_path.exists(), 'persist readable shell typography in the user theme overlay')
        theme = tomllib.loads(theme_path.read_text())
        self.assertEqual(theme['font']['base-size'], 16)
        self.assertEqual(theme['bar']['size-horizontal'], 33)  # 44px at 16px base font
        config = json.loads((OMARCHY / 'shell.json').read_text())
        self.assertEqual(config['bar']['position'], 'bottom')
        self.assertEqual([x['id'] for x in config['bar']['layout']['center']], ['omarchy.clock'])
        self.assertLessEqual(config['bar']['maxWidth'], 1900)
        bar = (OMARCHY / 'plugins/t3rpz.bar/Bar.qml').read_text()
        self.assertIn('floatingGap: vertical ? 0 : Style.space(9)', bar)

    def test_notifications_wrap_and_do_not_capture_keyboard_or_screen_input(self):
        card = (OMARCHY / 'plugins/t3rpz.notifications/components/NotificationCard.qml').read_text()
        self.assertIn('implicitWidth: Style.space(330)', card)
        self.assertIn('wrapMode: Text.Wrap', card)
        self.assertIn('maximumLineCount: 3', card)
        service = (OMARCHY / 'plugins/t3rpz.notifications/Service.qml').read_text()
        self.assertIn('WlrLayershell.keyboardFocus: WlrKeyboardFocus.None', service)
        self.assertIn('mask: Region { item: popupColumn }', service)
        self.assertIn('anchors { top: true; bottom: true; left: true; right: true }', service)

if __name__ == '__main__':
    unittest.main()
