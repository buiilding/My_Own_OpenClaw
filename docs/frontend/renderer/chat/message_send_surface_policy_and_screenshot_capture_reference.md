---
summary: "Deep reference for chat send-path runtime: sender-surface UI policy, clipboard/file attachment normalization, screenshot capture/upload fallback chain, hidden read_file context injection, optimistic message updates, and send-failure behavior."
read_when:
  - When changing `useChatMessageSender`, screenshot/clipboard/file attachment behavior, or sender-surface return-to-chatbox policy.
  - When debugging missing screenshot refs, hidden attachment context, send failures, or mismatch between optimistic user rows and backend query payloads.
title: "Message Send Surface Policy and Screenshot Capture Reference"
---

# Message Send Surface Policy and Screenshot Capture Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderPayloads.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/queryScreenshotPipeline.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/readableFileAttachmentContext.ts`
- `frontend/src/renderer/features/chat/policies/messageSendUiPolicy.ts`
- `frontend/src/renderer/features/chat/session/conversationSessionRuntime.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/utils/message/messageInput.js`
- `frontend/src/renderer/features/chat/utils/fileAttachmentUtils.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline.ts`
- `frontend/src/renderer/infrastructure/services/SystemStateCapture.ts`
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
- overlay `ChatBox` exposes that gate as the camera toggle in the minimal pill; the button only flips `include_query_screenshot` and does not capture immediately.

## Outgoing Payload Contract

`sendMessage(payload)` accepts:

- plain string
- object `{ text, clipboardImages?, clipboardImage?, readableFiles? }`

Normalized shape:

- `text`: required
- `clipboardImages[]`: accepted only when each image has non-empty `base64`
- `readableFiles[]`: accepted only when each file has non-empty absolute-ish `filePath` + `filename`
- legacy `clipboardImage` is still accepted and normalized into `clipboardImages[]`

Invalid object payloads are ignored (no send side effect).

`clipboardImages[]` metadata fields:

- `base64`
- optional `contentType`
- optional `filename`

## MessageInput -> Sender Coupling

`MessageInput` supports paste + picker path:

1. intercept paste for clipboard `image/*` item
2. parse image to `{ base64, contentType, filename, previewUrl }`
3. `+ -> Add photos & files` opens native file picker
4. picker image files become preview cards (`clipboardImages[]`)
5. picker non-image files become `readableFiles[]`
6. submit payload includes text + image previews + readable file descriptors

When attachment(s) exist:

- sends object payload so sender can upload image artifacts and inject non-image file context without showing file content in UI.

## Send Pipeline Order

`sendMessage(...)` flow:

1. normalize payload.
2. optional `stopPlayback()`.
3. resolve/create conversation ref.
   - resolution order is deterministic:
     - transcript session ref
     - chat store active conversation ref
     - main-process session snapshot (`get-client-user-id`) conversation ref
     - generated new ref (only when all three are missing)
   - snapshot projection into transcript/chat state is centralized in `conversationSessionRuntime.ts`
4. append optimistic user message to store.
5. set `isSending=true`, clear thinking status.
6. optional overlay return-to-chatbox invoke.
7. resolve screenshot source:
  - clipboard image base64 list first
  - else OS screenshot capture path (if enabled for surface/config)
8. materialize screenshot attachment(s) through `ScreenshotAttachmentPipeline`.
   - clipboard images become inline attachments first
   - auto-capture can return inline `screenshot` or pre-materialized `screenshot_ref` / `screenshot_url`
   - artifact upload and inline fallback normalization happen in one place
9. select primary screenshot attachment:
  - prefer first entry with `screenshotRef`
  - fallback to artifact URL-derived ref when only `screenshotUrl` exists
  - dedupe final `screenshot_refs[]` for backend send
10. update optimistic message with `screenshotRef/screenshotUrl` plus `screenshots[]`.
11. write transcript user row (`recordUserMessage`) with conversation ref + primary screenshot ref.
12. send backend query (`ApiClient.sendQuery`) with:
  - `screenshot_ref` (first ref, compatibility path)
  - `screenshot_refs` (all uploaded refs for multi-image queries)
  - optional `attachment_context` (hidden read_file output for selected non-image files)
  - optional `attachment_filenames` (visible filename chips for optimistic/local echo user rows)

Readable file injection path:

- for each `readableFiles[]` item, sender executes sidecar `read_file` via `execute-tool`.
- successful `llm_content` outputs are concatenated into hidden attachment context.
- context is appended into backend-bound composed query content by main process.
- raw `read_file` content is never rendered in user-visible chat row.

## Screenshot Source and Fallback Chain

Priority order:

1. clipboard image payload(s) from `MessageInput`
2. `captureScreenshotAttachment(...)` capture path
3. no screenshot

Clipboard path specifics:

- `screenshot` + `screenshotContentType` still mirror the first image for compatibility.
- `screenshots[]` stores all pasted image payloads (inline + uploaded refs).
- upload filename prefers per-image clipboard-provided filename.

Capture path specifics:

- capture call: `captureScreenshotAttachment({ waitSeconds: 0, isFirstUserMessage })`
- `isFirstUserMessage` derived before insertion from existing chat store.
- capture response may contain:
  - inline `screenshot` base64
  - `screenshotRef`/`screenshotUrl` artifact attachment only (no base64)
- send path treats either shape as valid screenshot context and keeps user-row attachment rendering stable.

## Optimistic Message Contract

Optimistic user row includes:

- `text`
- `timestamp`
- optional `attachmentFilenames[]` for picker/clipboard filenames
- optional first-image `screenshot` and `screenshotContentType`
- optional `screenshots[]` for multi-image attachments
- later patched `screenshotRef` and `screenshotUrl` after upload

Final backend query payload sends `screenshot_ref` + optional `screenshot_refs` (artifact ids only), not raw screenshot bytes.

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
- auto-capture artifact-only (`screenshotRef`/`screenshotUrl`) path without upload roundtrip
- clipboard payload flow (base64 + content type + filename) bypasses OS capture

`MessageInput.test.jsx` verifies:

- trimmed send text
- whitespace/no-send guards
- voice utterance-end keeps dictated text in the composer until manual send
- pasted image preview lifecycle + payload shape + remove action
- file-picker trigger and selected readable-file payload shape

## Drift Hotspots

1. Changing payload union type without updating `MessageInput` + tests can silently drop clipboard images.
2. Reordering optimistic write versus capture/upload steps can break first-message capture semantics.
3. Removing `screenshotContentType` from chat store without updating renderer consumers breaks attachment rendering assumptions.
4. Changing upload filename/content-type normalization can desync artifact extension/type behavior.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Chat Common Actions Selector Boundary and Message-Input Send Guard Reference](presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
