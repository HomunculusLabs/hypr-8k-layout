#!/usr/bin/env python3
"""Connect to a Hyprland event socket before starting the handler."""

import argparse
import os
import socket
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", required=True)
    parser.add_argument("--handler", required=True)
    args = parser.parse_args()

    try:
        event_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        event_socket.connect(args.socket)
        event_socket.set_inheritable(True)
        os.execv(args.handler, [args.handler, "--event-fd", str(event_socket.fileno())])
    except (OSError, ValueError) as error:
        print(f"Could not connect to Hyprland event socket: {error}", file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
