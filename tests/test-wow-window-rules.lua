-- Evaluate the actual appearance config without connecting to Hyprland.
local wow, diablo
_G.hl = { config = function() end, curve = function() end, animation = function() end }
_G.o = { window = function(match, effects)
  if type(match) == "table" and match.class == "^steam_app_4036538709$" then
    if match.title == "^World of Warcraft.*$" then wow = effects end
    if match.title == "^Diablo" then diablo = effects end
  end
end }
dofile("looknfeel.lua")
assert(wow, "WoW rule missing")
assert(wow.workspace == "1", "WoW must launch on workspace 1")
assert(wow.float == true and wow.fullscreen ~= true, "WoW must launch resizable, not forced fullscreen")
assert(wow.size[1] == 2560 and wow.size[2] == 1440, "16:9 launch viewport required")
assert(wow.opacity == "1.0 override 1.0 override 1.0 override", "do not composite translucent gameplay")
assert(wow.no_blur and wow.no_shadow, "avoid needless game blur/shadow")
assert(diablo.workspace == "4" and diablo.fullscreen, "unrelated game policy must stay unchanged")
print("WoW native rule contract passed; Diablo policy preserved")
