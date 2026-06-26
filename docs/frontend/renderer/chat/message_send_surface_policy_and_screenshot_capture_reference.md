---
summary: "Deep reference for chat send-path runtime: sender-surface UI policy, clipboard/file attachment normalization, SDK turn resource handles, SDK screenshot/read_file resolution, SDK display rows, and send-failure behavior."
read_when:
  - When changing `useChatMessageSender`, screenshot/clipboard/file attachment behavior, or sender-surface return-to-chatbox policy.
  - When debugging missing screenshot refs, hidden attachment context, send failures, or mismatch between SDK user rows and backend query payloads.
title: "Message Send Surface Policy and Screenshot Capture Reference"
---

# Message Send Surface Policy and Screenshot Capture Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatSendStateRuntime.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/runtime/TurnInputPipeline.ts`
- `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- `frontend/src/renderer/app/runtime/desktopMessageSendUiRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatPillSessionRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopConversationSessionRuntime.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js`
- `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/MessageInput.test.jsx`

## Sender Surface Ownership

`useChatMessageSender` is now the React adapter for chat-store actions,
playback cleanup, app config, and sender options. It delegates preparation and
final live-turn dispatch to `DesktopChatSendPreparationRuntime`, which returns a
`PreparedDesktopChatTurn` before calling the backend-facing live-turn runtime.
The hook reads send-history inputs through
`getChatSendReadModelFromChatStore()` in `chatStoreAdapters.ts` instead of the
full `selectChatInterfaceState(...)` UI selector or raw top-level
`chatStore.messages` / `chatStore.conversationView`, so send preparation sees
only a boolean first-user-message predicate and React chat hooks do not call
`useChatStore.getState()` directly for send-only raw state.
`DesktopChatSendPreparationRuntime.prepareDesktopChatSend(...)` accepts that
state through one `getSendReadModel` dependency rather than split
message/view callbacks.
Retry and edit/resend replay actions also adapt their continuity-prepared
turns into this same dispatch shape, with transcript recording disabled because
continuity preparation has already rewritten the replay projection.

`useChatMessageSender` accepts:

- `senderSurface`: `main-window` or `overlay-chatbox`
- optional `returnToChatboxPolicy`

Surface consequences:

- `main-window` hard-disables return-to-chatbox behavior.
- screenshot capture gate is `senderSurface !== "main-window" && include_query_screenshot`.
- overlay sender may call `show-chatbox { focus:false }` when policy resolves true.
- overlay `ChatBox` exposes that gate as the camera toggle in the minimal pill; the button only flips `include_query_screenshot` and does not capture immediately.

`DesktopChatPillSessionRuntime.resolveChatPillSendLifecycle(...)` owns the
sender-surface lifecycle projection and keeps the raw chat-pill send/view
helpers private behind the renderer app-runtime facade.

`DesktopMessageSendUiRuntime.resolveMessageSendUiBehavior(...)` owns the
main-window versus overlay-chatbox return-to-chatbox policy. The raw resolver
stays private behind the renderer app-runtime facade.

## Outgoing Payload Contract

`sendMessage(payload)` accepts:

- plain string
- object `{ text, clipboardImages?, readableFiles? }`

Normalized shape:

- `text`: required
- `clipboardImages[]`: accepted only when each image has non-empty `base64`
- `readableFiles[]`: accepted only when each file has non-empty absolute-ish `filePath` + `filename`
- singular `clipboardImage` rejects the object payload; all image attachments must use the canonical `clipboardImages[]` array.

Invalid object payloads are ignored (no send side effect).

`DesktopChatSendPayloadRuntime.normalizeOutgoingPayload(...)` owns renderer
payload shape normalization. The renderer does not project attachment filenames
for normal sends; filenames travel only as fields on typed SDK resources and are
resolved into visible metadata by SDK resource handling.

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

- sends object payload so renderer can submit typed SDK turn resources without
  reading files, capturing screenshots, or uploading artifacts before the SDK
  turn exists.

## Send Pipeline Order

`sendMessage(...)` flow:

1. normalize payload.
2. optional `stopPlayback()`.
3. resolve/create conversation ref immediately from renderer state.
   - resolution order is deterministic:
     - transcript session ref
     - chat store active conversation ref
     - generated new ref (only when all three are missing)
   - snapshot projection into transcript/chat state is centralized in `desktopConversationSessionRuntime.ts`
   - send preparation uses `resolveRendererConversationSessionSnapshot(...)`; it
     no longer awaits a main-process session snapshot before composing the local
     pending row.
4. accept the pending turn locally and send `windie:pending-turn` so Electron
   main can broadcast/replay the pending user row across renderer windows.
   The pending bridge carries identity, text, and timestamp only; SDK display
   projection owns visible filename/image/screenshot attachment states and
   preview/ready artifact descriptors. Renderer `UserMessage` display consumes
   typed SDK `attachments[]` only and does not render filename metadata as a
   separate attachment fallback. `DesktopPendingTurnBridgeRuntime` owns
   pending-turn payload construction for normal sends, and the renderer-local
   pending user row is projected only from that normalized payload shape.
   Normal sends preserve any existing `ConversationView` in chat-store state
   and store only `pendingTurn` for the short pre-SDK handoff. Presentation
   projects that bridge beside no-view history or SDK display rows until the
   next SDK view arrives; accepting the pending turn does not append a
   renderer-composed row into raw workspace `messages`. The bridge only fills
   an absent user row; once the SDK display row for that turn exists, the SDK
   row is authoritative and renderer attachment state is not copied forward.
   Replay sends intentionally clear the old view when publishing replacement
   rows so stale suffix rows do not remain visible while SDK edit/retry commands
   complete.
5. run send-surface window policy only (optional return-to-chatbox behavior).
6. build typed SDK turn resources:
   - `clipboard_image` for pasted/selected images
   - `readable_file` for selected non-image files
   - `query_screenshot_request` when overlay/config policy asks for a query screenshot
   - `workspace` when the conversation has a workspace binding
   Renderer resources do not assign `displayAttachmentId`; SDK turn processing
   assigns stable display attachment ids before producing live visual
   attachment projection state.
7. call `DesktopLiveTurnRuntimeClient.sendQuery` with text, conversation ref,
   turn ref, and typed resources. Normal sends do not build a renderer-owned
   filename payload or metadata object for filenames.
8. Electron main preserves `resources` for SDK `send()` while keeping them out
   of the backend query allowlist; SDK resource resolution owns user-row
   metadata updates.
9. SDK `ConversationRuntime.send()` emits `turn_started` and base
   `user_message` before resource resolution.
10. SDK resource resolvers read files, upload clipboard images, capture query
   screenshots, merge user-row metadata, and assemble backend-compatible
   `screenshot_ref`, `screenshot_refs`, `attachment_context`,
   `attachment_filenames`, `capture_meta`, and `workspace_path` fields.
11. SDK memory/context enrichment appends hidden context to model-facing content
    before backend transport.

Steps 1-6 produce a `PreparedDesktopChatTurn`. The final dispatch helper applies
deferred model selection and sends the prepared SDK turn input through
`DesktopLiveTurnRuntimeClient.sendQuery`. If dispatch fails before SDK turn
authority opens, the helper clears the short pending bridge from chat store and
main-process pending-turn state using the prepared turn identity; React sender
hooks do not inspect `PreparedDesktopChatTurn` refs for failure cleanup.
Replay-prepared turns may still pass stored screenshot refs as legacy resolved
payload because replay reuses durable transcript metadata rather than composer
resources.

`DesktopChatSendStateRuntime.hasPriorUserMessages(...)` owns the
first-user-message predicate used by the send read-model selector. When a SDK
`ConversationView.displayRows` snapshot exists, the predicate reads user rows
from that view instead of treating `chatStore.messages` as competing durable
history; `chatStore.messages` remains only the no-view historical fallback, and
pending-send identity travels separately as `pendingTurn`.
`DesktopChatSendPreparationRuntime` receives only the resolved boolean, not the
view rows or raw messages.

Send lifecycle chat-pill traces go through `DesktopRendererTraceRuntime`.
`DesktopChatSendPreparationRuntime` reports send-start,
screenshot-decision, and query-dispatched values through
`logRendererChatSendLifecycleTrace(...)`; the trace runtime owns
`turn_id`, `include_query_screenshot`, and chat-pill trace payload field names.

Readable file injection path:

- for each `readableFiles[]` item, renderer submits a required `readable_file`
  resource.
- SDK default resource resolvers invoke the local-runtime `read_file` tool.
- successful `output` values are concatenated into hidden attachment context.
- failed or empty required readable-file results emit a SDK turn error after
  the base user row is visible.
- context is appended into backend-bound composed query content by SDK context
  enrichment.
- raw `read_file` content is never rendered in user-visible chat row.

Assistant and tool transcript projection writes from stream ingestion route
through `chatStreamTranscriptPersistence.ts`, keeping projection calls behind
focused chat-feature helpers instead of the live-turn facade.

## Screenshot Source and Fallback Chain

Priority order:

1. clipboard image resource(s) from `MessageInput`
2. `query_screenshot_request` resource resolved by SDK host capabilities
3. no screenshot

Clipboard path specifics:

- renderer forwards `base64`, `contentType`, and `filename` as
  `clipboard_image` resources.
- SDK resolver uploads artifacts and emits `screenshot_ref` /
  `screenshot_refs` for backend compatibility.
- upload filename prefers per-image clipboard-provided filename.

Capture path specifics:

- SDK host resolver executes the local `screenshot` tool under the existing
  Electron screenshot lifecycle lease.
- `isFirstUserMessage` is carried on the `query_screenshot_request` resource.
- capture response may contain:
  - inline `screenshot` base64
  - `screenshotRef`/`screenshotUrl` artifact attachment only (no base64)
- SDK upload/materialization treats either shape as valid screenshot context and
  keeps user-row metadata stable.
- first-message decisions use `ConversationView.displayRows` whenever a view
  object exists; direct app-runtime callers do not fall back to raw
  chat-store messages under a partial view shape.

## SDK User Row Contract

SDK base user row includes:

- `text`
- live visual attachment placeholders from typed SDK resources when applicable

SDK `user_message_metadata` patches later add resolved screenshot refs,
attachment filenames, capture metadata, or resource failures. Final backend
query payload sends `screenshot_ref` + optional `screenshot_refs` (artifact ids
only), not raw screenshot bytes.

## Failure and Recovery Semantics

Non-fatal failures (send still continues):

- `show-chatbox` invoke failure
- optional query screenshot resource failure

Fatal failure:

- required readable-file resource failure
- required clipboard-image upload failure
- `DesktopLiveTurnRuntimeClient.sendQuery` throw
- sender clears the matching renderer `pendingTurn`
- visible failure display arrives through the SDK/main `turn_error`
  conversation event path; the sender does not append a renderer-local error
  row
- error rethrown

## Test-Backed Invariants

`ChatMessageSender.test.tsx` verifies:

- sender-surface policy behavior (main-window vs overlay)
- first-message screenshot resource flag behavior
- screenshot resource skip for main-window sends
- no renderer capture/read/upload before SDK send
- no renderer-owned pending visual attachment state before SDK projection
- clipboard payload flow (base64 + content type + filename) becomes SDK resources

`MessageInput.test.jsx` verifies:

- trimmed send text
- whitespace/no-send guards
- voice utterance-end keeps dictated text in the composer until manual send
- pasted image preview lifecycle + payload shape + remove action
- file-picker trigger and selected readable-file payload shape

## Drift Hotspots

1. Changing payload union type without updating `MessageInput` + tests can silently drop clipboard images.
2. Moving resource resolution back before SDK `send()` can delay base user-row emission and reintroduce send flicker.
3. Dropping `resources`/`metadata` in Electron main query filtering means SDK never sees attachments.
4. Changing upload filename/content-type normalization can desync artifact extension/type behavior.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Chat Attachment Change Workflow](chat_attachment_change_workflow.md)
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Chat Stream Store Adapter Boundary and Message-Input Send Guard Reference](presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
