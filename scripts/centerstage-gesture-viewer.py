#!/usr/bin/env python3
"""Read-only, loopback-only viewer for explicitly armed Centerstage gestures.

All gesture data is held in memory. The IPC reader immediately discards unrelated
Hyprland events. The browser cannot dispatch commands or modify the desktop.
"""
import argparse
import copy
import json
import math
import os
from pathlib import Path
import signal
import socket
import subprocess
import threading
import time
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import cast
from urllib.parse import urlsplit

PREFIX = 'custom>>centerstage_gesture_viewer_v1,'
PHASES = {'idle', 'armed', 'drawing', 'recognized', 'rejected', 'cancelled'}
PAGE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gesture viewer</title><link rel="icon" href="data:,">
<style>
:root{color-scheme:dark;--bg:#1d2021;--panel:#282828;--line:#504945;--ink:#ebdbb2;--muted:#bdae93;--accent:#fabd2f;--start:#b8bb26;--end:#fe8019}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Liberation Sans",Arial,sans-serif}
main{max-width:940px;margin:0 auto;padding:28px 32px 22px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}
h1{font-size:23px;line-height:1.2;margin:0 0 7px;font-weight:600;letter-spacing:-.4px}p{margin:0;color:var(--muted)}.connection{font-size:12px;white-space:nowrap;padding-top:5px;color:var(--muted)}.connection::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#928374;margin-right:7px}.connection.live::before{background:var(--start)}
.statebar{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-bottom:0;padding:11px 16px;background:var(--panel);border-radius:8px 8px 0 0}
#phase{font-weight:600;color:var(--accent)}#source{font:11px "JetBrainsMono Nerd Font",monospace;color:var(--muted)}
.stage{position:relative;border:1px solid var(--line);background:#222424;border-radius:0 0 8px 8px;overflow:hidden}
svg{display:block;width:100%;height:auto;max-height:65vh;min-height:260px}svg text{font-family:"Liberation Sans",Arial,sans-serif}.legend{display:flex;gap:20px;padding:10px 16px;font-size:12px;color:var(--muted);border-top:1px solid #3c3836}.mark{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}.mark.start{border:2px solid var(--start)}.mark.end{background:var(--end)}.dash{display:inline-block;width:17px;border-top:1px dashed var(--end);vertical-align:middle;margin-right:6px}
.result{display:grid;grid-template-columns:1fr auto;gap:20px;padding:18px 0;border-bottom:1px solid var(--line)}.eyebrow{font:11px "JetBrainsMono Nerd Font",monospace;color:var(--muted);text-transform:uppercase;letter-spacing:1px}.result h2{font-size:18px;font-weight:500;margin:3px 0 5px}.stats{display:flex;gap:25px;align-items:center;font:13px "JetBrainsMono Nerd Font",monospace;text-align:right}.stats small{display:block;color:var(--muted);font:11px "Liberation Sans",Arial,sans-serif;margin-bottom:3px}.bottom{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:16px}.bottom p{font-size:12px}kbd{font:11px "JetBrainsMono Nerd Font",monospace;border:1px solid #665c54;border-bottom-width:2px;border-radius:4px;padding:3px 6px;background:var(--panel);color:var(--ink);white-space:nowrap}button{background:transparent;border:1px solid #665c54;color:var(--ink);font:13px "Liberation Sans",Arial,sans-serif;border-radius:5px;padding:10px 16px;min-height:44px;cursor:pointer}button:hover{background:#3c3836}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button:disabled{opacity:.4;cursor:default}
@media(max-width:560px){main{padding:20px 16px}header{display:block}.connection{margin-top:12px}.result{grid-template-columns:1fr}.stats{text-align:left;gap:36px}.bottom{align-items:flex-start}.bottom p{max-width:240px}.legend{gap:14px;font-size:11px}#source{max-width:140px;text-align:right}svg{min-height:240px}}
</style></head><body><main>
<header><div><h1>Gesture viewer</h1><p>Tap <kbd>Hotkey 1</kbd>, then draw with three fingers.</p></div><div id="connection" class="connection" role="status">Connecting…</div></header>
<div class="statebar"><span id="phase" aria-live="polite">Waiting</span><span id="source">No gesture yet</span></div>
<div class="stage"><svg id="plot" viewBox="0 0 720 520" role="img" aria-label="Live gesture path with start and end markers">
<defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#343634" stroke-width=".7"/></pattern></defs>
<rect width="720" height="520" fill="url(#grid)"/><path d="M350 260h20M360 250v20" stroke="#665c54" stroke-width="1"/>
<g id="empty"><text id="empty-title" x="360" y="239" text-anchor="middle" fill="#ebdbb2" font-size="19">Your gesture will appear here</text><text id="empty-subtitle" x="360" y="286" text-anchor="middle" fill="#bdae93" font-size="13">Only Hotkey 1 gestures are shown. Normal pointer movement is ignored.</text></g>
<g id="path-layer" visibility="hidden"><line id="gap-line" stroke="#fe8019" stroke-width="1.5" stroke-dasharray="6 6" opacity=".65"/><polyline id="trace" points="" fill="none" stroke="#fabd2f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<circle id="start-dot" r="6" fill="#222424" stroke="#b8bb26" stroke-width="2.5"/><circle id="end-dot" r="4.5" fill="#fe8019"/>
<text id="start-label" fill="#b8bb26" font-size="12">Start</text><text id="end-label" fill="#fe8019" font-size="12">End</text></g></svg>
<div class="legend"><span><i class="mark start"></i>Start</span><span><i class="mark end"></i>Current / end</span><span><i class="dash"></i>Gap to start</span></div></div>
<section class="result"><div><div class="eyebrow">Recognition</div><h2 id="result" aria-live="polite">Ready for a gesture</h2><p id="hint">Draw one loop and lift your fingers to finish.</p></div><div class="stats"><div><small>Points</small><span id="points">0</span></div><div><small title="Informational only. A completed looping motion can be recognized before its tail ends.">End gap</small><span id="gap">—</span></div></div></section>
<div class="bottom"><p><kbd>Hotkey 1</kbd> or <kbd>Esc</kbd> cancels.<br>Local viewer · memory only · recognition does not execute an action.</p><button id="clear" type="button">Clear view</button></div>
</main><script>
'use strict';
const $=id=>document.getElementById(id);
let state=null,clearedStroke=null,transport=false;
const phaseLabels={idle:'Waiting',armed:'Armed',drawing:'Drawing',recognized:'Recognized',rejected:'Not recognized',cancelled:'Cancelled'};
const reasonHints={'not enough circular motion':'Make a relaxed loop in one direction; the ends do not need to touch.','motion reverses or doubles back':'Keep moving around in one direction rather than reversing.','too much scribble or jitter':'Try one relaxed looping motion. It does not need to be perfectly round.','open/partial path':'The captured path ends away from its start. The dashed line shows the gap.','trace too short/small':'The recognizer needs a larger movement.','too few distinct points':'Too little movement reached the recognizer.','not sufficiently round':'The captured loop is uneven or stretched.','narrow/straight path':'The path is too narrow to be treated as a circle.','not exactly one complete turn':'The recognizer expects one loop between touching down and lifting.','low circularity/ambiguous shape':'The path does not yet look round enough to the recognizer.'};
function connection(){const live=transport&&state?.connected&&state?.streaming;$('connection').textContent=live?'Live · this computer':transport?(state?.connected?'Waiting for gesture bridge':'Waiting for Hyprland'):'Viewer disconnected';$('connection').classList.toggle('live',!!live)}
function render(s){state=s;connection();const hidden=clearedStroke===s.stroke;const pts=hidden?[]:s.points;const phase=hidden?'idle':s.phase;
$('phase').textContent=phaseLabels[phase]||'Waiting';$('source').textContent=hidden?'View cleared':s.source==='captured'?'Last captured attempt':s.source==='synthetic'?'Synthetic test data':s.source==='live'?'Live gesture':'No gesture yet';
$('clear').disabled=['armed','drawing'].includes(s.phase);$('points').textContent=String(pts.length);
$('empty').setAttribute('visibility',pts.length?'hidden':'visible');$('path-layer').setAttribute('visibility',pts.length?'visible':'hidden');
$('empty-title').textContent=phase==='armed'?'Armed — draw now':hidden?'Ready for the next gesture':'Your gesture will appear here';
$('empty-subtitle').textContent=phase==='armed'?'Move three fingers together, then lift to finish.':'Only Hotkey 1 gestures are shown. Normal pointer movement is ignored.';
let closure=null;
if(pts.length){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);const w=Math.max(hiX-loX,40),h=Math.max(hiY-loY,40),scale=Math.min(600/w,400/h);const cx=(loX+hiX)/2,cy=(loY+hiY)/2;const display=pts.map(([x,y])=>[360+(x-cx)*scale,260+(y-cy)*scale]);$('trace').setAttribute('points',display.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' '));const first=display[0],last=display.at(-1);for(const [id,p] of [['start-dot',first],['end-dot',last]]){$(id).setAttribute('cx',p[0]);$(id).setAttribute('cy',p[1])}for(const [id,p,offset] of [['start-label',first,18],['end-label',last,-13]]){$(id).setAttribute('x',p[0]+10);$(id).setAttribute('y',p[1]+offset)}$('end-label').textContent=phase==='drawing'?'Now':'End';for(const [k,v] of Object.entries({x1:last[0],y1:last[1],x2:first[0],y2:first[1]}))$('gap-line').setAttribute(k,v);const span=Math.max(hiX-loX,hiY-loY);if(span>0&&pts.length>1)closure=Math.hypot(pts.at(-1)[0]-pts[0][0],pts.at(-1)[1]-pts[0][1])/span;}else $('trace').setAttribute('points','');
$('gap').textContent=closure===null?'—':Math.round(closure*100)+'%';
let title='Ready for a gesture',hint='Draw one loop and lift your fingers to finish.';
if(phase==='armed'){title='Listening for three fingers';hint='You have eight seconds. No keyboard key needs to stay held.'}
else if(phase==='drawing'){title='Following your movement';hint='Lift your fingers to see the recognition result.'}
else if(phase==='recognized'){title=s.shape==='circle_cw'?'Clockwise circle':'Counterclockwise circle';hint='Circular motion recognized. Rough ovals, small gaps and extra movement are okay.'}
else if(phase==='rejected'||phase==='cancelled'){title=s.reason||'Gesture cancelled';hint=reasonHints[s.reason]||(phase==='cancelled'?'Tap Hotkey 1 when you are ready to try again.':'The recognizer rejected this path; the drawing above is the actual trace.')}
$('result').textContent=title;$('hint').textContent=hint;}
$('clear').addEventListener('click',()=>{if(state){clearedStroke=state.stroke;render(state)}});
const events=new EventSource('/events');events.onopen=()=>{transport=true;connection()};events.onmessage=e=>{try{render(JSON.parse(e.data))}catch(error){console.error('Invalid viewer state',error)}};events.onerror=()=>{transport=false;connection()};
</script></body></html>'''


def finite(value, limit=1_000_000):
    return type(value) in (int, float) and math.isfinite(value) and abs(value) <= limit


class State:
    def __init__(self):
        self.changed=threading.Condition()
        self.clients=0
        self.client_generation=0
        self.native_stream=None
        self.data={'phase':'idle','points':[],'reason':'','shape':None,'metrics':{},
                   'source':'none','stroke':0,'version':0,'connected':False,'streaming':False}
    def snapshot(self):
        with self.changed:return copy.deepcopy(self.data)
    def apply(self,event,source='live',*,require_subscriber=False):
        if not isinstance(event,dict) or event.get('phase') not in PHASES:return False
        points=event.get('points',[])
        if not isinstance(points,list) or len(points)>512:return False
        if any(not isinstance(p,list) or len(p)!=2 or not all(finite(v) for v in p) for p in points):return False
        reason=event.get('reason','')
        if not isinstance(reason,str) or len(reason)>200:return False
        shape=event.get('shape')
        if shape not in (None,'circle_cw','circle_ccw'):return False
        metrics=event.get('metrics',{})
        if not isinstance(metrics,dict):return False
        metrics={k:v for k,v in metrics.items() if k in {'closure','aspect','length','span','input_points','distinct_points','turns','direction_consistency','circularity','radial_cv'} and finite(v,1_000_000_000_000)}
        append=event.get('append',False);reset=event.get('reset',False)
        if type(append) is not bool or type(reset) is not bool:return False
        with self.changed:
            if require_subscriber and self.clients==0:return False
            stream=event.get('stream');offset=event.get('offset')
            if append:
                if type(stream) is not int or stream<1 or type(offset) is not int or not 0<=offset<=512:return False
                if reset:
                    if offset!=0:return False
                    base=[]
                else:
                    if self.native_stream!=stream or offset!=len(self.data['points']):return False
                    base=self.data['points']
                points=base+points
            if len(points)>512:return False
            if event['phase']=='recognized' and (shape is None or len(points)<2):return False
            self.native_stream=stream if append else None
            phase=event['phase']
            if reset or phase=='armed' or (phase=='drawing' and self.data['phase'] not in ('armed','drawing')) or source=='captured':self.data['stroke']+=1
            self.data.update(phase=phase,points=copy.deepcopy(points),reason=reason,shape=shape,metrics=metrics,source=source)
            self.data['version']+=1;self.changed.notify_all()
        return True
    def link(self,connected,streaming):
        with self.changed:
            if (self.data['connected'],self.data['streaming'])!=(connected,streaming):
                self.data.update(connected=connected,streaming=streaming)
                if not connected and self.data['phase'] in ('armed','drawing'):
                    self.data.update(phase='cancelled',shape=None,reason='Viewer connection interrupted',metrics={})
                self.data['version']+=1;self.changed.notify_all()
    def subscribe(self,delta):
        with self.changed:
            before=self.clients;self.clients=max(0,self.clients+delta)
            if before==0 and self.clients>0:self.client_generation+=1
            if before>0 and self.clients==0:
                self.native_stream=None
                self.data.update(phase='idle',points=[],reason='',shape=None,metrics={},source='none',streaming=False)
                self.data['stroke']+=1;self.data['version']+=1
            self.changed.notify_all()
    def subscribers(self):
        with self.changed:return self.clients
    def subscription_generation(self):
        with self.changed:return self.client_generation


def parse_capture(text):
    if not text.startswith('# relative gesture coordinates') or len(text)>65536:return None
    points=[];metrics={};reason=''
    try:
        for line in text.splitlines():
            if line.startswith('# reason='):reason=line[len('# reason='):]
            elif line.startswith('# ') and '=' in line:
                key,value=line[2:].split('=',1);metrics[key]=float(value)
            elif line and not line.startswith('#'):
                x,y=map(float,line.split(','));points.append([x,y])
        turns=metrics.get('turns',0)
        recognized=(metrics.get('accepted_loop')==1 or reason=='one closed round consistent loop') and finite(turns) and turns!=0
        return {'phase':'recognized' if recognized else 'rejected',
                'points':points,'reason':reason,'metrics':metrics,
                'shape':('circle_cw' if turns>0 else 'circle_ccw') if recognized else None}
    except (ValueError,TypeError):return None


def ipc_event(line,prefix=PREFIX):
    if not line.startswith(prefix):return None
    try:return json.loads(line[len(prefix):])
    except (ValueError,TypeError):return None


class Bridge(threading.Thread):
    def __init__(self,state,path=None,prefix=PREFIX,command=None):
        super().__init__(daemon=True)
        self.state=state;self.stop_event=threading.Event();self.prefix=prefix
        self.path=path or str(Path(os.environ['XDG_RUNTIME_DIR'])/'hypr'/os.environ['HYPRLAND_INSTANCE_SIGNATURE']/'.socket2.sock')
        self.command=command or self.hypr
        self.leased=False
    @staticmethod
    def hypr(code):
        try:return subprocess.check_output(['hyprctl','repl',code],text=True,stderr=subprocess.DEVNULL,timeout=2).strip()
        except (OSError,subprocess.SubprocessError):return ''
    def seed(self):
        data=parse_capture(self.command('local m=package.loaded["hypr.gestures"]; return m and m.shape_capture and m.shape_capture() or ""'))
        if data:self.state.apply(data,source='captured')
    def run(self):
        self.seed()
        while not self.stop_event.is_set():
            try:
                with socket.socket(socket.AF_UNIX) as conn:
                    conn.settimeout(.5);conn.connect(self.path)
                    self.state.link(True,False);buffer=b'';heartbeat=0;leased=False;generation=None
                    while not self.stop_event.is_set():
                        now=time.monotonic()
                        subscribers=self.state.subscribers()>0
                        current_generation=self.state.subscription_generation()
                        if subscribers and (now>=heartbeat or current_generation!=generation):
                            if current_generation!=generation:
                                # Reconnects may have missed chunks. Reset the publisher so
                                # the next update starts from the full current relative path.
                                self.command('local m=package.loaded["hypr.gestures"]; if m and m.viewer_stop then m.viewer_stop() end; return "stopped"')
                                generation=current_generation
                            reply=self.command('local m=package.loaded["hypr.gestures"]; if m and m.viewer_heartbeat then m.viewer_heartbeat(); return "ready" end; return "missing"')
                            leased=reply=='ready';self.leased=leased;self.state.link(True,leased);heartbeat=now+4
                        elif not subscribers and leased:
                            self.command('local m=package.loaded["hypr.gestures"]; if m and m.viewer_stop then m.viewer_stop() end; return "stopped"')
                            leased=False;self.leased=False;heartbeat=0;self.state.link(True,False)
                        try:chunk=conn.recv(65536)
                        except socket.timeout:continue
                        if not chunk:break
                        buffer+=chunk
                        while b'\n' in buffer:
                            line,buffer=buffer.split(b'\n',1)
                            if len(line)>65536:continue
                            event=ipc_event(line.decode('utf-8',errors='replace'),self.prefix)
                            if event is not None:self.state.apply(event,require_subscriber=True)
                        if len(buffer)>65536:buffer=b''
            except OSError:pass
            self.state.link(False,False)
            self.stop_event.wait(1)
        if self.leased:
            self.command('local m=package.loaded["hypr.gestures"]; if m and m.viewer_stop then m.viewer_stop() end; return "stopped"')
        self.state.link(False,False)


def make_server(state,port):
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1'
        def log_message(self,format,*args):pass
        def allowed(self):
            port=cast(tuple[str,int],self.server.server_address)[1]
            hosts={f'127.0.0.1:{port}',f'localhost:{port}'}
            origin=self.headers.get('Origin')
            return self.headers.get('Host') in hosts and (not origin or origin in {'http://'+h for h in hosts}) and self.headers.get('Sec-Fetch-Site')!='cross-site'
        def send(self,code,body,kind):
            self.send_response(code);self.send_header('Content-Type',kind)
            self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers();self.wfile.write(body)
        def do_GET(self):
            if not self.allowed():self.send(403,b'Local viewer only','text/plain');return
            if self.path=='/':self.send(200,PAGE.encode(),'text/html; charset=utf-8')
            elif self.path=='/api/state':self.send(200,json.dumps(state.snapshot(),allow_nan=False).encode(),'application/json')
            elif self.path=='/health':
                data=state.snapshot();self.send(200,json.dumps({'ok':True,'connected':data['connected'],'streaming':data['streaming']}).encode(),'application/json')
            elif self.path=='/events':
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Cache-Control','no-store');self.end_headers()
                state.subscribe(1);version=-1
                try:
                    while True:
                        with state.changed:
                            if state.data['version']==version:state.changed.wait(timeout=4)
                            data=state.snapshot()
                        if data['version']!=version:
                            self.wfile.write(('data: '+json.dumps(data,allow_nan=False)+'\n\n').encode());version=data['version']
                        else:self.wfile.write(b': heartbeat\n\n')
                        self.wfile.flush()
                except (BrokenPipeError,ConnectionResetError,TimeoutError,OSError):pass
                finally:state.subscribe(-1)
            else:self.send(404,b'Not found','text/plain')
        def do_POST(self):self.send(405,b'Read-only viewer','text/plain')
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.daemon_threads=True
    return server


def seed_from(state,url):
    """Transfer the previous viewer's in-memory trace without writing it to disk."""
    parsed=urlsplit(url)
    if parsed.scheme!='http' or parsed.hostname!='127.0.0.1' or not parsed.port or parsed.path not in ('','/') or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('Seed must be an explicit loopback viewer URL')
    connection=HTTPConnection('127.0.0.1',parsed.port,timeout=2)
    try:
        connection.request('GET','/api/state')
        response=connection.getresponse();body=response.read(65537)
        if response.status!=200 or len(body)>65536:raise ValueError('Invalid viewer handoff response')
        event=json.loads(body);source=event.get('source')
        if source not in ('live','captured','synthetic','none') or not state.apply(event,source=source):
            raise ValueError('Invalid viewer handoff state')
    finally:connection.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8797)
    parser.add_argument('--seed-from',help='Previous local viewer URL, for memory-only restarts')
    args=parser.parse_args()
    state=State()
    if args.seed_from:seed_from(state,args.seed_from)
    server=make_server(state,args.port);bridge=Bridge(state);bridge.start()
    address={'pid':os.getpid(),'url':f'http://127.0.0.1:{server.server_address[1]}'}
    ready=Path(os.environ['XDG_RUNTIME_DIR'])/'centerstage-gesture-viewer.json'
    ready.write_text(json.dumps(address)+'\n');ready.chmod(0o600)
    print(json.dumps(address),flush=True)
    def stop(*_):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    try:server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:pass
    finally:
        bridge.stop_event.set();bridge.join(timeout=4);server.server_close()
        try:
            if json.loads(ready.read_text()).get('pid')==os.getpid():ready.unlink()
        except (OSError,ValueError):pass

if __name__=='__main__':main()
