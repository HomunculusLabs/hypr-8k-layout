#!/usr/bin/env python3
"""Opt-in native entrance test on an unused background workspace.

Installs the production controller with a unique probe app ID/workspace;
changes only probe geometry, never stops the running Centerstage handler.
"""
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
    spec = importlib.util.spec_from_file_location('live_helpers', ROOT / 'tests/verify-centerstage-live.py')
    assert spec is not None and spec.loader is not None
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    run, query, evaluate = helpers.run, helpers.query, helpers.evaluate
    unique = uuid.uuid4().hex
    app_id = 'centerstage-entrance-probe-' + unique
    tag = 'cs-terminal-opening'
    key = 'centerstage_entrance_probe_' + unique
    before = query()
    focus_before = json.loads(run('hyprctl', '-j', 'activewindow')).get('address')
    occupied = {w['id'] for w in json.loads(run('hyprctl', '-j', 'workspaces'))}
    workspace = next((w for w in range(99, 89, -1) if w not in occupied), None)
    assert workspace is not None, 'no unused workspace'
    autosave = helpers.capture_autosave_state()
    results = {'workspace': workspace}
    installed = False

    def wait(predicate):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            clients = query()
            if predicate(clients):
                return clients
            time.sleep(0.01)
        raise AssertionError('native entrance probe timed out')

    def prop(address, name):
        return json.loads(run('hyprctl', '-j', 'getprop', 'address:' + address, name))[name]

    def launch(label):
        title = app_id + '-' + label
        command = shlex.join(['foot', '--app-id=' + app_id, '--title=' + title, '--window-size-pixels=1000x700'])
        evaluate('hl.exec_cmd(' + json.dumps(command) + ', {workspace=' + json.dumps(str(workspace) + ' silent') + ',no_focus=true})')
        clients = wait(lambda ws: any(w.get('initialTitle') == title for w in ws))
        return next(w for w in clients if w.get('initialTitle') == title)

    try:
        helpers.pause_autosave(autosave)
        options = '{classes={[' + json.dumps(app_id) + ']=true},workspaces={[' + str(workspace) + ']=true}}'
        evaluate('_G[' + json.dumps(key) + ']=assert(loadfile(' + json.dumps(str(ROOT / 'centerstage-terminal-entrance.lua')) + '))().install(hl,' + options + ')')
        installed = True
        terminal = launch('placement')
        address = terminal['address']
        assert tag in terminal['tags'], 'opening hook did not hold the new terminal'
        assert prop(address, 'no_anim') is True, 'initial placement still animates'
        assert prop(address, 'opacity') == 0 and prop(address, 'opacity_inactive') == 0, 'provisional terminal is visible'
        evaluate("local w=hl.get_window('address:" + address + "'); if not w.floating then hl.dispatch(hl.dsp.window.float({action='set',window='address:" + address + "'})) end; "
                 "hl.dispatch(hl.dsp.window.resize({x=800,y=600,relative=false,window='address:" + address + "'})); "
                 "hl.dispatch(hl.dsp.window.move({x=6000,y=200,relative=false,window='address:" + address + "'})); "
                 "hl.dispatch(hl.dsp.window.tag({tag='+centerstage-right',window='address:" + address + "'}))")
        clients = wait(lambda ws: any(w['address'] == address and tag not in w['tags'] for w in ws))
        final = next(w for w in clients if w['address'] == address)
        assert final['at'] == [6000, 200] and final['size'] == [800, 600], final
        assert prop(address, 'no_anim') is False, 'later terminal animations were not restored'
        assert prop(address, 'opacity') > 0 and prop(address, 'opacity_inactive') > 0, 'terminal not revealed'
        results.update(initial_position_invisible=True, initial_move_unanimated=True,
                       revealed_at_destination=True, later_animations_restored=True)
        os.kill(terminal['pid'], signal.SIGTERM)
        wait(lambda ws: not any(w['address'] == address for w in ws))
        fallback = launch('no-assignment')
        fallback_address = fallback['address']
        wait(lambda ws: any(w['address'] == fallback_address and tag not in w['tags'] for w in ws))
        assert prop(fallback_address, 'no_anim') is False and prop(fallback_address, 'opacity') > 0
        results['no_assignment_fails_open'] = True
    finally:
        errors = []
        if installed:
            try:
                evaluate('if _G[' + json.dumps(key) + '] then _G[' + json.dumps(key) + '].stop(); _G[' + json.dumps(key) + ']=nil end')
            except Exception as error:
                errors.append('controller cleanup: ' + str(error))
        try:
            for window in query():
                if window['class'] == app_id:
                    try:
                        os.kill(window['pid'], signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            wait(lambda ws: not any(w['class'] == app_id for w in ws))
        except Exception as error:
            errors.append('window cleanup: ' + str(error))
        errors.extend(helpers.restore_autosave(autosave))
        try:
            after = {w['address']: w for w in query()}
            for window in before:
                current = after.get(window['address'])
                assert current is not None, 'a working window closed during verification'
                changes = {k: {'before': window[k], 'after': current[k]}
                           for k in ('at','size','tags','workspace','floating','fullscreen','pinned') if current[k] != window[k]}
                assert not changes, 'working window changed: ' + json.dumps({'address': window['address'], 'class': window['class'], 'changes': changes})
            assert json.loads(run('hyprctl', '-j', 'activewindow')).get('address') == focus_before, 'focus changed'
            assert not run('hyprctl', 'configerrors'), 'configuration errors'
        except Exception as error:
            errors.append(str(error))
        assert not errors, errors
    results.update(working_windows_unchanged=True, focus_unchanged=True, probes_cleaned=True)
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
