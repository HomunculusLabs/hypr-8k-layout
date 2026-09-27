#!/usr/bin/env python3
"""Exercise navigation on a temporary window; restore focus and close only the probe."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch

script = Path(__file__).resolve().parents[1] / 'scripts/keyboard-navigation.py'
spec = importlib.util.spec_from_file_location('nav', script)
assert spec and spec.loader
nav = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nav)
run = subprocess.run
original = nav.query('activewindow').get('address')
probe = None
process = None


def evaluate(code):
    result = run(['hyprctl', 'eval', code], text=True, capture_output=True, check=True)
    assert result.stdout.strip() == 'ok', result.stdout + result.stderr


def wait_for(predicate):
    for _ in range(60):
        value = predicate()
        if value:
            return value
        time.sleep(0.1)
    raise AssertionError('Timed out waiting for live compositor state')


try:
    # No state-changing layout tests on a workspace containing user windows.
    assert not any(w['workspace']['id'] == 3 for w in nav.query('clients')), 'Workspace 3 must be empty for probe'
    evaluate('hl.dispatch(hl.dsp.focus({workspace="3"}))')
    process = subprocess.Popen(['foot', '--app-id=keyboard-nav-probe', 'sh', '-c', 'sleep 120'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    probe = wait_for(lambda: next((w for w in nav.query('clients') if w['class'] == 'keyboard-nav-probe'), None))
    address = probe['address']
    def get_probe():
        window = next((w for w in nav.query('clients') if w['address'] == address), None)
        assert window is not None, 'Probe window disappeared'
        return window
    wait_for(lambda: 'centerstage-center' in get_probe()['tags'])
    run(nav.focus_command(address), check=True)
    run(['python3', str(script), 'move', 'right'], check=True, stdout=subprocess.DEVNULL)
    wait_for(lambda: 'centerstage-right' in get_probe()['tags'])
    run(['python3', str(script), 'move', 'left'], check=True, stdout=subprocess.DEVNULL)
    wait_for(lambda: 'centerstage-center' in get_probe()['tags'])
    print('PASS: actual Centerstage center → right → center movement')

    if original:
        run(nav.focus_command(original), check=True)
        run(['python3', str(script), 'previous'], check=True)
        assert nav.query('activewindow')['address'] == address
        run(['python3', str(script), 'previous'], check=True)
        assert nav.query('activewindow')['address'] == original
        print('PASS: previous-window toggle across workspaces')

    # Exercise the real Rofi picker with an exact filter and auto-accept the probe.
    def auto_pick(command, **kwargs):
        if command[0] == 'rofi':
            import threading
            command = command + ['-filter', 'keyboard-nav-probe', '-matching', 'normal']
            kwargs['timeout'] = 15
            def accept_when_ready():
                wait_for(lambda: 'rofi' in str(nav.query('layers')).lower())
                time.sleep(0.3)
                run(['wtype', '-k', 'Return'], check=True)
            worker = threading.Thread(target=accept_when_ready, daemon=True)
            worker.start()
            result = run(command, **kwargs)
            worker.join(timeout=2)
            return result
        return run(command, **kwargs)
    with patch.object(sys, 'argv', [str(script), 'windows']), patch.object(nav.subprocess, 'run', auto_pick):
        nav.main()
    assert nav.query('activewindow')['address'] == address
    print('PASS: real searchable Rofi picker focuses selected window')

    evaluate('hl.dispatch(hl.dsp.submap("centerstage-adjust"))')
    evaluate('assert(hl.get_current_submap() == "centerstage-adjust")')
    evaluate('hl.dispatch(hl.dsp.submap("reset"))')
    evaluate('assert(hl.get_current_submap() == "")')
    print('PASS: adjustment mode enters and resets')

    # Native routing is tested on the probe only, outside managed workspaces.
    evaluate('hl.dispatch(hl.dsp.window.move({workspace="4",follow=true,window="address:' + address + '"}))')
    wait_for(lambda: get_probe()['workspace']['id'] == 4)
    run(nav.focus_command(address), check=True)
    run(['python3', str(script), 'move', 'right'], check=True)
    assert get_probe()['workspace']['id'] == 4
    print('PASS: native movement executes outside Centerstage')
finally:
    evaluate('hl.dispatch(hl.dsp.submap("reset"))')
    if probe:
        evaluate('hl.dispatch(hl.dsp.window.close({window="address:' + probe['address'] + '"}))')
    if process:
        process.wait(timeout=10)
    if original:
        run(nav.focus_command(original), check=True)
    if probe:
        assert not any(w['address'] == probe['address'] for w in nav.query('clients'))
    print('PASS: probe removed, original focus restored')
