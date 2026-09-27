-- A bounded one-shot collector. start's delta is intentionally NEVER accumulated.
local dir=debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './'
local R=assert(loadfile(dir..'recognizer.lua'))()
local C={}; C.__index=C
function C.new() return setmetatable({active=false,path={}},C) end
function C:cancel(reason) if self.active and not self.reason then self.reason=reason or 'cancelled' end end
function C:start(e)
  if self.active then self:cancel('duplicate start'); return end
  self.active=true; self.path={{x=0,y=0}}; self.reason=nil; self.updates=0; self.start_time=nil
  if type(e)~='table' or e.type~='swipe' or e.fingers~=3 then self:cancel('not a three-finger swipe'); return end
  if type(e.time_ms)=='number' and e.time_ms==e.time_ms then self.start_time=e.time_ms end
end
function C:update(e)
  if not self.active or self.reason then return end
  self.updates=self.updates+1
  if self.updates>=R.MAX_POINTS then self:cancel('update limit'); return end
  if type(e)~='table' or e.type~='swipe' or e.fingers~=3 then self:cancel('type/finger count changed'); return end
  if type(e.delta)~='table' or not R.finite(e.delta.x) or not R.finite(e.delta.y) then self:cancel('invalid/nonfinite delta'); return end
  if self.start_time and type(e.time_ms)=='number' then
    local elapsed=(e.time_ms-self.start_time)%4294967296
    if elapsed>5000 then self:cancel('duration limit (5 seconds)'); return end
  end
  local p=self.path[#self.path]; local x,y=p.x+e.delta.x,p.y+e.delta.y
  if not R.finite(x) or not R.finite(y) then self:cancel('coordinate limit'); return end
  self.path[#self.path+1]={x=x,y=y}
end
function C:finish(e)
  if not self.active then return nil end
  if type(e)~='table' or e.type~='swipe' or e.cancelled~=false then self:cancel('cancelled/malformed finish') end
  -- Native v0.56.2 finish lacks fingers; if supplied by replay, still validate it.
  if type(e)=='table' and e.fingers~=nil and e.fingers~=3 then self:cancel('finger count changed') end
  local result=self.reason and R.reject(self.reason) or R.recognize(self.path)
  self.active=false; self.path={}; self.reason=nil
  return result
end
function C:reset() self.active=false; self.path={}; self.reason=nil end
return C
