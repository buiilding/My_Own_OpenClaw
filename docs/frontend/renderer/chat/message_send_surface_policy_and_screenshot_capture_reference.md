---
summary: "Deep reference for chat send-path runtime: surface-aware return-to-chatbox policy, screenshot capture/upload gating, optimistic message insertion, transcript write ordering, and query-send failure behavior."
read_when:
  - When changing `useChatMessageSender`, message send policy resolution, or screenshot artifact attachment fields.
  - When debugging why screenshot capture, chatbox focus transitions, or send-failure messages differ by sender surface.
title: "Message Send Surface Policy and Screenshot Capture Reference"
---

# Message Send Surface Policy and Screenshot Capture Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/utils/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/policies/messageSendUiPolicy.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/ChatMessageSenderUtils.test.ts`
- `tests/frontend/MessageSendUiPolicy.test.ts`

## Sender Surface Ownership

`useChatMessageSender` is used by two caller surfaces:

- `ChatInterface` -> `senderSurface: 'main-window'`
- `ChatBox` -> `senderSurface: 'overlay-chatbox'`

The hook derives two independent gates:

- screenshot gate: `shouldCaptureQueryScreenshot = senderSurface !== 'main-window' && include_query_screenshot`
- overlay return gate: `shouldReturnToChatboxOnSend` from policy resolver, but hard-forced to `false` when `senderSurface === 'main-window'`

So main-window sends never execute `show-chatbox`, even with explicit `returnToChatboxPolicy: 'always'`.

## Return-to-Chatbox Policy Matrix

`resolveMessageSendUiBehavior(...)` inputs:

- `senderSurface`
- `includeQueryScreenshot` (already surface-filtered by hook)
- optional `returnToChatboxPolicy` override

Default policy per surface:

- main window -> `auto`
- overlay chatbox -> `never`

Resolution:

- `always` -> true
- `never` -> false
- `auto` -> mirrors `includeQueryScreenshot`

Main-window override in hook then disables return regardless.

## Send Pipeline Order (`sendMessage`)

1. optional `stopPlayback()` callback
2. resolve conversation ref:
- reuse `getActiveConversationRef()` when present
- else create `conv_${uuid}` and persist via `setActiveConversationRef(...)`
3. append optimistic user message immediately (`screenshot: null`)
4. set store state: `isSending=true`, `thinkingStatus=null`
5. optional `show-chatbox` invoke (overlay-only behavior)
6. optional screenshot capture via `extractOSstate(true, false, 0, isFirstUserMessage)`
7. optional artifact upload via `uploadArtifactBase64(...)`
8. update optimistic message with `screenshotRef/screenshotUrl`
9. record transcript user row (`recordUserMessage`) with timestamp + conversationRef + screenshotRef
10. send backend query (`ApiClient.sendQuery(text, conversationRef, screenshotRef, screenshotUrl)`)

## First-Message Capture Flag

Capture call uses `isFirstUserMessage = !hasUserMessages(useChatStore.getState().messages)`.

Because optimistic user message is appended before capture starts, this flag is computed before insertion. This preserves first-turn behavior even with immediate UI updates.

## Attachment Normalization

`chatMessageSenderUtils` helpers enforce stable shapes:

- pending user message always starts with `screenshot: null`
- artifact content type normalized through `ArtifactImageUtils`
- upload filename always `user-message.<ext>`
- absent upload result maps to `{ screenshotRef: null, screenshotUrl: null }`

## Failure Handling Semantics

Non-fatal failures:

- `show-chatbox` invoke failure -> warn, continue
- screenshot capture failure -> error log, continue without screenshot
- artifact upload failure -> warn, continue send with null screenshot fields

Fatal send failure (`ApiClient.sendQuery` throws):

- sets `isSending=false`
- appends synthetic assistant error row (`type='error'`, fixed text)
- rethrows error to caller

## Transcript Ordering Contract

`recordUserMessage(...)` is called before `sendQuery(...)`, so transcript can already contain the user message when transport fails. The failure then appears as assistant-side error message in UI.

Session/user identity for transcript write comes from `getTranscriptSessionInfo()` + explicit conversation ref.

## Test-Backed Invariants

`tests/frontend/ChatMessageSender.test.tsx` validates:

- default sender behavior when options are omitted
- main-window path never issues `show-chatbox`
- overlay `always` policy does issue `show-chatbox`
- main-window ignores explicit `always` policy
- first-send capture uses `is_first_user_message=true`
- existing-user path uses `is_first_user_message=false`
- screenshot capture disabled when config flag false or surface is main-window
- capture/upload failures do not block query send
- upload success updates store message attachment and backend payload refs
- send failure resets `isSending` and appends assistant error message
- existing conversation ref is reused without generating a new one

`tests/frontend/MessageSendUiPolicy.test.ts` validates default policy and full resolver matrix.

`tests/frontend/ChatMessageSenderUtils.test.ts` validates attachment/meta helper normalization.

## Drift Hotspots

1. changing main-window hard override can reintroduce unwanted window-focus toggles.
2. changing optimistic update order can break first-message capture semantics.
3. removing screenshot field null defaults can break message rendering assumptions.
4. reordering transcript-write and backend-send steps changes failure observability.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
