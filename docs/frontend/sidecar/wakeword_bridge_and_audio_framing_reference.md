---
summary: "Wakeword runtime reference across renderer capture hooks and Electron wakeword bridge: subprocess lifecycle, binary audio framing, enable/disable buffering policy, and detection event fan-out."
read_when:
  - When changing wakeword subprocess startup, audio chunk transport, or detection event handling.
  - When debugging false retriggers, readiness status drift, or missing wakeword-detected events.
title: "Wakeword Bridge and Audio Framing Reference"
---

# Wakeword Bridge and Audio Framing Reference

## Canonical Modules

- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`

## Runtime Split

`wakeword_bridge.cjs` owns subprocess lifecycle, binary frame buffering, and IPC handler wiring.
`initializeWakewordBridge(...)` accepts an optional `ipcMain`-compatible host
adapter and defaults to Electron `ipcMain`, keeping channel registration host
composed while preserving the same wakeword wire channels.
The production Electron path passes `ipcMain` from `index.cjs` through
`main_window_runtime.cjs` into this bridge.

`wakeword_bridge_runtime.cjs` owns focused helper primitives:

- stderr-line status parsing/log filtering (`handleWakewordStderrLine`)
- ready/error event emission helper (`emitWakewordStatus`)
- startup/process error message mapping (`resolveWakewordStartErrorMessage`, `resolveWakewordProcessErrorMessage`)
- audio input normalization (`normalizeAudioChunk`)

## Process Lifecycle (Main Process)

Bridge entrypoint:

- `initializeWakewordBridge(mainWindow, onWakewordDetected, options?)`

Startup path (lazy):

1. bridge registers IPC handlers during `initializeWakewordBridge(...)`
2. renderer sends `wakeword-enable` when wakeword is actually enabled
3. bridge resolves Python executable + `wakeword_service.py` and spawns subprocess
4. bridge parses readiness/error status messages from stderr JSON lines
5. bridge parses detection payload stream from stdout (length-prefixed JSON frames)

Startup failure mapping nuance:

- packaged builds with missing bundled runtime emit deterministic reinstall guidance
- dev/non-packaged runs with missing Python emit explicit PATH/install guidance

Ready state signal:

- bridge emits `wakeword-status { ready: true|false, error? }` to renderer
- late status and detection events are dropped if the target `BrowserWindow` or
  `webContents` has already been destroyed

Failure behavior:

- process `exit`/`error` clears buffers and ready state
- emits status with explicit error message where available
- stderr parser suppresses known noisy GPU/OpenCL lines to avoid readiness/error drift from non-actionable logs

## IPC Surface

Renderer -> main channels:

- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

Main -> renderer channels:

- `wakeword-status`
- `wakeword-detected`

Main forwards `wakeword-detected` payload with:

- `model`
- `confidence`
- `score`

## Audio Transport Framing

### Renderer capture (`useWakewordDetection`)

- acquires microphone stream
- converts Float32 PCM to Int16
- sends chunk buffers via `wakeword-audio-chunk`

### Main bridge input framing to Python

For each audio chunk:

1. write 4-byte little-endian length prefix
2. write raw audio bytes

Chunk input types accepted by bridge:

- base64 string
- Node `Buffer`
- `ArrayBuffer`

Invalid payload types are rejected with logging.

## Detection Output Framing (Python -> Main)

Main keeps `resultBuffer` and parses stream as:

1. read 4-byte little-endian message length
2. reject lengths above `64 KiB`, log the protocol error, and clear the buffer
3. wait until full payload bytes are available
4. parse JSON payload
5. if detected and enabled, emit callbacks/events and clear buffer

This buffering avoids partial-frame parse failures when stdout chunks split messages.
The maximum frame size bounds Electron main memory retained for malformed or
compromised wakeword subprocess output.

## Enable/Disable Policy and Retrigger Prevention

State flag:

- `isWakewordEnabled`

Behavior:

- disabled state ignores incoming detection frames
- disable path clears result buffer
- disable path sends reset frame to Python (`length=0` only)
- enable path restarts service if absent, otherwise re-emits ready status when already ready

Renderer hook guardrails (`useWakewordDetection`):

- 2s cooldown window between accepted detections
- immediate `wakeword-disable` send after accepted detection to avoid buffered retriggers
- threshold check (`confidence >= threshold`) before callback invocation
- while wakeword is disabled, hook ignores bridge status errors to avoid disabled-mode noise
- local microphone capture failures are tracked separately from bridge readiness errors so healthy `wakeword-status` heartbeats do not clear local capture failures
- capture restart attempts are throttled (`3s`) after local start failures (for example `NotFoundError` missing input device) to avoid rapid retry loops and log spam

## Renderer Voice Stack Interaction

`useWakewordDetection` and `useVoiceMode` are independent pipelines:

- wakeword pipeline: local detection bridge + binary audio stream to wakeword subprocess
- voice mode pipeline: websocket connection to backend-owned `/ws/transcription`, which then proxies to Nova-Voice or translates to OpenAI Realtime

Both can coexist, but they use different transport channels and runtime services.

## Debug Checklist

If wakeword never becomes ready:

1. verify resolved Python/script paths are valid
2. inspect stderr JSON status lines for startup/import errors
3. verify bridge emits `wakeword-status` to renderer after spawn

If detections fire repeatedly:

1. verify `wakeword-disable` is sent immediately after accepted detection
2. verify bridge `isWakewordEnabled` false path is active
3. verify result buffer is cleared on disable and after detection emit

If audio chunks appear ignored:

1. verify bridge has `isPythonReady=true`
2. verify renderer chunk conversion produces non-empty Int16 payloads
3. verify chunk payload type is one of string/Buffer/ArrayBuffer

## Related Pages

- [Local-Runtime Services Docs Hub](services/README.md)
- [Wakeword Bridge Runtime Helper Reference](../main/wakeword_bridge_runtime_helper_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](services/wakeword_service_model_bootstrap_and_binary_framing_reference.md)
- [Frontend Renderer Wakeword Detection IPC Capture and Cooldown Reference](../renderer/voice/wakeword_detection_ipc_capture_and_cooldown_reference.md)
