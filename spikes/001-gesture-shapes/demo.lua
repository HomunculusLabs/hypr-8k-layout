-- Standalone demo/replay. Lua standard library only. No compositor access.
local dir=debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './'
local R=assert(loadfile(dir..'recognizer.lua'))()
local F=assert(loadfile(dir..'fixtures.lua'))()
local samples={circle_cw=F.circle(),circle_ccw=F.circle({sign=-1}),noisy_circle=F.circle({noise=1.2}),straight=F.line(),partial=F.circle({turns=.8}),jitter=F.jitter(),outback=F.outback(),figure_eight=F.eight(),reversal=F.reverse_midway(),square=F.square()}
if arg[1]=='--emit-synthetic' then
  local path=assert(samples[arg[2]],'unknown synthetic sample')
  local file=assert(io.open(assert(arg[3],'provide output file'),'w'))
  file:write('# SYNTHETIC analytic fixture, NOT hardware data; screen +y down\n')
  for _,p in ipairs(path) do file:write(string.format('%.12g %.12g\n',p.x,p.y)) end
  file:close(); print('Wrote SYNTHETIC fixture: '..arg[3]); return
elseif arg[1]=='--replay' then
  local file=assert(io.open(assert(arg[2],'provide input file'),'r'))
  local text=file:read(65537) or ''; file:close(); assert(#text<=65536,'replay exceeds 64 KiB')
  local points={}
  for line in (text..'\n'):gmatch('(.-)\n') do
    if not line:match('^%s*#') and not line:match('^%s*$') then
      local x,y=line:match('^%s*([^,%s]+)[,%s]+([^,%s]+)%s*$')
      assert(x and tonumber(x) and tonumber(y),'expected x y or x,y, numeric coordinates only')
      points[#points+1]={x=tonumber(x),y=tonumber(y)}; assert(#points<=R.MAX_POINTS,'point limit')
    end
  end
  print('REPLAY '..arg[2]..' (provenance supplied by caller, not verified)')
  print(R.describe(R.recognize(points))); return
elseif arg[1] then error('usage: lua demo.lua [--replay FILE | --emit-synthetic NAME FILE]') end
print('All following paths are SYNTHETIC analytic fixtures, NOT hardware captures.')
for _,name in ipairs({'circle_cw','circle_ccw','noisy_circle','straight','partial','jitter','outback','figure_eight','reversal','square'}) do
  print(name..': '..R.describe(R.recognize(samples[name])))
end
