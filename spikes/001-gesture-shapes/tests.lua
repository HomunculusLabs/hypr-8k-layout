-- Test-first suite. All paths SYNTHETIC; hl is a mock, never the desktop.
package.path='./?.lua;'..package.path
local F=require('fixtures')
local count, failed=0,0
local function test(name,f)
  count=count+1; local ok,err=pcall(f)
  if ok then print('PASS '..name) else failed=failed+1; print('FAIL '..name..': '..tostring(err)) end
end
local function eq(a,b) assert(a==b,tostring(a)..' ~= '..tostring(b)) end
local function R(p) return require('recognizer').recognize(p) end
local function yes(p,s) local r=R(p); eq(r.shape,s); assert(r.score>=0 and r.score<=1); assert(r.metrics.turns); end
local function no(p) local r=R(p); eq(r.shape,nil); assert(type(r.reason)=='string' and #r.reason>0) end
for _,sign in ipairs({1,-1}) do
  local shape=sign==1 and 'circle_cw' or 'circle_ccw'
  test('synthetic '..shape,function() yes(F.circle({sign=sign}),shape) end)
  test('translation / scale '..shape,function()
    for _,r in ipairs({22,60,180}) do yes(F.circle({r=r,x=1932,y=-711,sign=sign}),shape) end
  end)
  test('varied sampling and phase '..shape,function()
    for _,n in ipairs({16,31,150,400}) do yes(F.circle({n=n,sampling=1.5,sign=sign,phase=.71}),shape) end
  end)
  test('bounded synthetic noise '..shape,function() yes(F.circle({noise=1.2,sign=sign}),shape) end)
end
for name,p in pairs({short=F.circle({r=3}),straight=F.line(),partial=F.circle({turns=.5}),jitter=F.jitter(),outback=F.outback(),eight=F.eight(),reversal=F.reverse_midway(),narrow=F.circle({aspect=.12}),excess_noise=F.circle({noise=16})}) do
  test('reject synthetic '..name,function() no(p) end)
end
for name,p in pairs({mostly_complete=F.circle({turns=.8}),near_complete=F.circle({turns=.9}),oval=F.circle({aspect=.4}),boxy_loop=F.square(),extra_lap=F.circle({turns=2})}) do
  test('tolerate synthetic '..name,function() yes(p,'circle_cw') end)
end
test('malformed inputs bounded / nonfinite',function()
  for _,p in ipairs({{},false,'x',{{x=0,y=0}},{{x=0/0,y=1}},{{x=math.huge,y=0}},{{x='1',y=0}},{{x=1e12,y=0}},F.circle({n=600}),{[1]={x=0,y=0},[3]={x=1,y=2}},setmetatable({},{__len=function() error('must not run metamethod') end})}) do no(p) end
end)
test('duplicate stationary samples',function() local p=F.circle(); table.insert(p,4,{x=p[3].x,y=p[3].y}); yes(p,'circle_cw') end)
test('tolerate tiny local contact wobble within a loop',function()
  local p=F.circle(); local a=p[30]
  for i,v in ipairs({{2,2},{-2,2},{2,-2},{-2,-2},{0,0}}) do table.insert(p,30+i,{x=a.x+v[1],y=a.y+v[2]}) end
  yes(p,'circle_cw')
end)
local function collect(p)
  local c=require('collector').new(); local first=true
  F.events(p,function(e) if first then c:start(e); first=false end; c:update(e) end)
  return c
end
test('collector does not double start delta; finish has no fingers',function()
  local c=collect(F.circle()); local r=c:finish({type='swipe',cancelled=false}); eq(r.shape,'circle_cw'); assert(r.metrics.closure<.001)
  eq(c:finish({type='swipe',cancelled=false}),nil)
end)
test('collector exact first update',function()
  local c=require('collector').new(); local e={type='swipe',fingers=3,delta={x=12,y=-4}}
  c:start(e); eq(#c.path,1); c:update(e); eq(c.path[2].x,12); eq(c.path[2].y,-4)
end)
for name,mutate in pairs({cancelled=function(c) end,fingers=function(c) c:update({type='swipe',fingers=4,delta={x=0,y=0}}) end,explicit=function(c) c:cancel('context changed') end,pinch=function(c) c:update({type='pinch',fingers=3,delta={x=0,y=0}}) end,nonfinite=function(c) c:update({type='swipe',fingers=3,delta={x=0/0,y=0}}) end}) do
  test('collector cancellation '..name,function() local c=collect(F.circle()); mutate(c); local r=c:finish({type='swipe',cancelled=name=='cancelled'}); eq(r.shape,nil); assert(r.reason) end)
end
test('collector update bound',function()
  local c=require('collector').new(); local e={type='swipe',fingers=3,delta={x=0,y=0}}
  c:start(e); for _=1,2000 do c:update(e) end
  assert(#c.path<=512); eq(c:finish({type='swipe',cancelled=false}).shape,nil)
end)
-- Native API mock. No production modules are sourced.
local function mock()
  local h={calls={},subs={},notes={},window={stable_id='one',fullscreen=0,workspace={id=1},monitor={name='A'}},ws={id=1,has_fullscreen=false},submap='',special=false,layers={},keys={Super_L=true,Alt_L=true},override=false}
  h.get_active_window=function() return h.window end
  h.get_active_workspace=function() return h.ws end
  h.get_active_monitor=function() return {name='A'} end
  h.get_active_special_workspace=function() return h.special or nil end
  h.get_current_submap=function() return h.submap end
  h.get_layers=function() return h.layers end
  h.get_config=function() return h.override end
  h.is_key_down=function(k) return h.keys[k]==true end
  h.gesture=function(s) h.calls[#h.calls+1]=s; if type(s.action)=='table' then h.action=s.action end end
  h.notification={create=function(n) h.notes[#h.notes+1]=n end}
  h.on=function(name,fn) local sub={name=name,fn=fn,removed=false}; function sub:remove() self.removed=true end; h.subs[#h.subs+1]=sub; return sub end
  function h.emit(name,...) for _,s in ipairs(h.subs) do if s.name==name and not s.removed then s.fn(...) end end end
  return h
end
local function adapter(h) return require('adapter').new(h) end
local function play(h,change)
  local first=true
  F.events(F.circle(),function(e,i)
    if first then h.action.start(e); first=false end
    if change and i==30 then change(h) end
    h.action.update(e)
  end)
  h.action.finish({type='swipe',cancelled=false})
end
test('adapter opt-in / exact tuple / idempotence / subscriptions',function()
  local h=mock(); local a=adapter(h); eq(#h.calls,0); a.enable(); a.enable(); eq(#h.calls,1)
  play(h); eq(a.last().shape,'circle_cw'); eq(#h.notes,1); h.action.finish({type='swipe',cancelled=false}); eq(#h.notes,1)
  a.disable(); a.disable(); eq(#h.calls,2)
  local x,y=h.calls[1],h.calls[2]; eq(x.mods,'SUPER ALT'); eq(x.fingers,3); eq(x.direction,'swipe'); eq(x.disable_inhibit,false); eq(x.scale,1)
  for _,k in ipairs({'mods','fingers','direction','disable_inhibit','scale'}) do eq(x[k],y[k]) end; eq(y.action,'unset')
  for _,s in ipairs(h.subs) do assert(s.removed) end
  a.enable(); eq(#h.calls,3); play(h); eq(#h.notes,2); a.disable()
end)
for name,change in pairs({fullscreen=function(h) h.window.fullscreen=1 end,workspace_fullscreen=function(h) h.ws.has_fullscreen=true end,special=function(h) h.special=true end,submap=function(h) h.submap='picker' end,layer=function(h) h.layers={{mapped=true,interactivity=1}} end,modifiers=function(h) h.keys.Alt_L=false end,inhibit_override=function(h) h.override=true end,focus=function(h) h.window.stable_id='two' end,workspace=function(h) h.ws.id=2 end}) do
  test('adapter guard '..name,function() local h=mock(); local a=adapter(h); a.enable(); play(h,change); eq(a.last().shape,nil); eq(#h.notes,1); a.disable() end)
end
for _,event in ipairs({'window.active','workspace.active','workspace.special_active','keybinds.submap','monitor.focused','layer.opened','window.fullscreen','input.keyboard.key'}) do
  test('adapter sticky event cancel '..event,function()
    local h=mock(); local a=adapter(h); a.enable(); play(h,function() h.emit(event,64,123,0) end); eq(a.last().shape,nil); eq(#h.notes,1); a.disable()
  end)
end
test('blocked start cannot recover during trace',function() local h=mock(); h.submap='x'; local a=adapter(h); a.enable(); play(h,function() h.submap='' end); eq(a.last().shape,nil); a.disable() end)
test('guard exception fails closed',function() local h=mock(); h.get_layers=function() error('unavailable') end; local a=adapter(h); a.enable(); play(h); eq(a.last().shape,nil); a.disable() end)
test('collector duplicate start cancels; no restart within stroke',function()
  local c=collect(F.circle()); c:start({type='swipe',fingers=3,delta={x=500,y=500}})
  eq(c:finish({type='swipe',cancelled=false}).shape,nil)
end)
test('collector duration bound',function()
  local c=require('collector').new(); c:start({type='swipe',fingers=3,time_ms=100})
  c:update({type='swipe',fingers=3,time_ms=6000,delta={x=1,y=1}})
  eq(c:finish({type='swipe',cancelled=false}).shape,nil)
end)
test('adapter cancelled finish and disable while collecting',function()
  local h=mock(); local a=adapter(h); a.enable(); local first=true
  F.events(F.circle(),function(e) if first then h.action.start(e); first=false end; h.action.update(e) end)
  h.action.finish({type='swipe',cancelled=true}); eq(a.last().shape,nil); eq(#h.notes,1)
  h.action.start({type='swipe',fingers=3}); a.disable(); h.action.finish({type='swipe',cancelled=false}); eq(#h.notes,1)
end)
test('failed registration abandon never unsets a foreign tuple',function()
  local h=mock(); local a=adapter(h); a.enable(); a.abandon_failed_enable(); a.disable(); eq(#h.calls,1)
  for _,s in ipairs(h.subs) do assert(s.removed) end
end)
test('namespaced entry is inert and singleton',function()
  local h=mock(); _G.hl=h; package.loaded.gesture_shapes=nil
  local a=dofile('gesture_shapes.lua'); eq(#h.calls,0); eq(dofile('gesture_shapes.lua'),a)
  a.enable(); dofile('gesture_shapes.lua').enable(); eq(#h.calls,1); a.disable()
  package.loaded.gesture_shapes=nil; _G.hl=nil
end)
print(string.format('SYNTHETIC/MOCK: %d tests, %d passed, %d failed',count,count-failed,failed))
os.exit(failed==0 and 0 or 1)
