-- Opt-in native adapter factory. No compositor access until new(hl)/enable().
local dir=debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './'
local C=assert(loadfile(dir..'collector.lua'))()
local R=assert(loadfile(dir..'recognizer.lua'))()
local M={}
function M.new(hl)
  local enabled=false; local subscriptions={}; local c=C.new(); local initial; local last
  local api={}
  local function snapshot()
    -- Verified XKB keysym strings, not guessed modifier masks or keycode offsets.
    if not (hl.is_key_down('Super_L') or hl.is_key_down('Super_R')) or not (hl.is_key_down('Alt_L') or hl.is_key_down('Alt_R')) then return nil,'required modifier not held' end
    if hl.is_key_down('Control_L') or hl.is_key_down('Control_R') or hl.is_key_down('Shift_L') or hl.is_key_down('Shift_R') then return nil,'extra modifier held' end
    -- Do not run when global config explicitly bypasses native inhibition.
    local bypass=hl.get_config('binds.disable_keybind_grabbing')
    if bypass~=false and bypass~=0 then return nil,'inhibition override/unknown' end
    local w,ws,mon=hl.get_active_window(),hl.get_active_workspace(),hl.get_active_monitor()
    if not w or not ws or not mon or w.stable_id==nil then return nil,'no normal focused context' end
    if w.fullscreen~=0 or ws.has_fullscreen~=false then return nil,'fullscreen/unknown' end
    if hl.get_active_special_workspace() or ws.special==true then return nil,'special workspace' end
    if hl.get_current_submap()~='' then return nil,'nondefault submap' end
    for _,layer in ipairs(hl.get_layers()) do
      if layer.mapped and (layer.interactivity==nil or layer.interactivity~=0) then return nil,'interactive layer' end
    end
    if not w.workspace or w.workspace.id~=ws.id or not w.monitor or w.monitor.name~=mon.name then return nil,'inconsistent focused context' end
    return {id=tostring(w.stable_id),workspace=ws.id,monitor=mon.name}
  end
  local function guarded()
    local ok,s,reason=pcall(snapshot)
    if not ok then return nil,'guard API failed' end
    return s,reason
  end
  local function check()
    if not enabled then c:cancel('disabled'); return end
    local now,reason=guarded()
    if not now then c:cancel(reason); return end
    if not initial or now.id~=initial.id or now.workspace~=initial.workspace or now.monitor~=initial.monitor then c:cancel('focus/workspace/monitor changed') end
  end
  local action={
    start=function(e)
      if not enabled then return end
      c:start(e); local reason; initial,reason=guarded()
      if not initial then c:cancel(reason) end
    end,
    update=function(e) if c.active then check(); c:update(e) end end,
    finish=function(e)
      if not c.active then return end
      check(); last=c:finish(e); initial=nil
      if last and enabled then
        -- Only side effect: one concise release-time notification. Never dispatch/exec.
        pcall(hl.notification.create,{text='Gesture shapes: '..(last.shape or ('rejected: '..last.reason)),timeout=1800,icon='info'})
      end
    end,
  }
  local function spec(value)
    return {mods='SUPER ALT',fingers=3,direction='swipe',scale=1,disable_inhibit=false,action=value}
  end
  local function remove_subscriptions()
    for _,s in ipairs(subscriptions) do s:remove() end
    subscriptions={}
  end
  function api.enable()
    if enabled then return api.status() end
    -- Register cancellers first; if any step throws, remove only our subscriptions.
    local ok,err=pcall(function()
      for _,event in ipairs({'window.active','workspace.active','workspace.special_active','keybinds.submap','monitor.focused','layer.opened','window.fullscreen'}) do
        subscriptions[#subscriptions+1]=hl.on(event,function() c:cancel('context event: '..event) end)
      end
      -- Event precedes keybind pressed-state update. Cancel on ANY keyboard event,
      -- including release/repress between swipe callbacks; never inspect/store keys.
      subscriptions[#subscriptions+1]=hl.on('input.keyboard.key',function() c:cancel('keyboard state changed') end)
      hl.gesture(spec(action))
    end)
    if not ok then remove_subscriptions(); error(err) end
    enabled=true
    return api.status()
  end
  function api.disable()
    if not enabled then return api.status() end
    -- Exact tuple, including scale and inhibition flag. Never unset other gestures.
    hl.gesture(spec('unset'))
    enabled=false; c:reset(); initial=nil; remove_subscriptions()
    return api.status()
  end
  -- Use ONLY after native eval reports registration failed (e.g. tuple collision).
  -- hl.gesture returns nil even on native errors, so pcall cannot verify ownership.
  function api.abandon_failed_enable()
    enabled=false; c:reset(); initial=nil; remove_subscriptions()
    return api.status()
  end
  function api.last()
    -- Defensive copy; only result/metrics retained, never coordinates or context.
    if not last then return nil end
    local copy={shape=last.shape,reason=last.reason,score=last.score,metrics={}}
    for k,v in pairs(last.metrics) do copy.metrics[k]=v end
    return copy
  end
  function api.status() return (enabled and 'enabled' or 'disabled')..'; '..R.describe(last) end
  return api
end
return M
