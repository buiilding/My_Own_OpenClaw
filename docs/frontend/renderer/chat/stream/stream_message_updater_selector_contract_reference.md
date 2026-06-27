---
summary: "Deep reference for `useStreamMessageUpdaters`: sender/turn-scoped message-id selection helpers and update fallback behavior used by `useChatStream` event handlers."
read_when:
  - When changing message-id selector behavior in `useStreamMessageUpdaters.ts`.
  - When debugging stream events that fail to update expected user/assistant rows.
title: "Stream Message Updater Selector Contract Reference"
---

# Stream Message Updater Selector Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/chatStream/useStreamMessageUpdaters.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatWorkspaceMessageRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/stores/chatStoreAdapters.ts`
- `tests/frontend/DesktopChatStreamMessageUpdateRuntime.test.ts`

## Hook Responsibility

`useStreamMessageUpdaters(updateStreamTargetMessage)` provides intent-backed
update helpers. The hook builds app-runtime stream targets and leaves row lookup
to the chat-store adapter/runtime path.

Returned helpers:

- `updateLastMessageBySender(sender, updates, turnRef?, conversationRef?)`
- `updateLastAssistantLlmTextMessage(updates, turnRef?, conversationRef?)`

All helpers call the provided `updateStreamTargetMessage(target, updates,
conversationRef)` with a target descriptor. The adapter/runtime resolves the
current row id and no-ops when no matching message is found.

## Selector Source of Truth

The hook does not read `useChatStore` directly. It builds target descriptors
with `DesktopChatStreamMessageUpdateRuntime` and delegates live workspace
message selection to
`DesktopChatWorkspaceMessageRuntime.buildUpdateStreamTargetMessageStateUpdate(...)`
through `updateStreamTargetMessageInChatStore(...)`.

Implications:

- avoids stale closure snapshots from render-time arrays
- keeps raw workspace reads out of React stream hooks
- update targeting follows latest stream-mutated state in the resolved conversation workspace

## Target Resolution Semantics

### `updateLastMessageBySender`

Selection order:

1. when a non-empty `turnRef` is provided, update only the last same-sender message with that exact turn reference
2. when no `turnRef` is provided, update the global last same-sender message

If both missing: no-op.

Turn-scoped metadata must not fall back to another same-sender row. Delayed or
replayed metadata for an absent turn is dropped instead of mutating a different
turn's transcript transparency.

### `updateLastAssistantLlmTextMessage`

- uses `DesktopChatStreamMessageUpdateRuntime.buildLastAssistantLlmTextStreamTarget(...)`
- turn-scoped lookup first when `turnRef` provided
- no-op when no candidate

## Primary Use in Stream Hook

`useChatStream` uses this hook for event-to-row updates (for example full-message/system-prompt update paths) without duplicating selector logic inline.

Benefits:

- shared targeting behavior across handlers
- turn-scoped no-cross-turn policy centralized
- simpler event handler code in `useChatStream`

## Drift Hotspots

1. Adding sender-only fallback for non-empty `turnRef` metadata can retarget updates to wrong turn rows.
2. Reintroducing `useChatStore.getState()` reads in the hook can reclaim row lookup from the app-runtime adapter path.
3. Diverging selector utility contracts from hook assumptions can produce silent no-op updates.

## Coverage Notes

Current direct unit coverage for this hook is absent.

Adjacent coverage:

- `DesktopChatStreamMessageUpdateRuntime` selector utilities are covered.
- `useChatStream` integration tests exercise downstream behavior that depends on these helpers.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Tracking, Formatting, and Message-Update Utility Reference](tracking_formatting_and_message_update_utility_reference.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
