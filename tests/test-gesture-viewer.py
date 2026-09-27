#!/usr/bin/env python3
"""Viewer tests use explicit synthetic paths and isolated loopback servers."""
import importlib.util
import json
from pathlib import Path
import sys
import threading
import unittest
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'scripts/centerstage-gesture-viewer.py'

def load():
    assert SCRIPT.is_file(), 'Gesture viewer is not implemented'
    spec=importlib.util.spec_from_file_location('gesture_viewer',SCRIPT)
    assert spec and spec.loader
    m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
    return m

class ViewerTests(unittest.TestCase):
    def test_real_http_page_and_latest_synthetic_stroke(self):
        v=load();state=v.State()
        self.assertTrue(state.apply({'phase':'drawing','points':[[0,0],[20,30]],'reason':''},source='synthetic'))
        server=v.make_server(state,0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            base=f'http://127.0.0.1:{server.server_address[1]}'
            with urlopen(base,timeout=3) as r:page=r.read().decode()
            self.assertIn('id="trace"',page)
            self.assertIn('EventSource',page)
            with urlopen(base+'/api/state',timeout=3) as r:actual=json.load(r)
            self.assertEqual(actual['points'],[[0,0],[20,30]])
            self.assertEqual(actual['phase'],'drawing')
            self.assertEqual(actual['source'],'synthetic')
        finally:server.shutdown();server.server_close();thread.join(timeout=3)

    def test_invalid_payloads_and_unrelated_ipc_are_ignored(self):
        v=load();s=v.State()
        for event in [[],{'phase':'drawing','points':[[float('nan'),0]]},
                      {'phase':'drawing','points':[[True,0]]},
                      {'phase':'drawing','points':[[0,0]]*513},
                      {'phase':'recognized','points':[[0,0]],'shape':None}]:
            self.assertFalse(s.apply(event))
        self.assertEqual(s.snapshot()['points'],[])
        self.assertIsNone(v.ipc_event('activewindow>>private-title'))
        self.assertIsNone(v.ipc_event(v.PREFIX+'bad JSON'))
    def test_capture_parser_preserves_relative_points_and_reason(self):
        v=load()
        data=v.parse_capture('# relative gesture coordinates; no screen position or application data\n# reason=open/partial path\n# closure=0.4\n0,0\n12,-3\n')
        self.assertEqual(data['points'],[[0,0],[12,-3]])
        self.assertEqual(data['reason'],'open/partial path')
        self.assertEqual(data['metrics']['closure'],.4)
        self.assertIsNone(v.parse_capture('waiting for next armed shape'))
    def test_cross_origin_and_wrong_host_are_denied(self):
        from urllib.request import Request
        from urllib.error import HTTPError
        v=load();server=v.make_server(v.State(),0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            url=f'http://127.0.0.1:{server.server_address[1]}/api/state'
            for headers in [{'Origin':'https://example.com'},{'Host':'evil.invalid'},{'Sec-Fetch-Site':'cross-site'}]:
                with self.assertRaises(HTTPError) as err:urlopen(Request(url,headers=headers),timeout=3)
                self.assertEqual(err.exception.code,403)
                err.exception.close()
        finally:server.shutdown();server.server_close();thread.join(timeout=3)

    def test_chunked_native_paths_reassemble_and_reject_gaps(self):
        v=load();s=v.State()
        self.assertTrue(s.apply({'phase':'armed','stream':7,'append':True,'reset':True,'offset':0,'points':[]}))
        self.assertTrue(s.apply({'phase':'drawing','stream':7,'append':True,'offset':0,'points':[[0,0],[1,2]]}))
        self.assertTrue(s.apply({'phase':'drawing','stream':7,'append':True,'offset':2,'points':[[2,3]]}))
        self.assertEqual(s.snapshot()['points'],[[0,0],[1,2],[2,3]])
        self.assertFalse(s.apply({'phase':'drawing','stream':7,'append':True,'offset':9,'points':[[4,5]]}))
        self.assertFalse(s.apply({'phase':'drawing','stream':8,'append':True,'offset':3,'points':[[4,5]]}))
        self.assertTrue(s.apply({'phase':'recognized','stream':7,'append':True,'offset':3,'points':[],'shape':'circle_cw'}))
        self.assertEqual(s.snapshot()['points'],[[0,0],[1,2],[2,3]])
        self.assertEqual(s.snapshot()['phase'],'recognized')

    def test_restart_handoff_keeps_only_valid_loopback_state(self):
        v=load();old=v.State();old.apply({'phase':'rejected','points':[[0,0],[12,3]],'reason':'open/partial path'},source='synthetic')
        server=v.make_server(old,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            new=v.State();v.seed_from(new,f'http://127.0.0.1:{server.server_address[1]}')
            self.assertEqual(new.snapshot()['points'],old.snapshot()['points'])
            self.assertEqual(new.snapshot()['source'],'synthetic')
            with self.assertRaises(ValueError):v.seed_from(new,'https://example.com')
        finally:server.shutdown();server.server_close();thread.join(timeout=3)

    def test_last_viewer_disconnect_erases_trace_and_reconnect_gets_new_epoch(self):
        v=load();s=v.State();s.subscribe(1)
        s.apply({'phase':'drawing','points':[[0,0],[10,20]],'reason':''},source='synthetic')
        s.subscribe(-1)
        self.assertEqual(s.snapshot()['points'],[])
        self.assertEqual(s.snapshot()['phase'],'idle')
        self.assertEqual(s.snapshot()['source'],'none')
        self.assertFalse(s.apply({'phase':'armed','points':[]},require_subscriber=True))
        s.subscribe(1)
        self.assertEqual(s.subscription_generation(),2)
    def test_native_disconnect_marks_an_unfinished_path_cancelled(self):
        v=load();s=v.State();s.subscribe(1);s.link(True,True)
        s.apply({'phase':'drawing','points':[[0,0],[10,20]],'reason':''},source='synthetic')
        s.link(False,False)
        self.assertEqual(s.snapshot()['phase'],'cancelled')
        self.assertIn('interrupted',s.snapshot()['reason'])

    def test_unsubscribed_bridge_shutdown_does_not_stop_another_viewer(self):
        v=load();commands=[]
        bridge=v.Bridge(v.State(),path='/not-used',command=lambda code:commands.append(code) or '')
        bridge.stop_event.set();bridge.run()
        self.assertFalse(any('viewer_stop' in code for code in commands))

    def test_comfort_capture_preserves_recognition_without_exact_closure(self):
        v=load()
        sample='# relative gesture coordinates\n# reason=circular motion recognized\n# accepted_loop=1\n# turns=-0.81\n# closure=0.6\n0,0\n10,5\n20,-3\n'
        data=v.parse_capture(sample)
        self.assertEqual(data['phase'],'recognized')
        self.assertEqual(data['shape'],'circle_ccw')
        self.assertEqual(data['metrics']['closure'],.6)

if __name__=='__main__':unittest.main()
