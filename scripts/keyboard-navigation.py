#!/usr/bin/env python3
"""Keyboard helpers for the personal Hyprland/Centerstage keymap."""
import argparse
import json
from pathlib import Path
import subprocess

SCRIPTS = Path(__file__).resolve().parent


def move_command(window, direction):
    short = {'left': 'l', 'down': 'd', 'up': 'u', 'right': 'r'}
    if direction not in short:
        raise ValueError('Invalid direction')
    if not window:
        return None
    tags = set(window.get('tags') or [])
    zones = {'centerstage-left', 'centerstage-left-primary', 'centerstage-left-secondary',
             'centerstage-center', 'centerstage-right'}
    if window.get('workspace', {}).get('id') in (1, 2, 3) and tags & zones:
        return [str(SCRIPTS / 'centerstage-swap.sh'), direction]
    return ['hyprctl', 'eval', 'hl.dispatch(hl.dsp.window.move({direction="' + short[direction] + '"}))']


def query(name):
    return json.loads(subprocess.check_output(['hyprctl', '-j', name], text=True))


def window_choices(windows):
    return sorted((w for w in windows if w.get('mapped') and not w.get('hidden')),
                  key=lambda w: w.get('focusHistoryID', -1) if w.get('focusHistoryID', -1) >= 0 else 999999)


def window_label(window):
    text = f"[{window.get('workspace', {}).get('id', '?')}] {window.get('class', '')} — {window.get('title', '')}"
    return ''.join(c if c.isprintable() else ' ' for c in text)


def previous_window(windows, active):
    return next((w for w in window_choices(windows)
                 if w['address'] != active and w.get('focusHistoryID', -1) >= 0), None)


def focus_command(address):
    import re
    if not re.fullmatch(r'0x[0-9a-fA-F]+', address):
        raise ValueError('Invalid window address')
    return ['hyprctl', 'eval', 'hl.dispatch(hl.dsp.focus({window="address:' + address + '"}))']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['move', 'previous', 'windows', 'list-windows'])
    parser.add_argument('direction', nargs='?', choices=['left', 'down', 'up', 'right'])
    args = parser.parse_args()
    command = None
    if args.action == 'move':
        if not args.direction:
            parser.error('move requires a direction')
        command = move_command(query('activewindow'), args.direction)
    else:
        windows = window_choices(query('clients'))
        if args.action == 'list-windows':
            print('\n'.join(window_label(w) for w in windows))
            return
        if args.action == 'previous':
            selected = previous_window(windows, query('activewindow').get('address'))
        else:
            if not windows:
                return
            result = subprocess.run(['rofi', '-dmenu', '-i', '-no-custom', '-format', 'i',
                                     '-p', 'Windows', '-no-markup-rows'],
                                    input='\n'.join(window_label(w) for w in windows),
                                    text=True, capture_output=True)
            if result.returncode != 0:
                return
            try:
                index = int(result.stdout.strip())
                if not 0 <= index < len(windows):
                    return
                selected = windows[index]
            except ValueError:
                return
        if selected and any(w['address'] == selected['address'] for w in query('clients')):
            command = focus_command(selected['address'])
    if command:
        subprocess.run(command, check=True)


if __name__ == '__main__':
    main()
