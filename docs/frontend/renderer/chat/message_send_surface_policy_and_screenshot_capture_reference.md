---
summary: "Deep reference for chat send-path runtime: sender-surface UI policy, clipboard-image payload normalization, screenshot capture/upload fallback chain, optimistic message updates, and send-failure behavior."
read_when:
  - When changing `useChatMessageSender`, screenshot/clipboard attachment behavior, or sender-surface return-to-chatbox policy.
  - When debugging missing screenshot refs, send failures, or mismatch between optimistic user rows and backend query payloads.
title: "Message Send Surface Policy and Screenshot Capture Reference"
---

# Message Send Surface Policy and Screenshot Capture Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/utils/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/policies/messageSendUiPolicy.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/utils/messageInput.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/infrastructure/services/SystemCapture.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/MessageInput.test.jsx`

## Sender Surface Ownership

`useChatMessageSender` accepts:

- `senderSurface`: `main-window` or `overlay-chatbox`
- optional `returnToChatboxPolicy`

Surface consequences:

- `main-window` hard-disables return-to-chatbox behavior.
- screenshot capture gate is `senderSurface !== "main-window" && include_query_screenshot`.
- overlay sender may call `show-chatbox { focus:false }` when policy resolves true.

## Outgoing Payload Contract

`sendMessage(payload)` accepts:

- plain string
- object `{ text, clipboardImage? }`

Normalized shape:

- `text`: required
- `clipboardImage`: accepted only if `base64` non-empty string

Invalid object payloads are ignored (no send side effect).

`clipboardImage` metadata fields:

- `base64`
- optional `contentType`
- optional `filename`

## MessageInput -> Sender Coupling

`MessageInput` supports pasted-image path:

1. intercept paste
2. detect clipboard `image/*` item
3. read file as data URL
4. parse to `{ base64, contentType, filename, previewUrl }`
5. pass as `clipboardImage` with trimmed text on submit

When no pasted image exists:

- sends plain trimmed string.

When pasted image exists:

- sends object payload so sender can skip screenshot capture and upload clipboard image directly.

## Send Pipeline Order

`sendMessage(...)` flow:

1. normalize payload.
2. optional `stopPlayback()`.
3. resolve/create conversation ref.
4. append optimistic user message to store.
5. set `isSending=true`, clear thinking status.
6. optional overlay return-to-chatbox invoke.
7. resolve screenshot source:
  - clipboard image base64 first
  - else OS screenshot capture path (if enabled for surface/config)
8. upload artifact when screenshot exists.
9. update optimistic message with `screenshotRef/screenshotUrl`.
10. write transcript user row (`recordUserMessage`) with conversation ref + screenshot ref.
11. send backend query (`ApiClient.sendQuery`).

## Screenshot Source and Fallback Chain

Priority order:

1. clipboard image payload from `MessageInput`
2. `extractOSstate(...)` capture path
3. no screenshot

Clipboard path specifics:

- `screenshot` field in optimistic message stores raw base64 string.
- `screenshotContentType` in optimistic message stores normalized MIME type.
- upload filename prefers clipboard-provided filename.

Capture path specifics:

- capture call: `extractOSstate(true, false, 0, isFirstUserMessage)`
- `isFirstUserMessage` derived before insertion from existing chat store.

## Optimistic Message Contract

Optimistic user row includes:

- `text`
- `timestamp`
- optional `screenshot` (base64 for clipboard path)
- optional `screenshotContentType`
- later patched `screenshotRef` and `screenshotUrl` after upload

Final backend query payload only sends screenshot ref/url, not raw screenshot bytes.

## Failure and Recovery Semantics

Non-fatal failures (send still continues):

- `show-chatbox` invoke failure
- screenshot capture failure
- artifact upload failure

Fatal failure:

- `ApiClient.sendQuery` throw
- sender sets `isSending=false`
- appends assistant error message (`Failed to send message. Please try again.`)
- error rethrown

## Test-Backed Invariants

`ChatMessageSender.test.tsx` verifies:

- sender-surface policy behavior (main-window vs overlay)
- first-message capture flag behavior
- screenshot skip for main-window sends
- continued send on capture/upload failures
- upload refs included in query payload and store row
- clipboard payload flow (base64 + content type + filename) bypasses OS capture

`MessageInput.test.jsx` verifies:

- trimmed send text
- whitespace/no-send guards
- voice utterance-end submit path
- pasted image preview lifecycle + payload shape + remove action

## Drift Hotspots

1. Changing payload union type without updating `MessageInput` + tests can silently drop clipboard images.
2. Reordering optimistic write versus capture/upload steps can break first-message capture semantics.
3. Removing `screenshotContentType` from chat store without updating renderer consumers breaks attachment rendering assumptions.
4. Changing upload filename/content-type normalization can desync artifact extension/type behavior.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Chat Common Actions Selector Boundary and Message-Input Send Guard Reference](presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
