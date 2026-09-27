-- Isolated synthetic stress/syntax probe; CPU timings are observations, not guarantees.
local R=require('recognizer'); local F=require('fixtures')
for _,name in ipairs({'recognizer.lua','collector.lua','adapter.lua','gesture_shapes.lua','fixtures.lua','tests.lua','demo.lua','verify.lua'}) do assert(loadfile(name)) end
print('Syntax: 8 Lua files parsed')
local total=0
for _,sign in ipairs({1,-1}) do for _,n in ipairs({16,31,96,200,511}) do
  for _,radius in ipairs({22,60,180}) do for _,phase in ipairs({0,.6,2.1}) do
    local r=R.recognize(F.circle({n=n,r=radius,sign=sign,phase=phase,x=2000,y=-1500,sampling=1.3}))
    assert(r.shape==(sign==1 and 'circle_cw' or 'circle_ccw'),R.describe(r)); total=total+1
  end end
end end
print('SYNTHETIC parameter sweep: '..total..' accepted with correct direction')
local p=F.circle({n=511}); local trials=100; local begin=os.clock(); local worst=0
for _=1,trials do local start=os.clock(); assert(R.recognize(p).shape=='circle_cw'); worst=math.max(worst,os.clock()-start) end
print(string.format('SYNTHETIC 512-point path: %d runs, mean %.3f ms CPU, max %.3f ms CPU',trials,(os.clock()-begin)*1000/trials,worst*1000))
