#!/usr/bin/env python3
"""Interactive recorder for consented Centerstage shape-gesture captures.

Loops the existing one-shot capture API in gestures.lua: for each sample it
requests exactly one armed capture (explicit consent per stroke), waits for you
to tap Hotkey 1 and draw, then offers keep/discard. Kept samples are written to
the corpus directory with a manifest entry; nothing is recorded without the
per-stroke request, and files contain only relative gesture coordinates plus
rejection metrics -- no screen positions, applications, or identifiers.

Usage:
  python3 shape-session.py --expect circle_cw  [--count 20] [--session NAME]
  python3 shape-session.py --expect circle_ccw
  python3 shape-session.py --expect negative   # strokes that must NOT trigger

Negative samples: draw three-finger strokes you never want recognized
(straight swipes, zigzags, scribbles, figure-eights) through the same
Hotkey 1 arm window.

Stdlib only. Interrupt with Ctrl-C at any prompt; kept samples persist.
"""
import argparse
import json
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HYPR = '/home/t3rpz/.config/hypr'
CAPTURE_PREFIX = '# relative gesture coordinates'
STATES = ('disabled', 'waiting for next armed shape', 'capturing armed shape')
EXPECTS = ('circle_cw', 'circle_ccw', 'negative')


def repl(code, timeout=5):
    proc = subprocess.run(['hyprctl', 'repl', code], capture_output=True,
                          text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f'hyprctl repl failed (exit {proc.returncode}): '
                           f'{proc.stderr.strip() or proc.stdout.strip()}')
    return proc.stdout.rstrip('\n')


def gesture(call):
    return repl(f'return require("hypr.gestures").{call}')


def capture_state():
    value = gesture('shape_capture()')
    if value.startswith(CAPTURE_PREFIX):
        return 'captured', value
    if value in STATES:
        return value, None
    raise RuntimeError(f'unexpected shape_capture() value: {value!r}')


def parse_capture(text):
    points = 0
    reason = ''
    for line in text.splitlines():
        if line.startswith('# reason='):
            reason = line[len('# reason='):]
        elif line and not line.startswith('#'):
            points += 1
    return points, reason


def request_capture(retries=5):
    for _ in range(retries):
        if gesture('capture_next_shape()') == 'true':
            return True
        # Refused while a shape is armed/in flight; let it drain.
        time.sleep(1.0)
    return False


def wait_for_capture(timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state, text = capture_state()
        if state == 'captured':
            return text
        time.sleep(0.4)
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--expect', choices=EXPECTS, required=True,
                        help='intended class for every stroke in this session (blind to recognizer output)')
    parser.add_argument('--count', type=int, default=12,
                        help='target number of kept samples (default 12)')
    parser.add_argument('--session', default='',
                        help='session label (default: <expect>-<timestamp>)')
    parser.add_argument('--corpus', type=Path,
                        default=Path(HYPR) / 'shape-corpus',
                        help='corpus directory (default ~/.config/hypr/shape-corpus)')
    parser.add_argument('--timeout', type=float, default=45.0,
                        help='seconds to wait per stroke after arming request (default 45)')
    args = parser.parse_args()

    status = gesture('status()')
    if 'enabled' not in status:
        sys.exit(f'Refusing to start: gesture layer reports {status!r}. '
                 'Re-enable with Super+Ctrl+G.')

    corpus = args.corpus.expanduser()
    corpus.mkdir(parents=True, exist_ok=True)
    manifest = corpus / 'manifest.jsonl'
    session = args.session or f"{args.expect}-{datetime.now().strftime('%Y%m%d-%H%M')}"
    existing = [p for p in corpus.glob(f'{session}-*.txt')]

    direction = {'circle_cw': 'clockwise loop', 'circle_ccw': 'counterclockwise loop',
                 'negative': 'NON-circle stroke (must be rejected)'}[args.expect]
    print(f'Session {session!r} -> {args.expect} ({direction})')
    print(f'Corpus: {corpus}  (new samples continue after {len(existing)} existing)')
    print('Each stroke: I request one armed capture, you tap Hotkey 1, draw, lift.')
    print('Files hold only relative gesture coordinates; delete the directory anytime.\n')

    kept = 0
    number = len(existing)
    try:
        while kept < args.count:
            number += 1
            while (corpus / f'{session}-{number:02d}.txt').exists():
                number += 1
            answer = input(f'[{kept + 1}/{args.count}] Enter to arm next stroke '
                           '(q=quit): ').strip().lower()
            if answer == 'q':
                break
            if not request_capture():
                print('  capture request refused (shape still armed?); retrying next round')
                number -= 1
                continue
            state, _ = capture_state()
            if state != 'waiting for next armed shape':
                print(f'  unexpected pre-arm state: {state!r}; skipping')
                continue
            print('  armed: tap Hotkey 1 and draw now...')
            text = wait_for_capture(args.timeout)
            gesture_clear = 'require("hypr.gestures").clear_shape_capture()'
            subprocess.run(['hyprctl', 'eval', gesture_clear], capture_output=True,
                           text=True, timeout=5)
            if text is None:
                print(f'  no capture within {args.timeout:.0f}s (timed out)')
                number -= 1
                continue
            points, reason = parse_capture(text)
            if points == 0:
                print(f'  capture had no stroke points ({reason}); not kept')
                number -= 1
                continue
            print(f'  captured {points} points; recognizer said: {reason}')
            keep = input('  keep this sample? [K/d/q]: ').strip().lower()
            if keep == 'q':
                break
            if keep == 'd':
                number -= 1
                continue
            name = f'{session}-{number:02d}.txt'
            (corpus / name).write_text(text)
            entry = {'file': name, 'expect': args.expect, 'session': session,
                     'points': points, 'reason': reason,
                     'recorded': datetime.now(timezone.utc).isoformat()}
            with manifest.open('a') as handle:
                handle.write(json.dumps(entry) + '\n')
            kept += 1
            print(f'  kept -> {name}')
    except KeyboardInterrupt:
        print()
    print(f'\nSession done: kept {kept} sample(s) of {args.count} targeted. '
          f'Manifest: {manifest}')


if __name__ == '__main__':
    signal.signal(signal.SIGINT, signal.default_int_handler)
    main()
