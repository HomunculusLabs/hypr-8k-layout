-- All fixtures are deterministic SYNTHETIC analytic paths, NOT hardware captures.
local F = {}
function F.circle(o)
  o=o or {}; local p={}; local n=o.n or 96
  for i=0,n do
    local t=(i/n)^(o.sampling or 1)
    local a=(o.sign or 1)*2*math.pi*t*(o.turns or 1)+(o.phase or 0)
    local noise=(o.noise or 0)*math.sin(i*2.37)
    local r=(o.r or 60)+noise
    p[#p+1]={x=(o.x or 0)+r*math.cos(a),y=(o.y or 0)+r*(o.aspect or 1)*math.sin(a)}
  end
  return p
end
function F.line()
  local p={}; for i=0,80 do p[#p+1]={x=i*3,y=i*.7} end; return p
end
function F.eight()
  local p={}; for i=0,120 do local a=i/120*2*math.pi; p[#p+1]={x=70*math.sin(a),y=50*math.sin(2*a)} end; return p
end
function F.outback()
  local p=F.line(); for i=#p-1,1,-1 do p[#p+1]={x=p[i].x,y=p[i].y} end; return p
end
function F.jitter()
  local p={}; for i=1,180 do p[i]={x=3*math.sin(i*2.3),y=4*math.cos(i*1.7)} end; return p
end
function F.reverse_midway()
  local p=F.circle({turns=.65}); for i=#p-1,1,-1 do p[#p+1]={x=p[i].x,y=p[i].y} end; return p
end
function F.square()
  local p={}; local corners={{0,0},{120,0},{120,120},{0,120},{0,0}}
  for k=1,4 do for i=0,24 do local t=i/25; p[#p+1]={x=corners[k][1]*(1-t)+corners[k+1][1]*t,y=corners[k][2]*(1-t)+corners[k+1][2]*t} end end
  p[#p+1]={x=0,y=0}; return p
end
function F.events(p,fn)
  for i=2,#p do fn({type='swipe',fingers=3,delta={x=p[i].x-p[i-1].x,y=p[i].y-p[i-1].y},time_ms=i*8},i) end
end
return F
