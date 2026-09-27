package.path='./?.lua;'..package.path
local ok,Stream=pcall(require,'centerstage-gesture-stream')
assert(ok,'Gesture stream publisher is not implemented: '..tostring(Stream))
local sent,timers={},{}
local api={
  dsp={event=function(value)return value end},dispatch=function(value)sent[#sent+1]=value end,
  timer=function(fn,opts)
    local t={fn=fn,opts=opts}
    function t:set_timeout(ms)self.timeout=ms end
    timers[#timers+1]=t;return t
  end,
}
local s=Stream.new(api)
assert(not s:publish('drawing',{{x=0,y=0},{x=10,y=-5}},nil,0))
assert(#sent==0,'closed viewer must receive no coordinates')
s:renew();s:renew();assert(#timers==1 and timers[1].opts.timeout==15000 and timers[1].timeout==15000)
assert(s:publish('armed',{}))
assert(s:publish('drawing',{{x=0,y=0},{x=10,y=-5}},nil,100))
assert(not s:publish('drawing',{{x=0,y=0},{x=11,y=-6}},nil,110),'drawing updates must be bounded')
assert(s:publish('rejected',{{x=0,y=0},{x=11,y=-6}},{reason='open "path"\nagain',metrics={closure=.5}},111))
assert(sent[#sent]:find('\\"path\\"\\nagain',1,true),'strings must be JSON escaped')
local old=timers[1];old.fn();assert(not s:publish('armed',{}))
s:renew();old.fn();assert(s:publish('armed',{}),'old expiry must not stop a new lease')
s:stop();assert(not s:publish('drawing',{{x=0,y=0}},nil,200))
s:renew();sent={}
local many={}
for i=1,512 do many[i]={x=i*1000.123,y=-i*899.987} end
assert(s:publish('recognized',many,{shape='circle_cw',reason='synthetic transport test',metrics={closure=0}},300))
assert(#sent>1,'large paths must be split for the native IPC cap')
for _,packet in ipairs(sent) do assert(#packet<=1024,'native IPC truncates event data after 1024 bytes') end
assert(sent[#sent]:find('"phase":"recognized"',1,true))
s:stop();s:renew();sent={}
assert(s:publish('rejected',many,{reason=string.rep('too long ',3000),metrics={closure=.8}},500))
assert(#sent>1)
for _,packet in ipairs(sent) do assert(#packet<=1024) end
assert(sent[#sent]:find('"phase":"rejected"',1,true),'oversized detail must not lose the final result')
assert(sent[#sent]:find('detail omitted',1,true),'truncated metadata must be explicitly labeled')
print('PASS: viewer lease, no closed-viewer data, bounded updates, JSON escaping, stale expiry, IPC chunks and terminal delivery')
