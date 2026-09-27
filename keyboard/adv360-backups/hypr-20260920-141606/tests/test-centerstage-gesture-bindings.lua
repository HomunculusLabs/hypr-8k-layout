-- Integration uses real modules and native-shaped fake clients; no desktop mutation.
package.path = './?.lua;' .. package.path
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
    active=3, workspace=1, binds={}, gestures={}, events={}, calls={}, submap=''}
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
    dsp={focus=function(spec) return {action='focus',window=spec.window} end},
    dispatch=function(d) t.calls[#t.calls+1]=d end,
    exec_cmd=function(cmd) t.calls[#t.calls+1]={action='exec',cmd=cmd} end,
    notification={create=function() end},
  }
  dofile('input.lua') -- Prevent accidental duplicate workspace bindings during config migration.
  local ok, module=pcall(dofile,'gestures.lua')
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
print(string.format('PASS: %d gesture binding tests',count))
