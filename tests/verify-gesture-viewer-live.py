#!/usr/bin/env python3
"""Opt-in end-to-end UI check. Only synthetic native IPC; no window/focus changes."""
import argparse
import importlib.util
import json
import os
import socket
from pathlib import Path
import subprocess
import sys
import threading

ROOT=Path(__file__).resolve().parents[1]

def evaluate(code):
    result=subprocess.check_output(['hyprctl','eval',code],text=True).strip()
    if result!='ok':raise RuntimeError(result)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--live',action='store_true')
    if not parser.parse_args().live:raise SystemExit('Use --live to exercise an isolated native IPC test topic')
    spec=importlib.util.spec_from_file_location('gesture_viewer',ROOT/'scripts/centerstage-gesture-viewer.py')
    assert spec and spec.loader
    v=importlib.util.module_from_spec(spec);sys.modules[spec.name]=v;spec.loader.exec_module(v)
    name='__gesture_viewer_test_'+str(os.getpid());topic='centerstage_gesture_viewer_test_'+str(os.getpid())
    setup=f'''assert({name}==nil); {name}={{}};local t={name};
local Stream=dofile({json.dumps(str(ROOT/'centerstage-gesture-stream.lua'))});
local Mode=dofile({json.dumps(str(ROOT/'centerstage-shape-mode.lua'))});
t.stream=Stream.new(hl,{json.dumps(topic)});
t.mode=Mode.new({{snapshot=function()return {{}}end,same_context=function(a,b)return a~=nil and b~=nil end,enabled=function()return true end,timer=function(fn,opts)return hl.timer(fn,opts)end,notify=function()end,observe=function(...)t.stream:publish(...)end}})'''
    evaluate(setup)
    class SyntheticState(v.State):
        def apply(self,event,source='synthetic',**kwargs):return super().apply(event,source='synthetic',**kwargs)
    def command(code):
        if 'shape_capture' in code:return ''
        if 'viewer_heartbeat' in code:evaluate(f'{name}.stream:renew()');return 'ready'
        if 'viewer_stop' in code:evaluate(f'if {name} then {name}.stream:stop() end');return 'stopped'
        raise AssertionError(code)
    state=SyntheticState();server=v.make_server(state,0)
    # Test-only fault injection. This route is not part of the production server.
    streams=set();streams_lock=threading.Lock()
    handler=server.RequestHandlerClass;original_get=handler.do_GET
    def controlled_get(self):
        if self.path=='/__test_disconnect_events' and self.allowed():
            with streams_lock:connections=list(streams)
            for connection in connections:
                try:connection.shutdown(socket.SHUT_RDWR)
                except OSError:pass
            self.send(200,b'ok','text/plain');return
        if self.path=='/events':
            with streams_lock:streams.add(self.connection)
            try:original_get(self)
            finally:
                with streams_lock:streams.discard(self.connection)
        else:original_get(self)
    handler.do_GET=controlled_get
    bridge=v.Bridge(state,prefix='custom>>'+topic+',',command=command)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    try:
        thread.start();bridge.start()
        env=os.environ.copy()
        if 'PLAYWRIGHT_MODULE' not in env:
            installed=subprocess.check_output(['mise','where','npm:playwright'],text=True).strip()
            env['PLAYWRIGHT_MODULE']=str(Path(installed)/'node_modules/playwright')
        screenshot=Path(os.environ['TMPDIR'])/'gesture-viewer-synthetic-qa.png'
        subprocess.run(['node',str(ROOT/'tests/verify-gesture-viewer-browser.cjs'),
                        f'http://127.0.0.1:{server.server_address[1]}',name,str(screenshot)],check=True,env=env,timeout=60)
        print('Synthetic QA screenshot:',screenshot)
    finally:
        bridge.stop_event.set();bridge.join(timeout=4)
        server.shutdown();server.server_close();thread.join(timeout=3)
        evaluate(f'if {name} then {name}.mode:clear(); {name}.mode:clear_capture(); {name}.stream:stop(); {name}=nil end')
    errors=subprocess.check_output(['hyprctl','configerrors'],text=True).strip()
    assert not errors,errors
    print('PASS: native test resources removed; production viewer state untouched; config clean')

if __name__=='__main__':main()
