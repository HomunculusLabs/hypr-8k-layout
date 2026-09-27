#!/usr/bin/env python3
"""Read-only acceptance checks for the live keyboard-first keymap."""
import collections
import json
import subprocess

binds = json.loads(subprocess.check_output(['hyprctl', '-j', 'binds'], text=True))
counts = collections.Counter((b['submap'], b['modmask'], b['key'].upper()) for b in binds)
assert all(n == 1 for n in counts.values()), 'Duplicate bindings'
for key in ('TAB', 'W', 'SLASH', 'R', 'H', 'J', 'K', 'L', 'P'):
    assert counts['', 64, key] == 1, f'Missing Super+{key}'
assert counts['', 5, '4'] == 1, 'Screenshot shortcut was lost'
for key in ('W', 'T', 'B', 'L', 'H', 'J', 'K', 'A', 'S', 'ESCAPE', 'RETURN'):
    assert counts['centerstage-adjust', 0, key] == 1, f'Missing adjustment key {key}'
assert not subprocess.check_output(['hyprctl', 'configerrors'], text=True).strip()
print('PASS: live navigation, adjustment mode, screenshot, no duplicates, no config errors')
