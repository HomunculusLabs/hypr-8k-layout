#!/usr/bin/env python3
"""Read-only live check for Mai's transparent compositor surface."""
import argparse
import json
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True, help='PID of the Mai instance to inspect')
    args = parser.parse_args()
    clients = json.loads(subprocess.check_output(['hyprctl', 'clients', '-j'], text=True))
    candidates = [w for w in clients if w['pid'] == args.pid and w['class'] == 'electron'
                  and w['initialTitle'] == 'Bonzi Desktop Companion']
    assert len(candidates) == 1, 'Expected exactly one Mai surface for the supplied PID'
    window = candidates[0]
    expected = {'no_blur': 'true', 'no_shadow': 'true', 'border_size': '0', 'rounding': '0', 'opaque': 'false'}
    actual = {key: subprocess.check_output(['hyprctl', 'getprop', 'address:' + window['address'], key], text=True).strip()
              for key in expected}
    print(json.dumps({'address': window['address'], 'properties': actual, 'at': window['at'],
                      'size': window['size'], 'tags': window['tags'], 'pinned': window['pinned']}, indent=2))
    assert actual == expected, f'Mai still has compositor decoration: {actual}'
    assert window['mapped'] and window['visible'] and not window['hidden'], 'Mai is not visible'
    assert not window['pinned'], 'Mai must remain in Centerstage, not pinned across workspaces'
    assert 'centerstage-left-primary' in window['tags'], 'Mai lost left-column membership'
    print('PASS: transparent Mai surface with left-column membership preserved')


if __name__ == '__main__':
    main()
