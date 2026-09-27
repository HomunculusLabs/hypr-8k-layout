package.path = './?.lua;' .. package.path
local ok, State = pcall(require, 'centerstage-gesture-state')
assert(ok, 'Gesture state machine not implemented: ' .. tostring(State))
local count = 0
local function test(name, fn) fn(); count=count+1; print('PASS: '..name) end
local function event(x, y, fingers)
  return {type='swipe', fingers=fingers or 3, delta={x=x,y=y}, time_ms=100}
end
test('swipe commits once on release and ignores duplicate start delta', function()
  local s=State.new({fingers=3, threshold=35, lock_distance=12, axis_ratio=1.3})
  s:start(event(-20,0)); s:update(event(-20,0))
  assert(s:finish({type='swipe',cancelled=false}) == nil, 'first delta was counted twice')
  s:start(event(-20,0)); s:update(event(-20,0)); s:update(event(-20,0))
  assert(s:finish({type='swipe',cancelled=false}) == 'left')
  assert(s:finish({type='swipe',cancelled=false}) == nil)
end)
test('all directions, cancellation, changed fingers and reset', function()
  local s=State.new({fingers=3, threshold=35, lock_distance=12, axis_ratio=1.3})
  for _, c in ipairs({{50,2,'right'},{-50,2,'left'},{2,50,'down'},{2,-50,'up'}}) do
    s:start(event(0,0)); s:update(event(c[1],c[2]))
    assert(s:finish({type='swipe',cancelled=false}) == c[3])
  end
  s:start(event(0,0)); s:update(event(60,0))
  assert(s:finish({type='swipe',cancelled=true}) == nil)
  s:start(event(0,0)); s:update(event(60,0,4)); s:update(event(60,0))
  assert(s:finish({type='swipe',cancelled=false}) == nil)
  s:start(event(0,0)); s:update(event(60,0)); s:reset()
  assert(s:finish({type='swipe',cancelled=false}) == nil)
end)
test('diagonal paths and returned strokes do not accidentally focus', function()
  local s=State.new({fingers=3, threshold=35, lock_distance=12, axis_ratio=1.3})
  s:start(event(0,0)); s:update(event(60,60))
  assert(s:finish({type='swipe',cancelled=false}) == nil)
  s:start(event(0,0)); s:update(event(20,0)); s:update(event(20,60))
  assert(s:finish({type='swipe',cancelled=false}) == nil, 'late diagonal must not commit old axis')
  s:start(event(0,0)); s:update(event(60,0)); s:update(event(-55,0))
  assert(s:finish({type='swipe',cancelled=false}) == nil)
end)
print(string.format('PASS: %d gesture state tests', count))
