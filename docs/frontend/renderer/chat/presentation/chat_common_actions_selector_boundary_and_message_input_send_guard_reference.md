---
summary: "Deep reference for renderer chat stream store-adapter boundaries and message-input send guards: composer submit normalization, whitespace/loop-lock normalization, and clipboard-image payload shaping."
read_when:
  - When re-wiring chat hooks that mutate `chatStore` state.
  - When debugging dropped message sends, duplicate submit attempts, or microphone/transcription behavior around manual send.
title: "Chat Stream Store Adapter Boundary and Message-Input Send Guard Reference"
---

# Chat Stream Store Adapter Boundary and Message-Input Send Guard Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/DesktopMessageInputRuntime.test.js`
- `tests/frontend/ChatStore.test.ts`

## Stream Store Adapter Boundary

`useChatStream.ts` imports only the store adapters needed to process legacy
stream events:

- `updateStreamTargetMessageInChatStore`
- `setIsSendingInChatStore`
- `setThinkingStatusInChatStore`
- `setThinkingSourceEventTypeInChatStore`
- `setCompactionDebugInfoInChatStore`
- `updateStreamTrackingInChatStore`

There is no shared `useChatCommonActions` hook. Sender and replay hooks do not
consume generic chat-store action bags, because those paths now hand durable
send/replay behavior to SDK-owned commands and projections.

## Ownership Contract Across Hooks

`useChatMessageSender` prepares typed outgoing input, manages the small
pending-send bridge, and calls SDK-backed IPC/runtime clients. It must not
append renderer-owned failure, pending, or replay rows to `chatStore`.

`useChatStream` remains the compatibility event handler for stream events that
still update workspace fields or raw legacy messages. It imports the specific
store adapters it needs instead of hiding those writes behind a shared
frontend action selector.

Expected outcome:

- send/replay hooks do not regain generic `addMessage` access
- stream writes are explicit at the stream boundary
- future stream-store adapter changes are reviewed where legacy stream events
  are handled

## Input Normalization Contract (`DesktopMessageInputRuntime`)

`DesktopMessageInputRuntime.buildOutgoingMessage(inputValue, isSubmitBlocked, clipboardImages?, readableFiles?)` behavior:

1. if `isSubmitBlocked === true`, returns `null` (hard submit block)
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
  - submit-block hard guard
  - clipboard image payload shape selection
- `tests/frontend/MessageInput.test.jsx`
  - form submit uses trimmed text
  - whitespace submit blocked
  - visible lifecycle `isLoopActive` disables submit path/button and renders Stop
  - voice utterance-end keeps the latest transcription in the composer without auto-send
  - pasted image preview/send/remove behavior
- `tests/frontend/ChatStore.test.ts`
  - `setIsSending` and `setThinkingStatus` no-op when unchanged

## Drift Hotspots

1. Reintroducing a shared `useChatCommonActions` hook can silently give send or replay paths access to renderer-owned row mutation again.
2. Bypassing `DesktopMessageInputRuntime.buildOutgoingMessage(...)` in new input surfaces can reintroduce whitespace sends, duplicate send attempts, or clipboard payload shape drift.
3. Reintroducing a separate voice auto-send path would bypass the current composer-first dictation contract and can create inconsistent trim/block behavior.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Message Send Surface Policy and Screenshot Capture Reference](../message_send_surface_policy_and_screenshot_capture_reference.md)
- [Conversation Gate and Active-Turn Filtering Reference](../stream/conversation_gate_and_active_turn_filtering_reference.md)
