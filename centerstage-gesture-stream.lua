-- Lease-gated, bounded gesture snapshots over Hyprland's native IPC event socket.
-- No files, sockets, subprocesses or application identities in this publisher.
local Stream={};Stream.__index=Stream
local phases={idle=true,armed=true,drawing=true,recognized=true,rejected=true,cancelled=true}
local function finite(n) return type(n)=='number' and n==n and math.abs(n)<=1e12 end
local function quote(value)
  local escapes={['"']='\\"',['\\']='\\\\',['\n']='\\n',['\r']='\\r',['\t']='\\t'}
  return '"'..tostring(value):gsub('[%c\\"]',function(c)
    return escapes[c] or string.format('\\u%04x',c:byte())
  end)..'"'
end
function Stream.new(api,topic)
  topic=topic or 'centerstage_gesture_viewer_v1'
  assert(type(topic)=='string' and #topic<=64 and topic:match('^[%w_]+$'),'invalid viewer IPC topic')
  return setmetatable({api=api,topic=topic,enabled=false,sequence=0,sent=0},Stream)
end
function Stream:renew()
  if not self.enabled then self.current=nil;self.sent=0 end
  self.enabled=true
  if self.timer then self.timer:set_timeout(15000);return end
  local token={};self.token=token
  self.timer=self.api.timer(function()
    if self.token==token then self.enabled=false;self.timer=nil;self.token=nil;self.last_ms=nil end
  end,{timeout=15000,type='oneshot'})
end
function Stream:stop()
  self.enabled=false;self.last_ms=nil
  -- Let the one-shot expire so Hyprland frees its registry reference.
end
function Stream:publish(phase,points,result,time_ms)
  if not self.enabled or not phases[phase] then return false end
  points=points or {};result=result or {}
  if #points>512 or (result.shape and result.shape~='circle_cw' and result.shape~='circle_ccw') then return false end
  for _,p in ipairs(points) do
    if not finite(p.x) or not finite(p.y) or math.abs(p.x)>1000000 or math.abs(p.y)>1000000 then return false end
  end
  local reset=phase=='armed' or not self.current or #points<self.sent
  if not reset and phase=='drawing' and finite(time_ms) and self.last_ms then
    if (time_ms-self.last_ms)%4294967296<40 then return false end
  end
  local sequence=reset and self.sequence+1 or self.sequence
  local current=reset and sequence or self.current
  local sent=reset and 0 or self.sent
  local raw_reason=result.reason or ''
  if type(raw_reason)~='string' then return false end
  local reason=#raw_reason>160 and quote('Result detail omitted: viewer message limit') or quote(raw_reason)
  if #reason>256 then reason=quote('Result detail omitted: viewer message limit') end
  local packets={}
  -- Validate the entire batch before dispatch. A long terminal message must
  -- never leave an otherwise accepted path stuck in the drawing state.
  repeat
    local last=math.min(sent+8,#points)
    local final=last==#points
    local path={}
    for i=sent+1,last do path[#path+1]=string.format('[%.9g,%.9g]',points[i].x,points[i].y) end
    local fields={'"phase":'..quote(final and phase or 'drawing'),
      '"points":['..table.concat(path,',')..']','"append":true',
      '"reset":'..tostring(reset),'"stream":'..current,'"offset":'..sent}
    if final then
      local metrics={}
      for _,key in ipairs({'closure','aspect','length','span','input_points','distinct_points','turns','direction_consistency','circularity','radial_cv'}) do
        local value=(result.metrics or {})[key]
        if finite(value) then metrics[#metrics+1]=quote(key)..':'..string.format('%.9g',value) end
      end
      fields[#fields+1]='"reason":'..reason
      local metric_index=#fields+1
      fields[metric_index]='"metrics":{'..table.concat(metrics,',')..'}'
      if result.shape then fields[#fields+1]='"shape":'..quote(result.shape) end
      if #self.topic+2+#table.concat(fields,',')+1>1024 then
        fields[metric_index]='"metrics":{}'
        fields[metric_index-1]='"reason":'..quote('Result detail omitted: viewer message limit')
      end
    end
    local data=self.topic..',{'..table.concat(fields,',')..'}'
    if #data>1024 then return false end
    packets[#packets+1]=data
    sent=last;reset=false
  until sent==#points
  for _,data in ipairs(packets) do self.api.dispatch(self.api.dsp.event(data)) end
  self.sequence=sequence;self.current=current;self.sent=sent
  if phase=='armed' then self.last_ms=nil end
  if phase=='drawing' and finite(time_ms) then self.last_ms=time_ms end
  return true
end
return Stream
