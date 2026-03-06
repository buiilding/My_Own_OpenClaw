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
- `frontend/src/renderer/features/chat/utils/message/messageTokenUsage.js`
- `frontend/src/renderer/features/chat/utils/message/sourceTags.js`
- `frontend/src/renderer/features/chat/utils/devUiFlag.js`
- `tests/frontend/MessageListAssistantActions.test.jsx`
- `tests/frontend/MessageSourceBadge.test.jsx`
- `tests/frontend/MessageTokenUsage.test.js`

## Action-Row Render Gating (`MessageList`)

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
- writes text with `navigator.clipboard.writeText`
- sets `copySuccess=true` on success
- auto-resets `copySuccess` after delay
- clears pending timer on unmount
- logs warning with prefix on clipboard failure

## Source Badge and Dev-UI Gate

`MessageSourceBadge` renders only when `isDevUiEnabled()` is true.

Source fallback normalization:

- `sourceEventType`: fallback `transcript`
- `sourceChannel`: fallback `unknown`

Badge label is resolved via `resolveSourceTag(sourceEventType, sourceChannel)`:

- known event/channel names map to fixed labels
- unknown event types use `<event> API` fallback
- unknown channels use raw normalized channel fallback

Per-message token telemetry tag:

- `MessageSourceBadge` appends `resolveMessageTokenUsageTag(message)` output when present.
- tags are intentionally approximate (`tokens~ ...`) and currently emitted for:
  - user rows: `txt:<n> img(est):<n> total:<n>`
    - text source precedence: `fullUserMessage.content` -> `message.text`
    - image estimate: `85` tokens per screenshot attachment
  - tool rows (`tool-call`, `tool-output`): `tokens~ <n>` from model-facing payload text.

`isDevUiEnabled()` contract:

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

- dedicated tests now cover source-badge dev gating + token tag rendering (`MessageSourceBadge.test.jsx`) and token-tag derivation rules (`MessageTokenUsage.test.js`).

## Drift Hotspots

1. Changing assistant/user render-gating in `MessageList` can expose actions on tool rows or hide them on normal LLM rows.
2. Diverging copy-hook timer defaults from UI assumptions can desync icon/title state timing.
3. Altering dev-ui query handling/caching can cause stale source-badge visibility without a hard reload.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Tool Call/Output and Transparency Section Rendering Reference](../payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
