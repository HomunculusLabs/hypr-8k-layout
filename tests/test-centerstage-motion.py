#!/usr/bin/env python3
"""Evaluate the personal Lua overrides without starting or reloading Hyprland."""
import os
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
# looknfeel.lua delegates border/decoration settings to the active Omarchy theme;
# the blur-cost guard must verify the effective config, not only the local file.
THEME_LUA = Path.home() / ".config/omarchy/themes/destroyer-gray/hyprland.lua"


class MotionTest(unittest.TestCase):
    def test_consistent_short_transitions_and_bounded_blur_cost(self):
        script = r'''
local animations, curves, configs = {}, {}, {}
hl = {
    config = function(c) table.insert(configs, c) end,
    curve = function(name, c) curves[name] = c end,
    animation = function(a) animations[a.leaf] = a end,
    env = function() end,
}
o = {window = function() end}
dofile(os.getenv("CENTERSTAGE_TEST_ROOT") .. "/looknfeel.lua")
local theme = os.getenv("CENTERSTAGE_THEME_LUA")
if theme then dofile(theme) end
-- Later files (the theme) win per top-level key, mirroring config layering.
local config = {}
for _, c in ipairs(configs) do for k, v in pairs(c) do config[k] = v end end
assert(animations.windowsIn, "opening animation must not inherit slower package defaults")
assert(animations.windowsIn.speed <= 3, "opening should finish within 300ms")
assert(animations.windowsOut.speed <= 2, "closing should not linger")
assert(animations.windowsMove.speed <= 3, "movement should remain responsive")
assert(animations.windowsIn.bezier == animations.windowsMove.bezier, "consistent easing")
assert(curves[animations.windowsMove.bezier], "motion curve must be defined locally")
assert(animations.workspaces.speed <= 3, "workspace change should not linger")
assert(animations.workspaces.style == "slidefade 8%", "avoid sliding the entire 8K desktop")
assert(animations.borderangle.enabled == false, "no decorative continuous redraw")
assert(config.decoration and config.decoration.blur,
       "decoration must be defined locally or delegated to the Omarchy theme")
assert(config.decoration.blur.passes <= 2, "bound blur cost on the 8K output")
assert(config.decoration.blur.enabled == true, "retain the translucent appearance")
'''
        result = subprocess.run(["lua", "-"], input=script, text=True, capture_output=True,
                                env=dict(os.environ, CENTERSTAGE_TEST_ROOT=str(ROOT),
                                         **({"CENTERSTAGE_THEME_LUA": str(THEME_LUA)}
                                            if THEME_LUA.is_file() else {})))
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
