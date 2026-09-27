#!/usr/bin/env python3
"""Opt-in compositor-only WoW stand-in. Never launches or sends input to a game."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shlex
import signal
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', required=True)
    parser.parse_args()
    spec = importlib.util.spec_from_file_location('helpers', ROOT / 'tests/verify-centerstage-live.py')
    assert spec is not None and spec.loader is not None
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    run, query, evaluate = helpers.run, helpers.query, helpers.evaluate
    before = query()
    monitor = json.loads(run('hyprctl', '-j', 'monitors'))
    assert len(monitor) == 1 and [monitor[0][k] for k in ('width', 'height', 'scale')] == [7680, 2160, 1]
    active = json.loads(run('hyprctl', '-j', 'activewindow')).get('address')
    occupied = {w['workspace']['id'] for w in before}
    occupied.update(w['id'] for w in json.loads(run('hyprctl', '-j', 'workspaces')))
    workspace = next(w for w in range(99, 89, -1) if w not in occupied)
    title = 'World of Warcraft - CenterstageProbe-' + uuid.uuid4().hex
    app = 'steam_app_4036538709'
    handler_was_active = helpers.active('centerstage-handler.service')
    autosave = helpers.capture_autosave_state()
    results = {'stand_in': 'Wayland foot window, not the game', 'workspace': workspace}

    def owned(w):
        return w.get('initialTitle') == title and w.get('class') == app

    def wait(predicate):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            windows = query()
            if predicate(windows):
                return windows
            time.sleep(0.025)
        raise AssertionError('WoW viewport probe timed out')

    try:
        helpers.pause_autosave(autosave)
        # Automatic placement is covered by the isolated socket replay. Pause it
        # here so a native map-time workspace rule cannot retile working apps.
        if handler_was_active:
            run('systemctl', '--user', 'stop', 'centerstage-handler.service')
        command = shlex.join(['foot', '--app-id=' + app, '--title=' + title, '--window-size-pixels=900x700'])
        evaluate('hl.exec_cmd(' + json.dumps(command) + ", {workspace='" + str(workspace) + " silent',no_focus=true})")
        game = next(w for w in wait(lambda ws: any(owned(w) for w in ws)) if owned(w))
        assert game['floating'] and not game['fullscreen'], game
        assert game['size'] == [2560, 1440], game
        addr = game['address']
        # Address-targeted operations never change the active workspace.
        evaluate("hl.dispatch(hl.dsp.window.move({window='address:" + addr + "',workspace='" + str(workspace) + "',follow=false}))")
        evaluate("hl.dispatch(hl.dsp.window.move({window='address:" + addr + "',x=2560,y=360,relative=false}))")
        settled = next(w for w in wait(lambda ws: any(owned(w) and w['workspace']['id'] == workspace and w['at'] == [2560, 360] for w in ws)) if owned(w))
        original = {k: settled[k] for k in ('at', 'size', 'workspace', 'floating')}
        for cycle in range(3):
            evaluate("hl.dispatch(hl.dsp.window.fullscreen({window='address:" + addr + "',mode='fullscreen'}))")
            full = next(w for w in wait(lambda ws: any(owned(w) and w['fullscreen'] == 2 and w['size'] == [7680, 2160] for w in ws)) if owned(w))
            assert full['at'] == [0, 0]
            evaluate("hl.dispatch(hl.dsp.window.fullscreen({window='address:" + addr + "',mode='fullscreen'}))")
            restored = next(w for w in wait(lambda ws: any(owned(w) and w['fullscreen'] == 0 and w['size'] == original['size'] for w in ws)) if owned(w))
            assert {k: restored[k] for k in original} == original
        results.update(windowed=original, fullscreen=[7680, 2160], fullscreen_round_trips=3)
        assert not run('hyprctl', 'configerrors')
    finally:
        errors = []
        try:
            for w in query():
                if owned(w):
                    try:
                        os.kill(w['pid'], signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            wait(lambda ws: not any(owned(w) for w in ws))
        except Exception as error:
            errors.append(str(error))
        try:
            if handler_was_active:
                run('systemctl', '--user', 'start', 'centerstage-handler.service')
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    pid = run('systemctl', '--user', 'show', 'centerstage-handler.service', '--property=MainPID', '--value')
                    try:
                        if b'--event-fd' in Path('/proc', pid, 'cmdline').read_bytes():
                            break
                    except FileNotFoundError:
                        pass
                    time.sleep(0.025)
                else:
                    raise AssertionError('handler did not subscribe after restoration')
        except Exception as error:
            errors.append('handler restoration: ' + str(error))
        errors.extend(helpers.restore_autosave(autosave))
        try:
            after = {w['address']: w for w in query()}
            for w in before:
                assert w['address'] in after, 'a working window closed during test'
                for key in ('at', 'size', 'workspace', 'floating', 'fullscreen', 'tags'):
                    assert after[w['address']][key] == w[key], 'working window changed: ' + key
            assert json.loads(run('hyprctl', '-j', 'activewindow')).get('address') == active, 'focus changed during test'
        except Exception as error:
            errors.append(str(error))
        assert not errors, errors
    results.update(working_windows_unchanged=True, focus_unchanged=True, cleaned_up=True)
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
