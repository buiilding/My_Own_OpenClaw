---
summary: "Deep reference for voice status banner style states: base/info/error color contracts and iconography classes aligned with active-session, recording, connection, and error props."
read_when:
  - When changing renderer voice status text/status logic or banner CSS classes.
  - When debugging mismatch between voice runtime state and visible status color/icon treatment.
title: "Voice Status Visual State Style Contract Reference"
---

# Voice Status Visual State Style Contract Reference

This page documents:

- `frontend/src/renderer/styles/VoiceStatus.css`
- `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`

## Class-State Coupling Contract

`VoiceStatus.jsx` emits class states:

- base: `.voice-status`
- error: `.voice-status.voice-status--error`
- active recording: `.voice-status.voice-status--active` plus optional `.voice-status-icon`

Rendering gates:

- returns `null` when no active session and no error exists
- error state takes precedence over active-session/recording/connection state

## Visual Behavior

Base state:

- compact inline banner with subtle border and muted text
- spacing and border-radius tuned for embedding in chat/voice control zones

Error variant:

- red-tinted background/border/text (`voice-status--error`)
- intended for gateway/IPC/microphone failure messaging

Active variant:

- accent-tinted background/border/text (`voice-status--active`)
- combined with icon + dynamic text (`Listening...` or `Connecting...`)

## Integration Guarantees

- Voice status styles rely on shared theme tokens (`--border`, `--text-muted`)
- component keeps content plain (no nested buttons), so CSS assumes non-interactive status surface

## Related Docs

- [Frontend Renderer Styles Docs Hub](README.md)
- [Renderer Voice Components Docs Hub](../voice/components/README.md)
- [Voice Status Error, Recording, and Connection Indicator Contract Reference](../voice/components/voice_status_error_recording_and_connection_indicator_contract_reference.md)
