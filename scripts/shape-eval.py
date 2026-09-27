#!/usr/bin/env python3
"""Evaluate the shape recognizer against recorded corpus samples.

Replays every manifest-referenced capture through the spike recognizer (via
shape-corpus-harness.lua) and compares the result with the recorded intent.

  python3 shape-eval.py                 # summary + misclassified details
  python3 shape-eval.py --all           # also list every correct sample
  python3 shape-eval.py --metrics turns # per-class metric distribution

Output is a confusion matrix over {circle_cw, circle_ccw, rejected} versus
expected {circle_cw, circle_ccw, negative}, plus per-sample reasons for every
disagreement. Use --metrics to inspect a recognizer metric across classes when
tuning thresholds; metrics come from the recognizer, not from this script.
"""
import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
HARNESS = HERE / 'shape-corpus-harness.lua'
CORPUS = HERE.parent / 'shape-corpus'
CLASSES = ('circle_cw', 'circle_ccw', 'rejected')
EXPECTS = ('circle_cw', 'circle_ccw', 'negative')


def replay(path):
    proc = subprocess.run(['lua', str(HARNESS), str(path)],
                          capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        detail = proc.stderr.strip().splitlines()[-1] if proc.stderr else 'harness failed'
        return {'shape': 'error', 'score': 0, 'reason': detail}
    result = {}
    for line in proc.stdout.splitlines():
        key, sep, value = line.partition('=')
        if not sep:
            continue
        if key.startswith('m.'):
            result.setdefault('metrics', {})[key[2:]] = float(value)
        else:
            result[key] = value
    return result


def agrees(expect, got):
    if expect == 'negative':
        return got == 'rejected'
    return got == expect


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--corpus', type=Path, default=CORPUS)
    parser.add_argument('--all', action='store_true', help='list correct samples too')
    parser.add_argument('--metrics', metavar='KEY', default='',
                        help='show per-class distribution of recognizer metric KEY (e.g. turns)')
    args = parser.parse_args()

    manifest = args.corpus / 'manifest.jsonl'
    if not manifest.exists():
        sys.exit(f'No manifest at {manifest}. Record a session first:\n'
                 f'  python3 {HERE / "shape-session.py"} --expect circle_cw')
    entries = []
    for line in manifest.read_text().splitlines():
        entry = json.loads(line)
        entry['path'] = args.corpus / entry['file']
        entries.append(entry)

    confusion = defaultdict(lambda: defaultdict(int))
    wrong, samples = [], []
    for entry in entries:
        if not entry['path'].exists():
            print(f'warning: missing capture file {entry["path"]}', file=sys.stderr)
            continue
        result = replay(entry['path'])
        got = result.get('shape', 'error')
        confusion[entry['expect']][got] += 1
        outcome = 'ok' if agrees(entry['expect'], got) else 'WRONG'
        sample = {**entry, 'got': got, 'outcome': outcome,
                  'score': float(result.get('score', 0)),
                  'got_reason': result.get('reason', ''),
                  'metrics': result.get('metrics', {})}
        samples.append(sample)
        if outcome == 'WRONG':
            wrong.append(sample)

    width = max(map(len, EXPECTS))
    print(f'{"expected":<{width}} | ' + ' | '.join(f'{c:<11}' for c in CLASSES))
    print('-' * (width + 3 + 14 * len(CLASSES)))
    for expect in EXPECTS:
        print(f'{expect:<{width}} | ' + ' | '.join(
            f'{confusion[expect][c]:<11}' for c in CLASSES))
    total = len(samples)
    correct = total - len(wrong)
    if total:
        print(f'\n{correct}/{total} samples agree with recorded intent '
              f'({100 * correct / total:.0f}%)')
    else:
        print('\nno samples')

    for sample in wrong:
        print(f'WRONG {sample["file"]}: expect={sample["expect"]} got={sample["got"]} '
              f'({sample["got_reason"]}); recorded reason: {sample["reason"]}')
    if args.all:
        for sample in samples:
            if sample['outcome'] == 'ok':
                print(f'ok    {sample["file"]}: expect={sample["expect"]} got={sample["got"]}')

    if args.metrics:
        key = args.metrics
        buckets = defaultdict(list)
        for sample in samples:
            value = sample['metrics'].get(key)
            if value is not None:
                buckets[sample['expect']].append(value)
        print(f'\nmetric {key} by expected class:')
        for expect in EXPECTS:
            values = sorted(buckets[expect])
            if values:
                print(f'  {expect:<10} n={len(values):<3} min={values[0]:.3f} '
                      f'median={median(values):.3f} max={values[-1]:.3f}')
            else:
                print(f'  {expect:<10} n=0')


if __name__ == '__main__':
    main()
