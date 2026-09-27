-- Comfortable circular-motion recognition, not a geometric circle test.
-- Screen +y down => positive rotation is clockwise. Work stays bounded.
local M={MAX_POINTS=512,MAX_COORD=1000000}
local abs,sqrt,pi=math.abs,math.sqrt,math.pi
function M.finite(x) return type(x)=='number' and x==x and abs(x)<=M.MAX_COORD end
function M.reject(reason,metrics) return {reason=reason,score=0,metrics=metrics or {}} end
local function distance(a,b) return sqrt((a.x-b.x)^2+(a.y-b.y)^2) end
local function angle_delta(a,b) return (a-b+pi)%(2*pi)-pi end
local function bounds(p,last)
  local minx,maxx,miny,maxy=p[1].x,p[1].x,p[1].y,p[1].y
  for i=2,last do local q=p[i]
    minx=math.min(minx,q.x);maxx=math.max(maxx,q.x)
    miny=math.min(miny,q.y);maxy=math.max(maxy,q.y)
  end
  return minx,maxx,miny,maxy
end
local function resample(p,lengths,length)
  local q={};local index=2
  for i=0,96 do
    local target=length*i/96
    while index<#p and lengths[index]<target do index=index+1 end
    local a,b=p[index-1],p[index]
    local t=(target-lengths[index-1])/(lengths[index]-lengths[index-1])
    q[#q+1]={x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t}
  end
  -- Suppress small contact jitter without changing the actual displayed path.
  local smooth={q[1]}
  for i=2,#q-1 do
    local x,y,weight=0,0,0
    for j=math.max(1,i-2),math.min(#q,i+2) do
      local w=3-abs(i-j);x=x+q[j].x*w;y=y+q[j].y*w;weight=weight+w
    end
    smooth[i]={x=x/weight,y=y/weight}
  end
  smooth[#q]=q[#q]
  return smooth
end
local function heading(p)
  local previous,total,travel,maxstep=nil,0,0,0
  local length=0
  for i=2,#p do
    local a,b=p[i-1],p[i];local d=distance(a,b);length=length+d
    if d>1e-8 then
      local angle=math.atan(b.y-a.y,b.x-a.x)
      if previous then
        local turn=angle_delta(angle,previous)
        total=total+turn;travel=travel+abs(turn);maxstep=math.max(maxstep,abs(turn))
      end
      previous=angle
    end
  end
  return total/(2*pi),abs(total)/math.max(travel,1e-9),maxstep,length
end
local function loop_prefix(p,last,sign)
  local minx,maxx,miny,maxy=bounds(p,last)
  local w,h=maxx-minx,maxy-miny;local span=math.max(w,h)
  if span<30 or math.min(w,h)/span<.32 then return nil end
  local cx,cy=(minx+maxx)/2,(miny+maxy)/2
  local q={};local radii={};local mean,minimum=0,math.huge
  for i=1,last do
    local x,y=(p[i].x-cx)/(w/2),(p[i].y-cy)/(h/2)
    q[i]={x=x,y=y};local r=sqrt(x*x+y*y)
    radii[i]=r;mean=mean+r/last;minimum=math.min(minimum,r)
  end
  if mean<1e-8 or minimum/mean<.35 then return nil end
  local variance=0
  for _,r in ipairs(radii) do variance=variance+(r-mean)^2/last end
  local cv=sqrt(variance)/mean
  if cv>.30 then return nil end
  local total,travel,maxstep,perimeter,area=0,0,0,0,0
  local previous=math.atan(q[1].y,q[1].x)
  for i=2,#q do
    local angle=math.atan(q[i].y,q[i].x);local d=angle_delta(angle,previous)
    total=total+d;travel=travel+abs(d);maxstep=math.max(maxstep,abs(d));previous=angle
    perimeter=perimeter+distance(q[i-1],q[i])
    area=area+q[i-1].x*q[i].y-q[i].x*q[i-1].y
  end
  area=area+q[#q].x*q[1].y-q[1].x*q[#q].y
  local turns=total/(2*pi);local consistency=abs(total)/math.max(travel,1e-9)
  local circularity=2*pi*abs(area)/math.max((perimeter+distance(q[1],q[#q]))^2,1e-9)
  local closure=distance(p[1],p[last])/span
  if turns*sign<.70 or abs(turns)>1.35 or consistency<.80 or maxstep>1.6
      or circularity<.55 or closure>.85 then return nil end
  return {turns=turns,direction_consistency=consistency,radial_cv=cv,circularity=circularity,
    loop_fraction=(last-1)/(#p-1),loop_closure=closure,loop_aspect=math.min(w,h)/span}
end
function M.recognize(input)
  local m={};local function reject(s) return M.reject(s,m) end
  if type(input)~='table' or getmetatable(input)~=nil then return reject('path must be a plain dense array') end
  local p={};local n=rawlen(input)
  if n>M.MAX_POINTS then return reject('point limit') end
  local k,count=nil,0
  repeat k=next(input,k);if k~=nil then
    count=count+1
    if count>M.MAX_POINTS or type(k)~='number' or k%1~=0 or k<1 or k>n then return reject('path must be a dense array') end
  end until k==nil
  if count~=n then return reject('path must be a dense array') end
  for i=1,n do
    local q=rawget(input,i)
    if type(q)~='table' or getmetatable(q)~=nil or not M.finite(rawget(q,'x')) or not M.finite(rawget(q,'y')) then return reject('invalid/nonfinite coordinate') end
    if #p==0 or distance(q,p[#p])>1e-8 then p[#p+1]={x=q.x,y=q.y} end
  end
  m.input_points=n;m.distinct_points=#p
  if #p<12 then return reject('too few distinct points') end
  local lengths={0};local length=0
  for i=2,#p do length=length+distance(p[i-1],p[i]);lengths[i]=length end
  local minx,maxx,miny,maxy=bounds(p,#p);local w,h=maxx-minx,maxy-miny
  local span=math.max(w,h)
  m.length=length;m.span=span;m.aspect=math.min(w,h)/math.max(span,1e-9)
  if length<80 or span<30 then return reject('trace too short/small') end
  m.closure=distance(p[1],p[#p])/span -- Informational: release need not close the loop.
  local q=resample(p,lengths,length)
  local turns,consistency,maxstep,smooth_length=heading(q)
  m.heading_turns=turns;m.heading_consistency=consistency;m.roughness=length/math.max(smooth_length,1e-9)
  if abs(turns)<.62 then return reject('not enough circular motion') end
  if consistency<.60 or maxstep>2.6 then return reject('motion reverses or doubles back') end
  if m.roughness>1.90 then return reject('too much scribble or jitter') end
  local sign=turns>0 and 1 or -1
  -- Prefer a completed-enough first loop. Later same-direction motion/laps are
  -- harmless overshoot, not a reason to demand an exact lift-off point.
  local match
  for last=25,#q,4 do match=loop_prefix(q,last,sign);if match then break end end
  if not match then return reject('not enough circular motion') end
  for key,value in pairs(match) do m[key]=value end
  m.accepted_loop=1
  local quality=.45*consistency+.35*match.direction_consistency+.20*(1-math.min(match.radial_cv/.30,1))
  return {shape=sign>0 and 'circle_cw' or 'circle_ccw',reason='circular motion recognized',
    score=math.max(0,math.min(1,quality)),metrics=m}
end
function M.describe(r)
  if not r then return 'no result' end
  local parts={r.shape or 'rejected',r.reason or '',string.format('quality=%.3f (heuristic)',r.score or 0)}
  local keys={};for k in pairs(r.metrics or {}) do keys[#keys+1]=k end;table.sort(keys)
  for _,k in ipairs(keys) do parts[#parts+1]=k..'='..string.format('%.4f',r.metrics[k]) end
  return table.concat(parts,'; ')
end
return M
