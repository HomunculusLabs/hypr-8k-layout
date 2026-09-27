# Centerstage gesture viewer

Open http://127.0.0.1:8797 while the local server is running.

Tap Kinesis Hotkey 1, draw with three fingers, and lift. The viewer shows the native relative path as it arrives, green start and orange current/end markers, a dashed gap back to the start, point count, and the actual recognition/cancellation reason. Hotkey 1 again or Escape cancels the shape. Existing navigation and Hotkey 2 remain unchanged. This UI does not execute shape actions or reinterpret the classifier's result.

## Run

If the server is not already running:

    python3 /home/t3rpz/.config/hypr/scripts/centerstage-gesture-viewer.py --port 8797

Leave that process running and open the URL. Ctrl+C stops a foreground server. This tool is not enabled at login. `--port 0` selects a free port and prints its URL. The current process/URL, without trace data, is recorded at `$XDG_RUNTIME_DIR/centerstage-gesture-viewer.json`.

## Data and safety

- HTTP binds only to 127.0.0.1, rejects foreign Host/Origin headers, and has no desktop-command endpoints.
- Only explicitly armed shape gestures produce coordinates. Ordinary scrolling, typing, pointer movement, app titles and screen coordinates are not collected.
- Data is held in memory, bounded to 512 points. The final viewer connection closing erases the backend trace/result. “Clear view” hides the current display; it is not an on-disk deletion operation.
- A native 15-second observation lease is refreshed while a viewer is connected. Reconnection resets offsets; an interrupted stroke is marked cancelled, not silently treated as complete.
- The last explicitly captured diagnostic attempt may seed the first view. `--seed-from http://127.0.0.1:PORT` transfers a previous local viewer's in-memory state during a deliberate restart; it never writes the trace to disk.
- Classifier thresholds were not loosened for the UI. A displayed rejection is a real result, not proof that a human circle is impossible or that the input driver failed.

## Implementation

`centerstage-shape-mode.lua` emits observation callbacks only during the armed shape workflow. `centerstage-gesture-stream.lua` serializes bounded new-point chunks through the native `hl.dsp.event` dispatcher. Every event stays within Hyprland 0.56.2's 1024-byte socket2 data cap, including the topic prefix. Terminal metadata is bounded and the entire outgoing batch is preflighted before emission.

The Python server immediately discards unrelated socket2 events, checks stream IDs/offsets, assembles the trace in memory and sends browser updates over SSE. No subprocess is launched for each movement update. The embedded HTML/SVG/JavaScript needs no network fonts, CDN, framework or build step.

## Verification

    cd /home/t3rpz/.config/hypr
    bash tests/run-centerstage-gesture-checks.sh
    bash tests/run-centerstage-checks.sh
    python3 tests/verify-gesture-viewer-live.py --live

The opt-in live UI check uses a separate native IPC topic and explicit synthetic data, without touching windows, focus, keyboard mappings or the user's viewer state. It exercises armed/drawing/rejected/recognized/cancelled rendering, live point updates, clear, actual SSE disconnect/reconnect, narrow layout, and browser errors. Playwright must be installed; the verifier discovers the local mise installation or accepts `PLAYWRIGHT_MODULE`.

The real user's previously captured path was also rendered and visually inspected separately. Native IPC truncation was reproduced and fixed with bounded chunks; disconnect retention and oversized final-result cases are covered by regression tests. An independent read-only review approved the scoped fixes. Full HTTP and browser checks were run outside its read-only sandbox.

Design audit: Monitor surface, one dominant plot, compact real-data status. Warm neutrals follow the existing desktop; Liberation Sans and JetBrains Mono follow locally installed fonts. No decorative feature cards, gradients, fake statistics or unneeded animation. No compositional issues were found in desktop and narrow-layout checks.
