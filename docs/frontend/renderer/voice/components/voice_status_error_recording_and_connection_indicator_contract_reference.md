---
summary: "Deep reference for VoiceStatus rendering: error-priority banner, recording-state active indicator, connection text switch, and null render contract when voice inactive."
read_when:
  - When changing `VoiceStatus` conditional rendering order or displayed status text.
  - When debugging voice mode UI states emitted through `MessageInput` + `useVoiceMode` hook outputs.
title: "Voice Status Error, Recording, and Connection Indicator Contract Reference"
---

# Voice Status Error, Recording, and Connection Indicator Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `tests/frontend/MessageInput.test.jsx`

## Render Priority Contract

`VoiceStatus({ error, isRecording, isConnected })` applies strict priority order:

1. if `error` truthy -> render error banner
2. else if `isRecording` true -> render active recording banner
3. else -> render `null`

Consequence:

- error state suppresses recording-state banner even when recording flag is true.

## Error Banner Contract

Error path output:

- root class: `voice-status voice-status--error`
- text prefix: `Voice Mode Error:`
- appends raw `error` string

This path is synchronous and purely presentational.

## Recording Banner Contract

Recording path output:

- root class: `voice-status voice-status--active`
- icon span with `🎤`
- status suffix chosen by connection state:
  - `isConnected=true` -> `Listening...`
  - `isConnected=false` -> `Connecting...`

This reflects websocket readiness from `useVoiceMode` state.

## Integration Boundary (`MessageInput`)

`MessageInput` mounts `VoiceStatus` only when `voiceModeEnabled` prop is true.

Passed props come directly from `useVoiceMode(...)` return values:

- `error`
- `isRecording`
- `isConnected`

Contract implication:

- VoiceStatus never owns voice connection logic; it renders given state only.

## Test-Backed Coverage

Current test coverage is indirect:

- `tests/frontend/MessageInput.test.jsx` verifies voice mode wiring paths and utterance-end submission behavior.

Coverage gap:

- no direct `VoiceStatus` component test currently asserts class/text render matrix for error vs recording vs hidden states.

## Drift Hotspots

1. Reordering conditions can leak recording banner during error states.
2. Changing class names without CSS sync can silently degrade visible status styling.
3. Altering connection text literals can desync UX copy expected in voice troubleshooting flows.

## Related Pages

- [Renderer Voice Components Docs Hub](README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Voice Capture and Wakeword Controller Reference](../../voice_capture_and_wakeword_controller_reference.md)
