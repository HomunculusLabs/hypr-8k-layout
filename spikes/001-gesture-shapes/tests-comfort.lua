-- Comfort behavior tests. Every path in this file is explicitly SYNTHETIC.
local dir=debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './'
local R=assert(loadfile(dir..'recognizer.lua'))()
local F=assert(loadfile(dir..'fixtures.lua'))()
local count,failed=0,0
local function test(name,fn)
  count=count+1;local ok,err=pcall(fn)
  if ok then print('PASS '..name) else failed=failed+1;print('FAIL '..name..': '..tostring(err)) end
end
local function accept(path,sign)
  local r=R.recognize(path);local expected=sign==1 and 'circle_cw' or 'circle_ccw'
  assert(r.shape==expected,R.describe(r));assert(r.score>=0 and r.score<=1)
end
for _,sign in ipairs({1,-1}) do
  test('mostly complete circle '..sign,function()
    for _,turns in ipairs({.8,.9}) do accept(F.circle({turns=turns,sign=sign}),sign) end
  end)
  test('oval and rough loop '..sign,function()
    accept(F.circle({aspect=.45,sign=sign}),sign)
    accept(F.circle({noise=3,sign=sign}),sign)
    local path=F.circle({sign=sign})
    for i,p in ipairs(path) do p.x=p.x+25*(i-1)/(#path-1);p.y=p.y+4*math.sin(i*.2) end
    accept(path,sign)
  end)
  test('overshoot and repeated laps '..sign,function()
    for _,turns in ipairs({1.15,1.35,2}) do accept(F.circle({turns=turns,sign=sign,n=192}),sign) end
  end)
  test('completed loop followed by same-direction trailing arc '..sign,function()
    local path={}
    for i=0,128 do
      local turns=1.3*i/128;local a=sign*2*math.pi*turns
      local r=60*(1+math.max(0,turns-1)*2)
      path[#path+1]={x=r*math.cos(a),y=r*math.sin(a)}
    end
    accept(path,sign)
  end)
end
test('a boxy loop still expresses clockwise intent',function() accept(F.square(),1) end)
test('tiny local wobble does not invalidate a full loop',function()
  local p=F.circle();local a=p[30]
  for i,v in ipairs({{2,2},{-2,2},{2,-2},{-2,-2},{0,0}}) do table.insert(p,30+i,{x=a.x+v[1],y=a.y+v[2]}) end
  accept(p,1)
end)
for name,path in pairs({line=F.line(),half=F.circle({turns=.5}),small_arc=F.circle({turns=.6}),
    figure_eight=F.eight(),outback=F.outback(),reverse=F.reverse_midway(),jitter=F.jitter(),
    tiny=F.circle({r=3}),narrow=F.circle({aspect=.12}),chaotic=F.circle({noise=16})}) do
  test('reject '..name,function()local r=R.recognize(path);assert(not r.shape,R.describe(r))end)
end
test('seeded closed scribbles stay rejected',function()
  math.randomseed(93021)
  for _=1,100 do
    local path={{x=0,y=0}}
    for i=2,96 do path[i]={x=math.random(-120,120),y=math.random(-120,120)} end
    path[#path+1]={x=0,y=0}
    local r=R.recognize(path);assert(not r.shape,R.describe(r))
  end
end)
print(string.format('SYNTHETIC COMFORT: %d tests, %d passed, %d failed',count,count-failed,failed))
os.exit(failed==0 and 0 or 1)
