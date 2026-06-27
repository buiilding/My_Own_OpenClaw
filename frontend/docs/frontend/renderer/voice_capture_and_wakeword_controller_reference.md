---
summary: "Renderer voice runtime reference for live transcription and wakeword detection: config ownership, AudioWorklet-only capture, IPC/event wiring, and temporary dictation-session behavior."
read_when:
  - When changing renderer voice capture hooks, wakeword controller behavior, or AudioWorklet audio encoding.
  - When debugging missing transcriptions, wakeword retriggers, AudioWorklet capture startup failures, or readiness drift between renderer and main wakeword bridge.
title: "Voice Capture and Wakeword Controller Reference"
---

# Voice Capture and Wakeword Controller Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- `tests/frontend/voice/WakewordDetectionHook.test.ts`

## Two Distinct Voice Pipelines

Renderer runs two independent voice paths:

1. live voice transcription (`useVoiceMode`) for temporary composer dictation sessions
2. passive wakeword detection (`useWakewordDetection`) for skin-configured wakeword activation

They share microphone primitives but have different transport paths:

- transcription path: renderer -> voice app-runtime client -> transcription gateway WebSocket (`<backend>/ws/transcription`)
- wakeword path: renderer -> `DesktopVoiceRuntimeClient` -> Electron
  wakeword bridge -> local-runtime wakeword helper backed by the Python
  wakeword service

Backend ownership detail:

- renderer never chooses the live STT provider
- renderer obtains the gateway URL, socket factory, language payloads, inbound
  normalization, and inbound message dispatch through `DesktopVoiceRuntimeClient`
- backend route `/ws/transcription` owns the app-facing protocol and
  provider-specific translation
- backend provider/model config stays in backend docs and tests; renderer
  references stay limited to gateway contract and display behavior

## Config Ownership and Activation Gates

`AppConfigProvider` owns activation inputs:

- `wakewordEnabled`: persisted wakeword preference from settings UI
- `wakewordSuppressed`: temporary runtime suppression from value-level
  `DesktopVoiceRuntimeClient.onWakewordToggleState(...)` updates
  - seeded from renderer surface on startup: main dashboard starts unsuppressed, overlay views start suppressed
- `wakewordActive = wakewordEnabled && !wakewordSuppressed`: input to `WakewordController`

`WakewordController` only mounts on dashboard startup surfaces.
The onboarding surface does not mount it, which prevents wakeword startup from
requesting microphone capture before first-run permission onboarding reaches the
microphone step. When mounted, it still passes `wakewordEnabled` separately so
the capture hook can distinguish temporary suppression from explicit user
disable when handling missing-device lockout.

## Live Transcription Flow (`useVoiceMode`)

Dashboard composer:

- `MessageInput` starts `useVoiceMode(...)` only while its local microphone session state is true
- clicking the mic button starts or stops that local session
- utterance end stops the session but leaves transcript text in the composer for manual send/edit

Wakeword chat pill:

- `ChatBox` starts `useVoiceMode(...)` only for a wakeword-triggered follow-up dictation session
- final/utterance-end messages stop that temporary session without auto-submit

Shared callbacks:

- `onTranscriptionUpdate(text)`: updates transcription region via `useTranscription`
- `onUtteranceEnd()`: ends the temporary session

Hook lifecycle:

1. enable -> ask `DesktopVoiceRuntimeClient` to open the gateway WebSocket
2. `onopen` -> send `{"type":"set_langs","source_language":"en","target_language":"en"}`
3. `DesktopVoiceRuntimeClient` dispatches `status` messages as a client-id
   value, then the hook stores it
4. `DesktopVoiceRuntimeClient` dispatches `realtime` messages as
   `(text, isFinal)` values, then the hook pushes them to the transcription
   callback
5. `DesktopVoiceRuntimeClient` dispatches `utterance_end`, then the hook calls
   the session-end callback and sends `{"type":"start_over"}`
6. disable/unmount -> stop audio capture + close socket + clear reconnect timers

Voice and wakeword lifecycle trace breadcrumbs go through
`DesktopVoiceDebugTraceRuntime.logVoiceDebugTrace(...)`, which gates
`console.log` output behind the `debug_voice=1` query flag so hook code does
not own debug flag parsing or raw trace emission directly.

While enabled, a current non-closed WebSocket covers both `CONNECTING` and
`OPEN` states. Re-renders must not replace an in-flight connection attempt; the
first socket owns its eventual `onopen`, language payload, close, and reconnect
callbacks.

Gateway endpoint resolution:

- default URL is resolved by `DesktopVoiceRuntimeClient` from the active backend HTTP endpoint
- path is fixed to `/ws/transcription`
- renderer contract stays the same even when backend swaps providers behind that route

Reconnect policy:

- exponential backoff (`1s, 2s, 4s, ...`) with max 5 attempts
- reconnect only if hook still enabled

## Voice Audio Capture and Encoding

`useVoiceMode.startAudioCapture()` setup:

- browser microphone capture through
  `DesktopVoiceAudioInputDeviceRuntime.requestAudioInputStream(...)` with
  mono/16kHz + echo/noise controls
- browser `AudioContext` creation through
  `DesktopVoiceAudioInputDeviceRuntime.createAudioInputContext(...)` at 16kHz
- required `AudioWorkletNode` capture processor (`desktop-runtime-capture-processor`) with chunk size 4096
- construction routed through
  `DesktopVoiceAudioProcessorNodeRuntime.createAudioCaptureProcessorNode(...)`
  so capture hooks do not own AudioWorklet setup or fallback policy
- every capture callback:
  - read Float32 input
  - convert to PCM16 (`DesktopVoiceAudioEncodingRuntime.float32ToPcm16`)
  - frame payload (`DesktopVoiceAudioEncodingRuntime.buildGatewayAudioMessage`)
  - send binary payload through `DesktopVoiceRuntimeClient.sendTranscriptionAudioMessage(...)`

There is no `ScriptProcessorNode` fallback. If the worklet API or module setup
is unavailable, capture startup fails explicitly with an AudioWorklet capture
processor error.

Gateway binary framing (`DesktopVoiceAudioEncodingRuntime.buildGatewayAudioMessage`):

- prefix: 4-byte little-endian metadata length
- metadata body: JSON bytes (`{"sampleRate":16000}`)
- payload body: PCM16 bytes

Cleanup path uses shared helpers:

- disconnect processor/source nodes
- null `processorNodeRef.current.port.onmessage`
- stop media tracks
- close AudioContext

## Transcription Region Behavior

`useTranscription` keeps a tracked insertion range:

- first transcription chunk appends and marks region
- subsequent chunks replace same region (avoids repeated duplication)
- manual typing/paste updates region offsets
- pasted-text extraction from the browser clipboard event is owned by
  `DesktopTranscriptionRegionRuntime.readTextFromPasteEvent(...)`
- send/reset clears region so next utterance starts fresh

This is why partial real-time updates can overwrite earlier draft text but preserve user edits outside region boundaries.

## Wakeword Flow (`useWakewordDetection`)

`WakewordController` callback on detection:

1. `DesktopVoiceRuntimeClient.wakewordDetected()` -> send backend `wakeword-detected` message
2. `DesktopWindowRuntimeClient.showChatboxWithValues(...)` -> reveal chat UI

Hook startup:

1. `useWakewordBridgeEvents` subscribes through `DesktopVoiceRuntimeClient`
   wakeword event helpers. The hook receives detection values through
   `DesktopVoiceRuntimeClient.onWakewordDetectedValues(...)` and wakeword
   readiness through `DesktopVoiceRuntimeClient.onWakewordReadyStatus(...)`, so
   bridge event `model` / `confidence` / `score` and `ready` / `error` payload
   normalization stays in the app runtime facade.
2. send wakeword enable through `DesktopVoiceRuntimeClient` to request service activation/status
3. start microphone capture only when `enabled && isReady`

Wakeword capture path:

- request microphone stream and AudioContext through
  `DesktopVoiceAudioInputDeviceRuntime`
- convert mic frames Float32 -> PCM16
- send ArrayBuffer via `DesktopVoiceRuntimeClient.sendWakewordAudioChunk(...)`
- main process handles the local-runtime wakeword helper transport details

Detection guardrails:

- confidence validated by `DesktopVoiceRuntimeClient` before bridge hooks see a
  detection value
- 2-second cooldown prevents rapid retrigger loops
- threshold compare (`default 0.5`)
- on accepted detection: disable wakeword through `DesktopVoiceRuntimeClient`
  immediately before callback

Chunk-size normalization:

- requested capture chunk size is normalized to nearest supported power-of-two-like value set
- warning logged when normalized value differs

Missing-device guardrails:

- capture startup retry uses `CAPTURE_RETRY_DELAY_MS = 3000`
- missing-mic failures lock capture via `globalThis.__desktopRuntimeWakewordCaptureGuard`
- lock persists across hook remounts
- temporary suppression (`wakewordActive=false` while `wakewordEnabled=true`) keeps lockout active
- lockout clears when wakeword preference is explicitly disabled or when
  `DesktopVoiceAudioInputDeviceRuntime.onAudioInputDeviceChange(...)` observes
  a browser device-change event and the app-runtime audio-device probe detects
  an available `audioinput`
- local capture errors remain sticky across healthy status packets (`localCaptureErrorRef` gate)

## Failure and Drift Hotspots

- repeated wakeword triggers:
  - check cooldown timer updates
  - verify immediate `wakeword-disable` send path
- missing transcriptions:
  - verify gateway WebSocket open state and `isRecording` transition
  - verify an active dictation session or wakeword-triggered STT session is running in the renderer
- no wakeword readiness:
  - inspect `wakeword-status` events reaching renderer and the
    `DesktopVoiceRuntimeClient.onWakewordReadyStatus(...)` value projection
  - verify `wakeword-toggle` suppression is not forcing inactive state
- missing detection callbacks:
  - inspect `wakeword-detected` events reaching renderer and the
    `DesktopVoiceRuntimeClient.onWakewordDetectedValues(...)` value projection
  - verify confidence is a finite number before cooldown/threshold policy runs
- stuck microphone:
  - check cleanup path ran (`stopAudioCapture`) and tracks were stopped

## Cross-Doc References

- Renderer voice deep-dive hub: `docs/frontend/renderer/voice/README.md`
- Renderer voice utils hub: `docs/frontend/renderer/voice/utils/README.md`
- Voice gateway/transcription-region internals: `docs/frontend/renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md`
- Wakeword IPC/cooldown internals: `docs/frontend/renderer/voice/wakeword_detection_ipc_capture_and_cooldown_reference.md`
- Wakeword capture guard utility internals: `docs/frontend/renderer/voice/utils/wakeword_capture_guard_global_lockout_and_device_probe_reference.md`
- Audio encoding/chunk/cleanup utility internals: `docs/frontend/renderer/voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md`
- Transcription-region state-machine internals: `docs/frontend/renderer/voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md`
- Wakeword bridge internals: `docs/frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md`
- Main-process query relay impacts after wakeword activation: `docs/frontend/main/query_payload_and_relay_reference.md`
