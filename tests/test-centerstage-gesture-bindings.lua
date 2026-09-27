-- Integration uses real modules and native-shaped fake clients; no desktop mutation.
local root=(debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './')..'../'
package.path = root..'?.lua;' .. package.path
package.preload['hypr.centerstage-navigation'] = function() return require('centerstage-navigation') end
package.preload['hypr.centerstage-gesture-state'] = function() return require('centerstage-gesture-state') end
local count=0
local function test(name, fn) fn(); count=count+1; print('PASS: '..name) end
local function client(id, tag, x, history)
  return {stable_id=id, address='0x'..id, workspace={id=1}, monitor={name='DP-5'},
    tags={tag}, at={x=x,y=100}, size={x=100,y=100}, mapped=true,
    accepts_input=true, hidden=false, pinned=false, fullscreen=0,
    content_type='none', class='foot', focus_history_id=history}
end
local function setup()
  local t={windows={client(1,'centerstage-left-primary',0,3),
    client(2,'centerstage-left-secondary',100,1), client(3,'centerstage-center',200,0),
    client(4,'centerstage-center',300,2), client(5,'centerstage-right',400,4)},
    active=3, workspace=1, binds={}, gestures={}, events={}, calls={}, submap='',
    timers={}, notifications={}}
  hl={
    config=function() end,
    get_windows=function() return t.windows end,
    get_active_window=function() for _,w in ipairs(t.windows) do if w.stable_id==t.active then return w end end end,
    get_active_workspace=function() return {id=t.workspace,has_fullscreen=t.fullscreen or false} end,
    get_active_monitor=function() return {name='DP-5'} end,
    get_active_special_workspace=function() return t.special end,
    get_current_submap=function() return t.submap end,
    get_layers=function() return {} end,
    gesture=function(s) t.gestures[#t.gestures+1]=s end,
    bind=function(key,fn,opts) t.binds[key]={fn=fn,opts=opts} end,
    on=function(event,fn) t.events[event]=fn; return {} end,
    dsp={focus=function(spec) return {action='focus',window=spec.window} end,
      event=function(data) return {action='event',data=data} end},
    dispatch=function(d) t.calls[#t.calls+1]=d end,
    exec_cmd=function(cmd) t.calls[#t.calls+1]={action='exec',cmd=cmd} end,
    timer=function(fn,opts)
      -- Deliberately expose only the API present in installed HL.Timer stubs.
      local timer={fn=fn,opts=opts,enabled=true}
      function timer:set_enabled(value) self.enabled=value end
      function timer:set_timeout(value) self.timeout=value end
      t.timers[#t.timers+1]=timer
      return timer
    end,
    notification={create=function(spec) t.notifications[#t.notifications+1]=spec.text end},
  }
  dofile(root..'input.lua') -- Prevent accidental duplicate workspace bindings during config migration.
  local ok, module=pcall(dofile,root..'gestures.lua')
  assert(ok, 'Gesture adapter not implemented or invalid: '..tostring(module))
  t.module=module
  for _,g in ipairs(t.gestures) do
    if g.fingers==3 then t.three=g.action end
    if g.fingers==4 and g.direction=='vertical' then t.four=g.action end
  end
  return t
end
local function update(action,x,y,fingers)
  action.update({type='swipe',fingers=fingers or 3,delta={x=x,y=y},time_ms=100})
end
local function start(action,fingers)
  action.start({type='swipe',fingers=fingers or 3,delta={x=0,y=0},time_ms=100})
end
local function finish(action,cancelled)
  action.finish({type='swipe',cancelled=cancelled or false,time_ms=200})
end
local function swipe(action,x,y,fingers)
  start(action,fingers); update(action,x,y,fingers); finish(action)
end
test('registered gesture runs production focus path on release only', function()
  local t=setup()
  assert(type(t.three)=='table', 'three-finger live gesture absent')
  start(t.three); update(t.three,-60,0)
  assert(#t.calls==0, 'must not focus during gesture')
  finish(t.three)
  assert(#t.calls==1 and t.calls[1].action=='focus')
  assert(t.calls[1].window=='address:0x2', 'left must restore browser slot')
end)
test('cancelled strokes and context changes cannot steal focus', function()
  local t=setup(); start(t.three); update(t.three,-60,0); finish(t.three,true)
  assert(#t.calls==0)
  local mutations={
    function(t) t.active=4 end,
    function(t) t.workspace=2 end,
    function(t) t.windows[2].tags={'centerstage-right'} end,
    function(t) table.remove(t.windows,2) end,
    function(t) t.windows[2].at.x=400 end,
    function(t) t.fullscreen=true end,
    function(t) t.special={id=-99} end,
    function(t) t.submap='centerstage-adjust' end,
  }
  for i, mutate in ipairs(mutations) do
    t=setup(); start(t.three); update(t.three,-60,0); mutate(t); finish(t.three)
    assert(#t.calls==0, 'context mutation '..i..' must cancel')
  end
end)
test('fullscreen, special workspaces, submaps and untagged windows are inert', function()
  for _, mutate in ipairs({function(t) t.fullscreen=true end,
      function(t) t.special={id=-1} end, function(t) t.submap='adjust' end,
      function(t) t.windows[3].tags={} end, function(t) t.workspace=4 end}) do
    local t=setup(); mutate(t); swipe(t.three,-60,0); assert(#t.calls==0)
  end
end)
test('workspace binding preserved; quick return and picker register without two-finger grabs', function()
  local t=setup(); local workspace_count=0
  for _,g in ipairs(t.gestures) do
    assert(g.fingers~=2 and not g.disable_inhibit and not g.mods)
    if g.action=='workspace' then
      assert(g.fingers==4 and g.direction=='horizontal'); workspace_count=workspace_count+1
    end
  end
  assert(workspace_count==1 and #t.gestures==3)
  swipe(t.four,0,60,4)
  assert(#t.calls==1 and t.calls[1].window=='address:0x2')
  t=setup(); swipe(t.four,0,-60,4)
  assert(#t.calls==1 and t.calls[1].action=='exec')
  assert(t.calls[1].cmd:match('keyboard%-navigation%.py.*windows'))
  t=setup(); swipe(t.four,60,0,4); assert(#t.calls==0)
end)
test('toggle and diagnostic mode suppress custom actions without losing workspace binding', function()
  local t=setup()
  local toggle=t.binds['SUPER + CTRL + G']; assert(toggle and toggle.opts.description)
  toggle.fn(); swipe(t.three,-60,0); assert(#t.calls==0)
  toggle.fn(); swipe(t.three,-60,0); assert(#t.calls==1)
  t.module.set_diagnostic(true)
  swipe(t.three,-60,0); assert(#t.calls==1)
  assert(t.module.status():match('diagnostic'))
  assert(t.module.last.direction=='left')
  t.module.set_diagnostic(false)
  swipe(t.three,-60,0); assert(#t.calls==2)
end)
test('transient focus or workspace events cancel even if the original context returns', function()
  for _,event in ipairs({'window.active','workspace.active','workspace.special_active','keybinds.submap','monitor.focused','layer.opened'}) do
    local t=setup(); assert(t.events[event], 'missing cancellation hook '..event)
    start(t.three); update(t.three,-60,0); t.events[event](); finish(t.three)
    assert(#t.calls==0, event..' did not cancel')
  end
end)
test('mapped interactive overlays block navigation but passive bar does not', function()
  local t=setup()
  hl.get_layers=function() return {{mapped=true,interactivity=1,namespace='rofi'}} end
  swipe(t.three,-60,0); assert(#t.calls==0)
  hl.get_layers=function() return {{mapped=true,interactivity=0,namespace='bar'}} end
  swipe(t.three,-60,0); assert(#t.calls==1)
end)
test('native vertical callbacks cycle each panel without geometry actions', function()
  for _,case in ipairs({{1,60,'address:0x2'},{2,60,'address:0x1'},
      {3,60,'address:0x4'},{4,-60,'address:0x3'}}) do
    local t=setup(); t.active=case[1]; swipe(t.three,0,case[2])
    assert(#t.calls==1 and t.calls[1].action=='focus' and t.calls[1].window==case[3])
  end
  local t=setup(); t.windows[3].fullscreen=1
  swipe(t.three,-60,0); assert(#t.calls==0, 'client fullscreen must independently block')
end)
local function tap(t,key)
  local binding=t.binds[key]; assert(binding, key..' binding missing')
  binding.fn()
end
local function circle_updates(action,sign)
  local x,y=60,0
  for i=1,64 do
    local a=sign*2*math.pi*i/64
    local nx,ny=60*math.cos(a),60*math.sin(a)
    action.update({type='swipe',fingers=3,delta={x=nx-x,y=ny-y},time_ms=100+i*10})
    x,y=nx,ny
  end
end
local function circle(action,sign)
  start(action); circle_updates(action,sign); finish(action)
end
local function notified(t,text)
  for _,message in ipairs(t.notifications) do if message:find(text,1,true) then return true end end
  return false
end
local function no_shape(t)
  assert(not notified(t,'circle_cw') and not notified(t,'circle_ccw'))
end
test('Hotkey1 press arms exactly one notify-only circle in either direction', function()
  for _,sign in ipairs({1,-1}) do
    local t=setup(); tap(t,'CTRL + SHIFT + F11')
    local binding=t.binds['CTRL + SHIFT + F11']
    assert(not binding.opts.release and not binding.opts.repeating)
    assert(#t.notifications==1 and notified(t,'armed'))
    assert(#t.timers==1 and t.timers[1].opts.type=='oneshot' and t.timers[1].opts.timeout==8000)
    start(t.three); circle_updates(t.three,sign)
    assert(#t.calls==0 and #t.notifications==1, 'updates must be silent and action-free')
    finish(t.three)
    assert(#t.calls==0 and #t.notifications==2)
    assert(notified(t,sign==1 and 'circle_cw' or 'circle_ccw'))
    assert(t.timers[1].enabled==false)
    finish(t.three); assert(#t.notifications==2 and #t.calls==0)
    swipe(t.three,-60,0)
    assert(#t.calls==1 and t.calls[1].window=='address:0x2')
  end
end)
test('armed ordinary direction is consumed once, never a focus action', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); swipe(t.three,-60,0)
  assert(#t.calls==0 and #t.notifications==2); no_shape(t)
  swipe(t.three,-60,0); assert(#t.calls==1)
end)
test('second Hotkey1 tap cancels without rearming', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); tap(t,'CTRL + SHIFT + F11')
  assert(#t.timers==1 and t.timers[1].enabled==false)
  assert(#t.notifications==2 and notified(t,'cancelled'))
  swipe(t.three,-60,0); assert(#t.calls==1)
end)
test('native timeout clears an unused arm and stale callbacks cannot clear later arms', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); local old=t.timers[1]
  old.fn(); assert(notified(t,'timeout') and old.enabled==false)
  swipe(t.three,-60,0); assert(#t.calls==1)
  t.calls={}; tap(t,'CTRL + SHIFT + F11'); old.fn(); circle(t.three,1)
  assert(#t.calls==0 and notified(t,'circle_cw'))
  local completed=t.timers[2]; tap(t,'CTRL + SHIFT + F11'); completed.fn(); circle(t.three,-1)
  assert(#t.calls==0 and notified(t,'circle_ccw'))
end)
local cancel_events={'window.active','workspace.active','workspace.special_active',
  'window.fullscreen','keybinds.submap','monitor.focused','layer.opened'}
test('every context event clears idle arm even on focus-away-and-back', function()
  for _,event in ipairs(cancel_events) do
    local t=setup(); tap(t,'CTRL + SHIFT + F11'); assert(t.events[event],event)
    t.active=4; t.events[event](); t.active=3; t.events[event]()
    assert(t.timers[1].enabled==false and #t.notifications==2)
    swipe(t.three,-60,0); assert(#t.calls==1,event)
  end
end)
test('all mid-stroke cancellations drain remainder without falling through to navigation', function()
  local cancel={
    function(t) t.timers[1].fn() end,
    function(t) tap(t,'CTRL + SHIFT + F11') end,
    function(t) tap(t,'Escape') end,
    function(t) tap(t,'SUPER + CTRL + G'); tap(t,'SUPER + CTRL + G') end,
    function(t) t.module.set_diagnostic(true); t.module.set_diagnostic(false) end,
  }
  for _,event in ipairs(cancel_events) do
    local name=event; cancel[#cancel+1]=function(t) t.events[name]() end
  end
  for i,cancel_one in ipairs(cancel) do
    local t=setup(); tap(t,'CTRL + SHIFT + F11'); start(t.three); update(t.three,-20,0)
    cancel_one(t); update(t.three,-100,0); finish(t.three)
    assert(#t.calls==0,'cancellation '..i); no_shape(t)
    swipe(t.three,-60,0); assert(#t.calls==1,'navigation after cancellation '..i)
  end
end)
test('Escape is non-consuming and does nothing when shape layer is idle', function()
  local t=setup(); assert(t.binds.Escape and t.binds.Escape.opts.non_consuming==true)
  tap(t,'Escape'); assert(#t.calls==0 and #t.notifications==0)
  tap(t,'CTRL + SHIFT + F11'); tap(t,'Escape'); assert(t.timers[1].enabled==false)
  swipe(t.three,-60,0); assert(#t.calls==1)
end)
local guards={
  function(t) t.fullscreen=true end,
  function(t) t.windows[3].fullscreen=1 end,
  function(t) t.special={id=-1} end,
  function(t) t.submap='adjust' end,
  function(t) t.windows[3].tags={} end,
  function(t) t.windows[3].content_type='game' end,
  function(t) t.windows[3].class='steam_app_123' end,
  function(t) t.windows[3].mapped=false end,
  function(t) t.windows[3].hidden=true end,
  function(t) t.windows[3].pinned=true end,
  function(t) t.windows[3].accepts_input=false end,
  function(t) t.workspace=4 end,
  function(t) t.windows[3].monitor.name='other' end,
  function(t) t.active=nil end,
  function() hl.get_layers=function() return {{mapped=true,interactivity=1}} end end,
}
test('Hotkey1 retains snapshot eligibility guards; Hotkey2 delegates to guarded script', function()
  for i,mutate in ipairs(guards) do
    local t=setup(); mutate(t); tap(t,'CTRL + SHIFT + F11')
    assert(#t.timers==0 and #t.calls==0,'guard '..i)
    circle(t.three,1); no_shape(t)
  end
  -- The swap script re-validates context under the layout lock itself; the
  -- binding only cancels in-flight gestures and dispatches one exec.
  local t=setup(); tap(t,'CTRL + SHIFT + F12')
  assert(#t.calls==1 and t.calls[1].action=='exec')
  assert(t.calls[1].cmd:match('centerstage%-swap%-focused%-center%.sh'))
end)
test('disabled mode cannot arm; Hotkey2 remains independent of gesture toggle', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); tap(t,'SUPER + CTRL + G')
  assert(t.timers[1].enabled==false)
  tap(t,'CTRL + SHIFT + F11'); assert(#t.timers==1)
  swipe(t.three,-60,0); assert(#t.calls==0); no_shape(t)
  tap(t,'CTRL + SHIFT + F12'); assert(#t.calls==1 and t.calls[1].action=='exec')
  tap(t,'SUPER + CTRL + G'); tap(t,'CTRL + SHIFT + F11'); circle(t.three,1)
  assert(#t.calls==1 and notified(t,'circle_cw'))
end)
test('Hotkey2 dispatches the swap script exactly once and never moves focus', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F12')
  assert(#t.calls==1 and t.calls[1].action=='exec')
  assert(t.calls[1].cmd:match('centerstage%-swap%-focused%-center%.sh'))
  for _,address in ipairs({'0x2;exec evil','0xZZ',''}) do
    t=setup(); t.windows[2].address=address; tap(t,'CTRL + SHIFT + F12')
    assert(#t.calls==1 and t.calls[1].action=='exec','binding must not interpret window addresses')
  end
  t=setup(); t.windows={t.windows[3]}; tap(t,'CTRL + SHIFT + F12')
  assert(#t.calls==1 and t.calls[1].action=='exec','empty workspaces are the script\'s concern')
end)
test('Hotkey2 explicitly cancels armed/consumed shapes before the swap', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); start(t.three); tap(t,'CTRL + SHIFT + F12')
  assert(#t.calls==1 and t.calls[1].action=='exec')
  circle_updates(t.three,1); finish(t.three); assert(#t.calls==1); no_shape(t)
end)
test('armed context is checked at start and finish, not just at arm', function()
  local mutations={}
  for _,mutate in ipairs(guards) do mutations[#mutations+1]=mutate end
  mutations[#mutations+1]=function(t) t.windows[2].at.x=400 end
  mutations[#mutations+1]=function(t) t.windows[2].tags={'centerstage-right'} end
  mutations[#mutations+1]=function(t) table.remove(t.windows,2) end
  mutations[#mutations+1]=function(t) t.active=4 end
  for i,mutate in ipairs(mutations) do
    for _,when in ipairs({'start','finish'}) do
      local t=setup(); tap(t,'CTRL + SHIFT + F11')
      if when=='start' then mutate(t) end
      start(t.three); circle_updates(t.three,1)
      if when=='finish' then mutate(t) end
      finish(t.three); no_shape(t); assert(#t.calls==0,when..' guard '..i)
      assert(t.timers[1].enabled==false)
    end
  end
end)
test('invalid, finger-changed, cancelled and bounded strokes are consumed safely', function()
  local cases={
    function(a) update(a,-60,0,4) end,
    function(a) a.update({type='pinch',fingers=3}) end,
    function(a) a.update({type='swipe',fingers=3,delta={x=0/0,y=0}}) end,
    function(a) a.update({type='swipe',fingers=3}) end,
    function(a) a.update({type='swipe',fingers=3,delta={x=1000001,y=0}}) end,
    function(a) for _=1,512 do update(a,1,0) end end,
    function(a) a.update({type='swipe',fingers=3,delta={x=1,y=0},time_ms=5101}) end,
    function(a) start(a) end,
    function(a) finish(a,true) end,
  }
  for i,invalid in ipairs(cases) do
    local t=setup(); tap(t,'CTRL + SHIFT + F11'); start(t.three); invalid(t.three)
    update(t.three,-100,0); finish(t.three)
    assert(#t.calls==0,'invalid '..i); no_shape(t)
    swipe(t.three,-60,0); assert(#t.calls==1)
  end
  for _,e in ipairs({{type='pinch',fingers=3},{type='swipe',fingers=4}}) do
    local t=setup(); tap(t,'CTRL + SHIFT + F11'); t.three.start(e); update(t.three,-100,0); finish(t.three)
    assert(#t.calls==0); no_shape(t)
  end
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); start(t.three); circle_updates(t.three,1)
  t.three.finish({type='swipe',cancelled=false,fingers=4}); no_shape(t); assert(#t.calls==0)
end)
test('cannot rearm inside a cancelled consumed stroke', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); start(t.three); tap(t,'Escape'); tap(t,'CTRL + SHIFT + F11')
  update(t.three,-100,0); finish(t.three); assert(#t.calls==0 and #t.timers==1)
  swipe(t.three,-60,0); assert(#t.calls==1)
end)
test('native registration tuples are exactly preserved while arming and toggling', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); tap(t,'CTRL + SHIFT + F11'); tap(t,'SUPER + CTRL + G')
  assert(#t.gestures==3)
  local expected={{4,'horizontal','workspace'},{3,'swipe',t.three},{4,'vertical',t.four}}
  for i,g in ipairs(t.gestures) do
    local keys=0; for _ in pairs(g) do keys=keys+1 end
    assert(keys==3 and g.fingers==expected[i][1] and g.direction==expected[i][2] and g.action==expected[i][3])
  end
  for key in pairs(t.binds) do
    assert(key=='CTRL + SHIFT + F11' or key=='CTRL + SHIFT + F12' or key=='Escape' or key=='SUPER + CTRL + G',key)
  end
end)
test('four-finger previous and picker still work while an unused shape arm exists', function()
  for _,case in ipairs({{60,'focus'},{-60,'exec'}}) do
    local t=setup(); tap(t,'CTRL + SHIFT + F11'); swipe(t.four,0,case[1],4)
    assert(#t.calls==1 and t.calls[1].action==case[2])
    no_shape(t)
  end
end)
test('arming during navigation suppresses that pending action and waits for next stroke', function()
  local t=setup(); start(t.three); update(t.three,-60,0); tap(t,'CTRL + SHIFT + F11'); finish(t.three)
  assert(#t.calls==0)
  circle(t.three,1); assert(#t.calls==0 and notified(t,'circle_cw'))
end)
test('cancelled timer cannot affect a new arm, including during its stroke', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11'); local old=t.timers[1]; tap(t,'Escape')
  tap(t,'CTRL + SHIFT + F11'); start(t.three); old.fn(); circle_updates(t.three,1); finish(t.three)
  assert(#t.calls==0 and notified(t,'circle_cw'))
end)
test('shape collection ignores start delta and exports no coordinates or metrics', function()
  local t=setup()
  hl.get_layers=function() return {{mapped=true,interactivity=0}} end
  tap(t,'CTRL + SHIFT + F11')
  t.three.start({type='swipe',fingers=3,delta={x=99999,y=-99999},time_ms=100})
  circle_updates(t.three,1); finish(t.three)
  assert(#t.calls==0 and notified(t,'circle_cw'))
  local keys=0; for key in pairs(t.module.last) do assert(key=='reason'); keys=keys+1 end
  assert(keys==1)
end)
test('one-shot shape capture is opt-in, bounded, and ignores ordinary navigation', function()
  local t=setup()
  assert(type(t.module.capture_next_shape)=='function', 'shape capture API missing')
  assert(t.module.shape_capture()=='disabled')
  tap(t,'CTRL + SHIFT + F11'); circle(t.three,1)
  assert(t.module.shape_capture()=='disabled', 'normal shapes must not retain coordinates')
  t.module.capture_next_shape()
  swipe(t.three,-60,0)
  assert(t.module.shape_capture()=='waiting for next armed shape')
  tap(t,'CTRL + SHIFT + F11'); circle(t.three,1)
  local capture=t.module.shape_capture()
  assert(capture:find('circular motion recognized',1,true))
  assert(capture:find('closure=',1,true))
  assert(not capture:find('address:',1,true) and not capture:find('DP-5',1,true))
  local points=0
  for line in capture:gmatch('[^\n]+') do
    if line:match('^%-?[%d%.e+%-]+,%-?[%d%.e+%-]+$') then points=points+1 end
  end
  assert(points==65, 'capture must preserve real update coordinates exactly')
  tap(t,'CTRL + SHIFT + F11'); swipe(t.three,-60,0)
  assert(t.module.shape_capture()==capture, 'capture must stop after one attempt')
  t.module.clear_shape_capture(); assert(t.module.shape_capture()=='disabled')
end)
test('capture retains cancellation reason without changing stroke-consumption safety', function()
  local t=setup(); t.module.capture_next_shape(); tap(t,'CTRL + SHIFT + F11')
  start(t.three); update(t.three,-20,0); tap(t,'Escape')
  assert(t.module.shape_capture():find('cancelled: Escape',1,true))
  assert(t.module.shape_capture():find('-20,0',1,true))
  finish(t.three); assert(#t.calls==0)
  swipe(t.three,-60,0); assert(#t.calls==1)
end)
test('capture cannot be switched on in the middle of an existing arm or stroke', function()
  local t=setup(); tap(t,'CTRL + SHIFT + F11')
  assert(t.module.capture_next_shape()==false)
  start(t.three); assert(t.module.capture_next_shape()==false)
  finish(t.three); assert(t.module.shape_capture()=='disabled')
  assert(t.module.capture_next_shape()==true)
end)
test('live viewer receives only leased armed paths and their actual result', function()
  local t=setup()
  assert(type(t.module.viewer_heartbeat)=='function','viewer lease API missing')
  t.module.viewer_heartbeat()
  tap(t,'CTRL + SHIFT + F11'); start(t.three)
  t.three.update({type='swipe',fingers=3,delta={x=-60,y=0},time_ms=200})
  finish(t.three)
  local phases={}
  for _,call in ipairs(t.calls) do
    assert(call.action=='event','shape observation must never focus or execute')
    assert(call.data:find('centerstage_gesture_viewer_v1,',1,true)==1)
    assert(not call.data:find('address:',1,true) and not call.data:find('DP-5',1,true))
    phases[#phases+1]=call.data
  end
  assert(phases[1]:find('"phase":"armed"',1,true))
  assert(phases[2]:find('"phase":"drawing"',1,true))
  assert(phases[3]:find('[-60,0]',1,true))
  assert(phases[#phases]:find('"phase":"rejected"',1,true))
  assert(phases[#phases]:find('too few distinct points',1,true))
  local before=#t.calls
  t.module.viewer_stop();tap(t,'CTRL + SHIFT + F11');swipe(t.three,-60,0)
  assert(#t.calls==before,'closed viewer must not receive gesture coordinates')
end)
print(string.format('PASS: %d gesture binding tests',count))
