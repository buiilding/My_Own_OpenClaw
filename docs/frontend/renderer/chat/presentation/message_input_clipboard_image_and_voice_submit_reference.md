---
summary: "Deep reference for MessageInput runtime: text/voice submit paths, clipboard-image paste parsing/preview, plus/thinking menu behavior, and send-button state guards."
read_when:
  - When changing `MessageInput.jsx` input/submit behavior, pasted image UX, or voice-mode handoff.
  - When debugging why submit is blocked, image preview payload is missing, or utterance-end auto-send differs from form submit.
title: "MessageInput Clipboard Image and Voice Submit Reference"
---

# MessageInput Clipboard Image and Voice Submit Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/utils/messageInput.js`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/MessageInputUtils.test.js`

## Input State Surface

Component-owned state:

- UI menus: `plusMenuOpen`, `thinkingMenuOpen`, `thinkingVisible`, `thinkingMode`
- clipboard preview: `clipboardImage`

Hook-owned text/transcription state (`useTranscription`):

- `inputValue`
- `setInputValue`
- `updateTranscription`
- `resetTranscription`
- `handleInputChange`
- `handlePaste` fallback

## Submit Contract

Submit entry points:

- form submit
- Enter key (without Shift)
- voice utterance-end callback

All submit paths call `submitMessageValue(...)`.

`submitMessageValue(...)` behavior:

1. build outgoing payload through `buildOutgoingMessage(input, isSending, clipboardImage)`.
2. if payload is null, abort.
3. call `onSendMessage(payload)`.
4. clear input/transcription.
5. clear clipboard preview.
6. reset textarea height to auto baseline.

## Clipboard Image Paste Flow

Paste handler logic:

1. inspect `clipboardData.items`.
2. if no `image/*` item -> delegate to `handlePaste`.
3. if image item exists:
 - prevent default paste behavior
 - read file as data URL (`FileReader`)
 - parse data URL into structured payload
 - normalize content type + extension
 - store preview payload in state

Parsed payload shape:

- `base64`
- `contentType`
- `filename` (`clipboard-image.<ext>`)
- `previewUrl` (data URL for in-composer preview)

Preview UI:

- thumbnail image row above composer textarea
- explicit remove button clears `clipboardImage`

## Voice Mode Handoff

`useVoiceMode(...)` callbacks:

- transcription updates call `updateTranscription`
- utterance-end triggers `submitMessageValue(getInputValue())`

Result:

- voice submit path shares same normalization and send guards as keyboard/form submit.

Voice status component:

- rendered only when `voiceModeEnabled=true`
- reflects connection/recording/error state from voice hook

## Button and Guard Semantics

Send button behavior:

- shown only when `isSending=false`
- disabled when `!inputValue.trim()`

Stop button behavior:

- shown when `isSending=true`
- invokes optional `onStopResponse`

Hard send guard:

- if `isSending=true`, `buildOutgoingMessage(...)` returns null.

## Menu Runtime Notes

Plus menu:

- toggles add-on action list (image/create/deep-research/shopping/web/more)
- click outside closes menu

Thinking mode pill:

- closable (`thinkingVisible`)
- mode dropdown currently UI-local (`Thinking`, `Search`, `Reason`)

These menus do not alter outbound query payload today; they are presentation controls pending deeper runtime wiring.

## Test-Backed Invariants

- trimmed send text and whitespace block behavior.
- `isSending` submit block + stop-button rendering.
- voice utterance-end submit with latest transcription value.
- pasted-image preview render.
- pasted-image payload shape passed to `onSendMessage`.
- remove-preview behavior before send.

## Drift Hotspots

1. Changing paste parsing without updating `ArtifactImageUtils` normalization can break content-type/filename contract.
2. Diverging voice submit from form submit path creates inconsistent trim/block behavior.
3. Removing clipboard preview reset after submit can leak stale image payload across messages.
4. Replacing `buildOutgoingMessage` with ad-hoc payload construction can desync sender hook payload union.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Message Send Surface Policy and Screenshot Capture Reference](../message_send_surface_policy_and_screenshot_capture_reference.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../../voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
