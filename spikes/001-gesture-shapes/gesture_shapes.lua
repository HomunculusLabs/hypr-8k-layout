-- Namespaced singleton entry point. Loading NEVER enables or binds anything.
local name='gesture_shapes'
if package.loaded[name] then return package.loaded[name] end
assert(type(hl)=='table','gesture_shapes requires native hl (CLI: use demo.lua/tests.lua)')
local dir=debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './'
local api=assert(loadfile(dir..'adapter.lua'))().new(hl)
package.loaded[name]=api
return api
