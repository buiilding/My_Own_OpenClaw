---
summary: "Deep reference for Electron-main wakeword helper runtime split: stderr status parsing, wakeword-status emission, startup/process error mapping, and audio chunk normalization contracts."
read_when:
  - When changing wakeword bridge startup/error handling, stderr readiness parsing, or audio chunk normalization behavior.
  - When debugging wakeword readiness drift, noisy stderr log spam, or malformed renderer audio payload types.
title: "Wakeword Bridge Runtime Helper Reference"
---

# Wakeword Bridge Runtime Helper Reference

## Canonical Modules

- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `tests/frontend/WakewordBridgeRuntime.test.cjs`

## Runtime Split

`wakeword_bridge.cjs` owns subprocess lifecycle and buffered binary frame ingestion,
including the `64 KiB` maximum detection-result frame guard for subprocess stdout.

`wakeword_bridge_runtime.cjs` owns focused helper primitives used by that bridge:

- `emitWakewordStatus(mainWindow, payload)`
- `handleWakewordStderrLine(...)`
- `resolveWakewordStartErrorMessage(...)`
- `resolveWakewordProcessErrorMessage(...)`
- `normalizeAudioChunk(audioData)`

This split keeps bridge orchestration code smaller while preserving deterministic wakeword status/error behavior.

## Helper Contracts

### `emitWakewordStatus(mainWindow, payload)`

- single helper for `wakeword-status` renderer emission
- sends via `mainWindow.webContents.send('wakeword-status', payload)` only when the target `BrowserWindow` and its `webContents` are present and not destroyed
- returns `false` without sending when the renderer target was torn down before a late subprocess status/exit event arrives

### `handleWakewordStderrLine(...)`

Inputs:

- raw stderr line
- main window reference
- ready-state getter/setter callbacks
- optional logger overrides (`log`, `error`)

Behavior:

- trims input and ignores empty lines
- suppresses known noisy GPU/OpenCL stderr lines:
  - contains `terminator_CreateInstance`
  - contains `Failed to CreateInstance in ICD`
- when line looks like JSON object:
  - parses `{"status":"ready"}` and:
    - sets readiness true only once
    - emits `wakeword-status { ready: true }`
  - parses `{"status":"error","message":"..."}` and:
    - marks the active supervisor process not-ready/error without clearing the
      process reference
    - emits `wakeword-status { ready: false, error: <message> }`
- for non-JSON lines:
  - logs informational wakeword traces from generic markers (`[Python]`,
    `DETECTED`) plus host-skin markers such as the WindieOS wakeword model id
  - logs error-like lines through error logger

### `resolveWakewordStartErrorMessage(...)`

- returns packaged-specific guidance when Python launch target is missing:
  - packaged: bundled runtime reinstall message
  - dev/non-packaged: install/PATH guidance
- otherwise returns `null`

### `resolveWakewordProcessErrorMessage(...)`

- maps process startup `ENOENT` to missing Python executable guidance
- falls back to raw process error message for non-`ENOENT` failures

### `normalizeAudioChunk(audioData)`

Accepted input forms:

- base64 string
- Node `Buffer`
- `ArrayBuffer`

Returns:

- normalized `Buffer` for supported types
- `null` for unsupported payload shapes

## Test-Backed Invariants

`tests/frontend/WakewordBridgeRuntime.test.cjs` locks:

- packaged vs dev startup error message mapping
- `normalizeAudioChunk` payload conversion behavior and invalid-type rejection
- ready-status stderr JSON promotion into `wakeword-status { ready: true }`
- error-status stderr JSON promotion into `wakeword-status { ready: false }`
  and supervisor audio-gating
- `ENOENT` process error mapping by launch-target kind (`binary` vs `python`)

## Drift Hotspots

1. Duplicating direct `wakeword-status` sends outside `emitWakewordStatus(...)` can fragment readiness/error semantics.
2. Removing noisy-line suppression can flood logs and obscure real wakeword startup errors.
3. Changing status JSON keys without bridge updates can leave readiness stuck false while service is actually ready.
4. Expanding accepted audio payload types without explicit normalization tests can create silent malformed chunk forwarding.

## Related Pages

- [Electron Main and IPC](electron_main_and_ipc.md)
- [Wakeword Bridge and Audio Framing Reference](../sidecar/wakeword_bridge_and_audio_framing_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](../sidecar/services/wakeword_service_model_bootstrap_and_binary_framing_reference.md)
