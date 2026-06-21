---
summary: "Deep reference for renderer chat shared action selectors and message-input send guards: store selector boundary, composer submit normalization, whitespace/isSending normalization, and clipboard-image payload shaping."
read_when:
  - When changing `useChatCommonActions` or re-wiring chat hooks that mutate `chatStore` state.
  - When debugging dropped message sends, duplicate submit attempts, or microphone/transcription behavior around manual send.
title: "Chat Common Actions Selector Boundary and Message-Input Send Guard Reference"
---

# Chat Common Actions Selector Boundary and Message-Input Send Guard Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatCommonActions.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/DesktopMessageInputRuntime.test.js`
- `tests/frontend/ChatStore.test.ts`

## Selector Boundary Contract (`useChatCommonActions`)

`useChatCommonActions()` returns exactly four store actions:

- `addMessage`
- `updateMessage`
- `setIsSending`
- `setThinkingStatus`

This hook is an adapter-only boundary over `useChatStore`; no extra logic, transforms, or side effects are introduced.

## Ownership Contract Across Hooks

`useChatMessageSender` and `useChatStream` both consume `useChatCommonActions` so write-operations to chat state stay on one shared action surface.

Expected outcome:

- all user-send and stream updates mutate `chatStore` through the same setter functions
- future store action changes can be updated once in `useChatCommonActions` and fan out to both hooks

## Input Normalization Contract (`DesktopMessageInputRuntime`)

`DesktopMessageInputRuntime.buildOutgoingMessage(inputValue, isSending, clipboardImages?, readableFiles?)` behavior:

1. if `isSending === true`, returns `null` (hard submit block)
2. otherwise trims text
3. returns `null` for blank/whitespace-only text
4. normalizes image attachments from the canonical `clipboardImages[]` array
5. normalizes selected files from the canonical `readableFiles[]` array
6. when no valid attachments are present, returns trimmed string
7. when any valid attachment is present, returns object:
 - `{ text: "<trimmed>", clipboardImages: [{ base64, ... }], readableFiles: [...] }`

Clipboard image validity gate:

- payload must be object
- `base64` must be non-empty string
- singular `clipboardImage` is not part of the send contract.

`MessageInput.submitMessageValue(...)` only calls `onSendMessage` when
`DesktopMessageInputRuntime.buildOutgoingMessage(...)` returns non-null.

## MessageInput Voice Boundary

In voice mode, `MessageInput` wires:

- `onTranscriptionUpdate` -> `useTranscription.updateTranscription`
- `onUtteranceEnd` -> end the temporary dictation session

Manual send paths still call `submitMessageValue(...)`, so dictated text uses the same normalization/send-guard path as typed text once the user explicitly sends it.

## Store Setter No-Op Semantics (Dependency)

`chatStore` setter actions used by this path include no-op guards:

- `setIsSending`: no state write when value unchanged
- `setThinkingStatus`: no state write when value unchanged

This limits unnecessary updates when stream/send logic repeats identical flags.

## Test-Backed Matrix

- `tests/frontend/DesktopMessageInputRuntime.test.js`
  - whitespace/blank inputs rejected
  - trim-on-send behavior
  - `isSending` hard block
  - clipboard image payload shape selection
- `tests/frontend/MessageInput.test.jsx`
  - form submit uses trimmed text
  - whitespace submit blocked
  - `isSending` disables submit path/button
  - voice utterance-end keeps the latest transcription in the composer without auto-send
  - pasted image preview/send/remove behavior
- `tests/frontend/ChatStore.test.ts`
  - `setIsSending` and `setThinkingStatus` no-op when unchanged

## Drift Hotspots

1. Adding logic to `useChatCommonActions` can silently fork mutation paths between sender and stream hooks.
2. Bypassing `DesktopMessageInputRuntime.buildOutgoingMessage(...)` in new input surfaces can reintroduce whitespace sends, duplicate send attempts, or clipboard payload shape drift.
3. Reintroducing a separate voice auto-send path would bypass the current composer-first dictation contract and can create inconsistent trim/block behavior.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Message Send Surface Policy and Screenshot Capture Reference](../message_send_surface_policy_and_screenshot_capture_reference.md)
- [Conversation Gate and Active-Turn Filtering Reference](../stream/conversation_gate_and_active_turn_filtering_reference.md)
