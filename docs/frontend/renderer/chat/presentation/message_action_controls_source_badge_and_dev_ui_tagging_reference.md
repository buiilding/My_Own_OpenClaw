---
summary: "Renderer chat presentation reference for assistant/user message action controls, shared copy-action hook timing, and dev-ui-only source badge/tag resolution contracts."
read_when:
  - When changing `AssistantMessageActions`, `UserMessageActions`, `MessageSourceBadge`, or `useCopyMessageAction` behavior.
  - When debugging missing action buttons, copy-success icon reset timing, or dev-ui source-tag visibility mismatches.
title: "Message Action Controls, Source Badge, and Dev-UI Tagging Reference"
---

# Message Action Controls, Source Badge, and Dev-UI Tagging Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/message/AssistantMessageActions.jsx`
- `frontend/src/renderer/features/chat/components/message/UserMessageActions.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageSourceBadge.jsx`
- `frontend/src/renderer/features/chat/hooks/useCopyMessageAction.js`
- `frontend/src/renderer/app/runtime/desktopClipboardRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageActionRuntime.js`
- `frontend/src/renderer/app/runtime/desktopPresentationSourceChannels.js`
- `frontend/src/renderer/app/runtime/desktopMessageSourceTagRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageTokenUsageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDevUiRuntime.js`
- `tests/frontend/DesktopMessageSourceTagRuntime.test.js`
- `tests/frontend/DesktopMessageActionRuntime.test.js`
- `tests/frontend/DesktopDevUiRuntime.test.js`
- `tests/frontend/MessageListAssistantActions.test.jsx`
- `tests/frontend/MessageSourceBadge.test.jsx`
- `tests/frontend/DesktopMessageTokenUsageRuntime.test.js`

## Action-Row Render Gating (`MessageList`)

SDK display rows own replay action availability and target ids through each
message's `actions` metadata. `MessageList` resolves the renderer props for
retry/edit controls through
`DesktopMessageActionRuntime.resolveMessageReplayActions(message)` instead of
parsing `actions.canRetry`, `actions.canEdit`, `retryTargetRowId`, or
`editTargetRowId` inline.

Assistant action row render conditions:

- `enableAssistantActions === true`
- `message.sender === "assistant"`
- `message.type` is not `tool-call` and not `tool-output`

User action row render conditions:

- `enableUserActions === true`
- `message.sender === "user"`
- row is not currently in inline-edit composer mode

Inline user editor behavior:

- opens from `UserMessageActions` edit button
- submit path trims draft and no-ops on empty
- cancel path closes editor without callback dispatch
- light appearance routes the editor surface, draft text, and secondary action
  button through appearance foreground/background tokens so edit/resend visuals
  remain readable on white dashboard surfaces

## Assistant Action Contract

Buttons:

- copy
- like
- dislike
- try again

Behavior:

- copy toggles icon/title from `Copy` -> `Copied` on successful clipboard write
- feedback toggles (`like`/`dislike`) act as set-or-clear per message id
- try-again callback is skipped when button is disabled or callback missing

## User Action Contract

Buttons:

- copy
- edit and resend

Behavior:

- copy uses same shared hook contract as assistant row
- edit forwards `(messageId, messageText)` to parent, which opens inline edit composer in `MessageList`

## Shared Copy Hook Contract (`useCopyMessageAction`)

Inputs:

- `messageText`
- optional `warningPrefix`
- optional `resetDelayMs` (default `4000`)

Runtime behavior:

- no-op when `messageText` is empty
- writes text through `DesktopClipboardRuntime.writeText(...)`
- sets `copySuccess=true` on success
- auto-resets `copySuccess` after delay
- clears pending timer on unmount
- logs warning with prefix on clipboard failure

`DesktopClipboardRuntime.writeText(...)` is the renderer app-runtime browser
adapter for clipboard writes. `DesktopMessageActionRuntime` owns message action
timer scheduling and cleanup for copy-success reset and delayed assistant
action reveal. Message action feature code owns button state and delay policy,
but it does not call `navigator.clipboard`, `window.setTimeout`, or
`window.clearTimeout` directly.

## Source Badge and Dev-UI Gate

`MessageSourceBadge` renders only when
`DesktopDevUiRuntime.isDevUiEnabled()` is true.

Source badge presentation is resolved by
`DesktopMessageSourceTagRuntime.resolveMessageSourceBadgePresentation(message)`.
`MessageSourceBadge` only checks the dev-UI gate and renders the returned
`badgeText` and `title`.

Light appearance renders source badges with the active appearance foreground so
dev metadata remains readable against desktop-light surfaces.

Source fallback normalization inside the runtime:

- `sourceEventType`: fallback `transcript`
- `sourceChannel`: fallback `unknown`

The source portion of the badge is resolved via
`DesktopMessageSourceTagRuntime.resolveSourceTag(sourceEventType, sourceChannel)`:

- known event/channel names map to fixed labels
- renderer presentation metadata uses `sdk:conversation-event`,
  `sdk:current-turn`, and `sdk:display-rows` for SDK-derived rows; these are
  dev/source labels, not IPC channel names, and callers resolve them through
  `DesktopPresentationSourceChannels` rather than importing raw string helper
  exports
- known event labels use renderer/SDK projection terms such as `assistant
  stream`, `tool output`, and `user message` instead of backend API wording
- unknown event types use `<event> event` fallback
- unknown channels use raw normalized channel fallback

Per-message token telemetry tag:

- `DesktopMessageSourceTagRuntime.resolveMessageSourceBadgePresentation(...)` appends
  `DesktopMessageTokenUsageRuntime.resolveMessageTokenUsageTag(message)` output
  when present.
- tags are intentionally approximate (`tokens~ ...`) and currently emitted for:
  - user rows: `txt:<n> img(est):<n> total:<n>`
    - text source precedence: `fullUserMessage.content` -> `message.text`
    - image estimate: `85` tokens per screenshot attachment
  - tool rows (`tool-call`, `tool-output`): `tokens~ <n>` from model-facing payload text.

`DesktopDevUiRuntime.isDevUiEnabled()` contract:

- enabled only when URL query contains `dev_ui=1`
- result memoized in module-local cache for subsequent checks in same page lifecycle

## Test-Backed Invariants

`tests/frontend/MessageListAssistantActions.test.jsx` validates:

- assistant copy/like/dislike/try-again controls appear for assistant `llm-text` rows
- assistant controls do not appear for `tool-call` / `tool-output` rows
- try-again callback receives assistant message id
- copy success icon/title reverts after 4-second timer
- user edit flow opens inline composer and dispatches edited message
- user cancel closes editor without callback

Coverage note:

- dedicated tests now cover source-badge dev gating + token tag rendering (`MessageSourceBadge.test.jsx`) and token-tag derivation rules (`DesktopMessageTokenUsageRuntime.test.js`).

## Drift Hotspots

1. Changing assistant/user render-gating in `MessageList` can expose actions on tool rows or hide them on normal LLM rows.
2. Diverging copy-hook timer defaults from UI assumptions can desync icon/title state timing.
3. Altering dev-ui query handling/caching can cause stale source-badge visibility without a hard reload.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Tool Call/Output and Transparency Section Rendering Reference](../payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
