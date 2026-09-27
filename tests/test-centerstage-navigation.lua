package.path = './?.lua;' .. package.path
local ok, nav = pcall(require, 'centerstage-navigation')
assert(ok, 'Centerstage navigation module is not implemented: ' .. tostring(nav))
local count = 0
local function test(name, fn)
  fn(); count = count + 1; print('PASS: ' .. name)
end
local function window(id, tags, x, y, history)
  return {id=id, workspace=1, monitor='DP-5', tags=tags, x=x, y=y,
    width=100, height=100, mapped=true, hidden=false, accepts_input=true,
    pinned=false, fullscreen=false, focus_history_id=history, class='foot'}
end
local function fixture()
  return {
    window('notes', {'centerstage-left-primary'}, 80, 100, 3),
    window('browser', {'centerstage-left-secondary'}, 1320, 100, 1),
    window('center-a', {'centerstage-center'}, 2560, 100, 0),
    window('center-b', {'centerstage-center'}, 3890, 100, 2),
    window('right-a', {'centerstage-right','centerstage-right-1'}, 5696, 100, 4),
  }
end
test('horizontal panels remember focus and group left subcolumns', function()
  local ws = fixture()
  assert(nav.select(ws, 'center-a', 'left') == 'browser')
  assert(nav.select(ws, 'browser', 'right') == 'center-a')
  assert(nav.select(ws, 'center-b', 'right') == 'right-a')
  assert(nav.select(ws, 'notes', 'left') == nil)
  assert(nav.select(ws, 'right-a', 'right') == nil)
end)
test('vertical navigation wraps stable panel order, including multiple centers', function()
  local ws = fixture()
  assert(nav.select(ws, 'notes', 'down') == 'browser')
  assert(nav.select(ws, 'browser', 'down') == 'notes')
  assert(nav.select(ws, 'notes', 'up') == 'browser')
  assert(nav.select(ws, 'center-a', 'down') == 'center-b')
  assert(nav.select(ws, 'center-b', 'up') == 'center-a')
  assert(nav.select(ws, 'right-a', 'down') == nil)
  ws[1].focus_history_id, ws[2].focus_history_id = 0, 9
  assert(nav.select(ws, 'notes', 'down') == 'browser')
end)
test('right slot order wins over geometry and permits gaps', function()
  local ws = fixture()
  ws[#ws+1] = window('right-b', {'centerstage-right','centerstage-right-3'}, 0, 0, 1)
  ws[#ws+1] = window('right-c', {'centerstage-right','centerstage-right-7'}, 2, 0, 2)
  assert(nav.select(ws, 'right-a', 'down') == 'right-b')
  assert(nav.select(ws, 'right-c', 'down') == 'right-a')
  assert(nav.select(ws, 'right-a', 'up') == 'right-c')
end)
test('empty panels are skipped; missing history falls back to visual order', function()
  local ws = fixture()
  ws[3].hidden, ws[4].hidden = true, true
  assert(nav.select(ws, 'notes', 'right') == 'right-a')
  ws = fixture(); ws[1].focus_history_id, ws[2].focus_history_id = nil, -1
  assert(nav.select(ws, 'center-a', 'left') == 'notes')
end)
test('ineligible targets and sources are excluded', function()
  for _, field in ipairs({'hidden','pinned','fullscreen'}) do
    local ws = fixture(); ws[2][field] = true
    assert(nav.select(ws, 'center-a', 'left') == 'notes')
    assert(nav.select(ws, 'browser', 'right') == nil)
  end
  for _, field in ipairs({'mapped','accepts_input'}) do
    local ws = fixture(); ws[2][field] = false
    assert(nav.select(ws, 'center-a', 'left') == 'notes')
  end
  for _, patch in ipairs({{workspace=2},{workspace=-1},{monitor='other'},
      {tags={}},{tags={'centerstage-left','centerstage-right'}},
      {content_type='game'},{class='steam_app_42'}}) do
    local ws = fixture()
    for key, value in pairs(patch) do ws[2][key] = value end
    assert(nav.select(ws, 'center-a', 'left') == 'notes')
  end
  local ws = fixture(); ws[3].workspace = 4
  assert(nav.select(ws, 'center-a', 'left') == nil)
  assert(nav.select(ws, 'missing', 'down') == nil)
  assert(nav.select(fixture(), 'center-a', 'invalid') == nil)
end)
test('previous window remains on workspace and toggles the recent pair', function()
  local ws=fixture()
  assert(nav.select(ws, 'center-a', 'previous') == 'browser')
  ws[2].focus_history_id, ws[3].focus_history_id = 0, 1
  assert(nav.select(ws, 'browser', 'previous') == 'center-a')
  ws[3].workspace = 2
  assert(nav.select(ws, 'browser', 'previous') == 'center-b')
  for _, w in ipairs(ws) do w.focus_history_id=-1 end
  assert(nav.select(ws, 'browser', 'previous') == nil)
end)
print(string.format('PASS: %d navigation tests', count))
