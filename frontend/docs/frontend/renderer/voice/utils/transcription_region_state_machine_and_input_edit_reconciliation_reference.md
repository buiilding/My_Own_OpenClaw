---
summary: "Deep reference for transcription-region edit reconciliation: append-vs-replace state machine, input-change/paste offset updates, and MessageInput composer reset coupling."
read_when:
  - When changing `useTranscription` text replacement behavior or cursor/selection handling.
  - When debugging duplicated transcript fragments, unexpected region invalidation, or pasted-text offset regressions.
title: "Transcription Region State Machine and Input Edit Reconciliation Reference"
---

# Transcription Region State Machine and Input Edit Reconciliation Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`

## Core Model: One Active Region

`TranscriptionRegion` fields:

- `start`
- `end`
- `active`

`createEmptyTranscriptionRegion()` represents inactive mode (`active=false`, `start=end=0`).

Runtime invariant:

- only one active transcription replacement region is tracked at a time
- append, replace, input-change, and paste offset rules are owned by
  `DesktopTranscriptionRegionRuntime`
- pasted-text extraction from `ClipboardEvent.clipboardData` is owned by
  `DesktopTranscriptionRegionRuntime.readTextFromPasteEvent(...)`
- pasted-text caret restoration scheduling is also owned by
  `DesktopTranscriptionRegionRuntime.scheduleCursorRestoreAfterPaste(...)`
- `useTranscription` keeps React state and mutable refs around that
  app-runtime facade.

## Transcript Update State Machine

`useTranscription.updateTranscription(text)` behavior:

1. ignore empty text
2. if region inactive -> append text to end (`DesktopTranscriptionRegionRuntime.appendTranscriptionText`) and activate new range
3. if region active -> replace only prior region (`DesktopTranscriptionRegionRuntime.replaceTranscriptionText`) and update bounds

Effect:

- streaming partial transcripts evolve in-place instead of append-duplicating on every chunk

## User Typing Reconciliation (`handleInputChange`)

On every manual input change:

1. compute `diff = newValue.length - oldValue.length`
2. apply `DesktopTranscriptionRegionRuntime.updateRegionAfterInputChange(...)` rules:
- cursor before region start: shift start/end by `diff`
- cursor after region end: keep region unchanged
- cursor inside region: invalidate region (reset empty)
- missing cursor (`null`): invalidate region

This preserves replacement targeting only when edit happened outside the live transcript segment.

## Paste Reconciliation (`handlePaste`)

`handlePaste` path:

1. reads pasted text through
   `DesktopTranscriptionRegionRuntime.readTextFromPasteEvent(...)`
2. builds next value from selection range (`DesktopTranscriptionRegionRuntime.buildValueAfterPaste`)
3. adjusts region with `DesktopTranscriptionRegionRuntime.updateRegionAfterPaste(...)`:
- replacement before region -> shift start/end by net length delta
- paste after region -> region unchanged
- replacement inside or overlapping region -> invalidate region
- missing cursor -> invalidate region
4. asks `DesktopTranscriptionRegionRuntime.scheduleCursorRestoreAfterPaste(...)`
   to asynchronously restore the caret to the pasted-text end
5. prevents default browser paste

## Mutable Value and Region Refs

`useTranscription` keeps:

- React state `inputValue` for rendering
- `inputValueRef` for stable immediate reads (`getInputValue`)
- `transcriptionRegionRef` for replacement boundaries

This keeps an immediate latest-value mirror available alongside React state for async consumers that need a stable read without waiting for state batching.

## MessageInput Coupling

`useChatComposerDraft` wraps `useTranscription` and exposes:

- `inputValue`
- `updateTranscription`
- `resetTranscription`
- `submitMessageValue`

`MessageInput` wires:

- `useVoiceMode(..., onTranscriptionUpdate, onUtteranceEnd)`
- `onTranscriptionUpdate` -> `updateTranscription(text)`
- `onUtteranceEnd` -> stop the temporary microphone session

After successful send:

- `setInputValue('')`
- `resetTranscription()` (region cleared)

This prevents the next utterance from replacing stale region bounds from previous message.

## Drift Hotspots

1. removing active-region replacement causes duplicated transcript text across realtime updates.
2. failing to invalidate region when editing/pasting inside region causes unexpected overwrite of user-modified text.
3. removing the immediate `inputValueRef` mirror without auditing async consumers can reintroduce stale-value reads outside React render timing.
4. reading `event.clipboardData` directly in `useTranscription` splits browser
   paste mechanics away from the transcription-region runtime.
5. skipping region reset after send can apply next utterance to wrong span in emptied/reused input.

## Related Pages

- [Frontend Renderer Voice Utils Docs Hub](README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Frontend Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
