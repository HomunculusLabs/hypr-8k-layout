-- One-shot notify-only shape controller. No focus/exec capability is passed here.
-- Load only the bounded prototype collector, never its old modifier binding.
local dir=debug.getinfo(1,'S').source:sub(2):match('^(.*[/])') or './'
local Collector=assert(loadfile(dir..'spikes/001-gesture-shapes/collector.lua'))()
local Mode={}; Mode.__index=Mode
function Mode.new(options)
  return setmetatable({options=options, collector=Collector.new(), consumed=false},Mode)
end
function Mode:observe(phase,points,result,time_ms)
  -- A disconnected or failed visual observer must never change gesture behavior.
  if self.options.observe then pcall(self.options.observe,phase,points,result,time_ms) end
end
function Mode:request_capture()
  -- Explicit troubleshooting only: at most the next successfully armed attempt.
  if self.initial or self.consumed then return false end
  self.capture_requested=true
  self.capture=nil
  return true
end
function Mode:clear_capture()
  self.capture_requested=false; self.capture_active=false; self.capture=nil
end
function Mode:capture_text()
  if self.capture then return self.capture end
  if self.capture_active then return 'capturing armed shape' end
  return self.capture_requested and 'waiting for next armed shape' or 'disabled'
end
function Mode:record_capture(reason,points,metrics)
  if not self.capture_active then return end
  self.capture_active=false
  local lines={'# relative gesture coordinates; no screen position or application data',
    '# reason='..tostring(reason):gsub('[\r\n]',' ')}
  local keys={}
  for key,value in pairs(metrics or {}) do
    if type(value)=='number' then keys[#keys+1]=key end
  end
  table.sort(keys)
  for _,key in ipairs(keys) do lines[#lines+1]='# '..key..'='..string.format('%.17g',metrics[key]) end
  for i=1,math.min(#(points or {}),512) do
    local p=points[i]
    lines[#lines+1]=string.format('%.17g,%.17g',p.x,p.y)
  end
  self.capture=table.concat(lines,'\n')
end
function Mode:clear()
  self.capture_active=false
  self.token=nil -- Invalidate even an already queued callback before stopping the timer.
  if self.timer then self.timer:set_enabled(false); self.timer=nil end
  self.initial=nil
  self.collector:reset() -- Coordinates are transient and never exported or logged.
  -- Do NOT clear consumed here: cancellation must drain through native finish.
end
function Mode:cancel(reason)
  if not self.initial then return end
  self:record_capture('cancelled: '..(reason or 'context changed'),self.collector.path)
  self:observe('cancelled',self.collector.path,{reason='cancelled: '..(reason or 'context changed')})
  self:clear()
  self.options.notify('cancelled: '..(reason or 'context changed'))
end
function Mode:tap()
  if self.initial then self:cancel('Hotkey1'); return end
  if self.consumed then return end
  if not self.options.enabled() then self:observe('cancelled',{}, {reason='gestures disabled'});return end
  local initial=self.options.snapshot()
  if not initial then
    self:observe('cancelled',{}, {reason='unavailable context'})
    self.options.notify('cancelled: unavailable context');return
  end
  self.initial=initial
  self.capture_active=self.capture_requested==true
  self.capture_requested=false
  local token={}; self.token=token
  self.timer=self.options.timer(function()
    if self.token==token then self:cancel('timeout') end
  end,{timeout=8000,type='oneshot'})
  self:observe('armed',{})
  self.options.notify('armed: draw one three-finger circle (8 seconds); Hotkey1/Escape cancels')
end
function Mode:valid()
  return self.options.enabled() and self.options.same_context(self.initial,self.options.snapshot())
end
function Mode:start(e)
  if self.consumed then self:cancel('duplicate start'); return true end
  if not self.initial then return false end
  self.consumed=true
  if not self:valid() then self:cancel('context changed'); return true end
  self.collector:start(e)
  if self.collector.reason then self:cancel(self.collector.reason)
  else self:observe('drawing',self.collector.path,nil,e.time_ms) end
  return true
end
function Mode:update(e)
  if not self.consumed then return false end
  if self.initial then
    self.collector:update(e)
    if self.collector.reason then self:cancel(self.collector.reason)
    else self:observe('drawing',self.collector.path,nil,e.time_ms) end
  end
  return true
end
function Mode:finish(e)
  if not self.consumed then return false end
  if self.initial then
    if not self:valid() then self:cancel('context changed')
    else
      local points=self.collector.path
      local result=self.collector:finish(e)
      self:record_capture(result.reason,points,result.metrics)
      self:observe(result.shape and 'recognized' or (type(e)=='table' and e.cancelled and 'cancelled' or 'rejected'),points,result)
      self:clear()
      self.options.notify(result.shape and ('completed: '..result.shape..' (notification only)')
        or ('cancelled: '..result.reason))
    end
  end
  self.consumed=false
  return true
end
return Mode
