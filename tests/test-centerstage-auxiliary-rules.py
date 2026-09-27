#!/usr/bin/env python3
"""Evaluate auxiliary window rules without contacting the compositor."""
import json
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AuxiliaryRulesTest(unittest.TestCase):
    def rules(self):
        # Capture the real module's o.window calls, then use full-match semantics.
        source = ROOT / "centerstage-windows.lua"
        self.assertTrue(source.exists(), "auxiliary map-time window rules are missing")
        script = '''
o = {window = function(match, rules)
  local key, value = next(match)
  print(key .. "\\t" .. tostring(value) .. "\\t" .. tostring(rules.float) .. "\\t" .. tostring(rules.center) .. "\\t" .. tostring(rules.tag))
end}
dofile(%s)
''' % json.dumps(str(source))
        result = subprocess.run(["lua", "-"], input=script, text=True, capture_output=True, check=True)
        return [line.split("\t") for line in result.stdout.splitlines()]

    def test_modal_and_portal_windows_get_auxiliary_rules(self):
        rules = self.rules()
        self.assertIn(["modal", "true", "true", "true", "+centerstage-auxiliary"], rules)
        for window_class in ("xdg-desktop-portal-gtk", "xdg-desktop-portal-kde", "xdg-desktop-portal-gnome"):
            matches = [r for r in rules if r[0] == "initial_class" and re.fullmatch(r[1], window_class)]
            self.assertTrue(matches, window_class)
            self.assertEqual(matches[-1][2:], ["true", "true", "+centerstage-auxiliary"])

    def test_rabby_identity_not_title_gets_floating_auxiliary_rules(self):
        rules = self.rules()
        for profile in ("Default", "Profile_2"):
            window_class = "brave-acmacodkjbdgmoleebolmdjonilkdbch-" + profile
            matches = [r for r in rules if r[0] == "initial_class" and re.fullmatch(r[1], window_class)]
            self.assertTrue(matches, window_class)
            self.assertEqual(matches[-1][2:], ["true", "true", "+centerstage-auxiliary"])
        self.assertFalse(any(r[0] in ("class", "initial_class") and re.fullmatch(r[1], "brave-browser") for r in rules))
        self.assertIn('require("hypr.centerstage-windows")', (ROOT / "hyprland.lua").read_text())


if __name__ == "__main__":
    unittest.main()
