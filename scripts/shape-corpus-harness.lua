-- Replay one recorded capture file through the spike shape recognizer.
-- usage: lua shape-corpus-harness.lua CAPTURE_FILE
-- Prints strict key=value lines: shape=, score=, m.<metric>=..., reason= (last).
-- Standard library only; no compositor access.
local here = debug.getinfo(1, 'S').source:sub(2):match('^(.*[/])') or './'
local R = assert(loadfile(here .. '../spikes/001-gesture-shapes/recognizer.lua'))()
local file = assert(arg[1], 'provide a capture file path')
local handle = assert(io.open(file, 'r'))
local text = handle:read(65537) or ''
handle:close()
assert(#text <= 65536, 'capture exceeds 64 KiB')
local points = {}
for line in (text .. '\n'):gmatch('(.-)\n') do
  if not line:match('^%s*#') and not line:match('^%s*$') then
    local x, y = line:match('^%s*([^,%s]+)[,%s]+([^,%s]+)%s*$')
    assert(x and tonumber(x) and tonumber(y), 'expected x,y coordinates only')
    points[#points + 1] = { x = tonumber(x), y = tonumber(y) }
    assert(#points <= R.MAX_POINTS, 'point limit')
  end
end
local result = R.recognize(points)
print('shape=' .. (result.shape or 'rejected'))
print('score=' .. string.format('%.6g', result.score or 0))
local keys = {}
for key in pairs(result.metrics) do keys[#keys + 1] = key end
table.sort(keys)
for _, key in ipairs(keys) do
  print('m.' .. key .. '=' .. string.format('%.6g', result.metrics[key]))
end
print('reason=' .. (result.reason or ''))
