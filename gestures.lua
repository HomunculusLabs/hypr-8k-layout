-- Centerstage focus gestures. Ordinary scrolling and native workspace swipes are separate.
local nav = require('hypr.centerstage-navigation')
local State = require('hypr.centerstage-gesture-state')
local dir=debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './'
local ShapeMode=assert(loadfile(dir..'centerstage-shape-mode.lua'))()
local viewer=assert(loadfile(dir..'centerstage-gesture-stream.lua'))().new(hl)
local M = {enabled=true, diagnostic=false, last={reason='ready'}}
-- Distances are compositor gesture units, not physical millimeters.
local settings = {threshold=35, lock_distance=12, axis_ratio=1.3}
local cancellers = {}
local shape
local function cancel_navigation()
  for _, cancel in ipairs(cancellers) do cancel() end
end
function M.cancel()
  cancel_navigation()
  if shape then shape:cancel('context changed') end
end
function M.set_diagnostic(enabled)
  M.diagnostic = enabled == true
  M.cancel()
end
function M.viewer_heartbeat()
  viewer:renew()
end
function M.viewer_stop()
  viewer:stop()
end
function M.capture_next_shape()
  return shape:request_capture()
end
function M.shape_capture()
  return shape:capture_text()
end
function M.clear_shape_capture()
  shape:clear_capture()
end
function M.status()
  return string.format('%s%s; threshold=%s; last=%s %s',
    M.enabled and 'enabled' or 'disabled', M.diagnostic and ' diagnostic' or '',
    settings.threshold, M.last.direction or '-', M.last.reason or '')
end
local function normalize(w)
  return {id=tostring(w.stable_id), address=w.address,
    workspace=w.workspace and w.workspace.id, monitor=w.monitor and w.monitor.name,
    tags=w.tags, x=w.at.x, y=w.at.y, width=w.size.x, height=w.size.y,
    mapped=w.mapped, hidden=w.hidden, accepts_input=w.accepts_input,
    pinned=w.pinned, fullscreen=w.fullscreen ~= 0,
    focus_history_id=w.focus_history_id, class=w.class, content_type=w.content_type}
end
local function signature(windows, workspace, monitor)
  local records = {}
  for _, w in ipairs(windows) do
    if nav.eligible(w) and w.workspace == workspace and w.monitor == monitor then
      local tags = {}
      for _, tag in ipairs(w.tags or {}) do
        if tag:match('^centerstage%-') then tags[#tags+1] = tag end
      end
      table.sort(tags)
      records[#records+1] = table.concat({w.id,w.address,w.x,w.y,w.width,w.height,table.concat(tags,',')}, ':')
    end
  end
  table.sort(records)
  return table.concat(records, '|')
end
local function snapshot()
  local active, workspace, monitor = hl.get_active_window(), hl.get_active_workspace(), hl.get_active_monitor()
  if not active or not workspace or not monitor then return nil end
  if workspace.has_fullscreen or hl.get_active_special_workspace() or hl.get_current_submap() ~= '' then return nil end
  for _, layer in ipairs(hl.get_layers({monitor=monitor.name})) do
    if layer.mapped and (layer.interactivity or 0) > 0 then return nil end
  end
  local source = normalize(active)
  if not nav.eligible(source) or source.workspace ~= workspace.id or source.monitor ~= monitor.name then return nil end
  local windows = {}
  for _, w in ipairs(hl.get_windows()) do windows[#windows+1] = normalize(w) end
  return {source=source, windows=windows, workspace=workspace.id, monitor=monitor.name,
    signature=signature(windows, workspace.id, monitor.name)}
end
local function same_context(before,current)
  return before and current and current.source.id == before.source.id
    and current.workspace == before.workspace and current.monitor == before.monitor
    and current.signature == before.signature
end
local function focus(current,direction)
  local target=nav.select(current.windows,current.source.id,direction)
  for _,w in ipairs(current.windows) do
    if w.id == target and nav.eligible(w) and w.workspace == current.workspace
        and w.monitor == current.monitor and type(w.address)=='string' and w.address:match('^0x%x+$') then
      hl.dispatch(hl.dsp.focus({window='address:'..w.address}))
      return true
    end
  end
  return false
end
shape=ShapeMode.new({snapshot=snapshot, same_context=same_context,
  enabled=function() return M.enabled end, timer=function(fn,opts) return hl.timer(fn,opts) end,
  observe=function(phase,points,result,time_ms) viewer:publish(phase,points,result,time_ms) end,
  notify=function(text)
    -- Normal status contains no raw trace; explicit one-shot capture is separate.
    M.last={reason='shape '..text}
    hl.notification.create({text='Centerstage shape '..text,timeout=2000,icon='info'})
  end})
local function handler(fingers)
  local state = State.new({fingers=fingers, threshold=settings.threshold,
    lock_distance=settings.lock_distance, axis_ratio=settings.axis_ratio})
  local initial
  cancellers[#cancellers+1] = function() state:reset(); initial=nil end
  return {
    start=function(e)
      if fingers == 3 and shape:start(e) then state:reset(); initial=nil; return end
      initial = M.enabled and snapshot() or nil
      state:start(e)
    end,
    update=function(e)
      if fingers == 3 and shape:update(e) then return end
      state:update(e)
    end,
    finish=function(e)
      if fingers == 3 and shape:finish(e) then return end
      local dx, dy = state.x, state.y
      local direction = state:finish(e)
      M.last={fingers=fingers, direction=direction, dx=dx, dy=dy,
        cancelled=e.cancelled, reason='ignored'}
      local before = initial; initial=nil
      if not M.enabled or not direction or not before then return end
      local current=snapshot()
      if not same_context(before,current) then
        M.last.reason='context changed'; return
      end
      if M.diagnostic then M.last.reason='diagnostic'; return end
      if fingers == 4 then
        if direction == 'up' then
          local script=(os.getenv('HOME') or '')..'/.config/hypr/scripts/keyboard-navigation.py'
          hl.exec_cmd("python3 '"..script:gsub("'", "'\\''").."' windows")
          M.last.reason='picker'; return
        elseif direction == 'down' then direction='previous'
        else return end
      end
      M.last.reason=focus(current,direction) and 'focus' or 'boundary or no target'
    end,
  }
end
M.three = handler(3)
M.four = handler(4)
hl.gesture({fingers=4, direction='horizontal', action='workspace'})
hl.gesture({fingers=3, direction='swipe', action=M.three})
hl.gesture({fingers=4, direction='vertical', action=M.four})
for _, event in ipairs({'window.active','window.fullscreen','workspace.active','workspace.special_active',
    'keybinds.submap','monitor.focused','layer.opened'}) do
  hl.on(event, M.cancel)
end
-- A single physical Kinesis hotkey emits this chord. Trigger on key-down so
-- firmware modifier-release ordering cannot prevent the shortcut from firing.
hl.bind('CTRL + SHIFT + F11', function()
  cancel_navigation()
  shape:tap()
end, {description='Hotkey1: arm/cancel one notify-only three-finger circle'})
-- Non-consuming observation: Escape still reaches applications and other bindings.
hl.bind('Escape', function() shape:cancel('Escape') end,
  {non_consuming=true, ignore_mods=true, description='Cancel armed Centerstage shape (pass Escape through)'})
-- Keyboard quick-swap: exchange the focused window with the first center cell.
-- The previous managed window remains available via four-finger swipe down
-- and Super+Tab. Trigger on key-down so firmware modifier-release ordering
-- cannot prevent the shortcut from firing.
local swap_cmd=(os.getenv('HOME') or '')..'/.config/hypr/scripts/centerstage-swap-focused-center.sh'
hl.bind('CTRL + SHIFT + F12', function()
  M.cancel()
  hl.exec_cmd("'" .. swap_cmd .. "'")
end, {description='Hotkey2: swap focused window with center'})
hl.bind('SUPER + CTRL + G', function()
  M.enabled = not M.enabled
  M.cancel()
  hl.notification.create({text='Centerstage gestures '..(M.enabled and 'enabled' or 'disabled'),
    timeout=1500, icon='ok'})
end, {description='Toggle Centerstage gestures (workspace swipes stay enabled)'})
return M
