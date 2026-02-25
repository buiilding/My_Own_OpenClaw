---
summary: "Renderer dashboard memory reference: section routing, episodic/semantic list and delete flows, transcript-session coupling, and episodic resume-to-chat rehydrate behavior."
read_when:
  - When changing dashboard memory UI behavior, memory IPC invoke payloads, or resume-conversation flow.
  - When debugging missing conversation/memory entries, delete context-menu behavior, or failed continue-conversation rehydrate.
title: "Dashboard Memory Management and Resume Reference"
---

# Dashboard Memory Management and Resume Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/components/MainLayout.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardContent.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/SemanticMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/shared/MemoryContextMenu.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useMemoryContextMenuHotkeys.js`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`

## Section Routing Model

Top-level renderer app uses a sidebar section map:

- `chat`
- `episodic`
- `semantic`
- `procedural`
- `models`
- `usage`
- `settings`

Routing behavior:

- `AppContent` keeps `activeSection` in local state
- non-chat sections lazy-load `DashboardContent`
- `DashboardContent` switches by `sectionId` and mounts memory sections

Episodic section receives `onSelectSection` callback so it can programmatically return to `chat` after successful resume.

## Shared Session Identity Dependency

Both memory sections consume `useTranscriptSessionInfo()`:

- subscribes to `transcript-session-update` browser event
- snapshots `{conversationRef, userId}`
- used to scope list/get/delete operations to current user identity

Fallback behavior:

- if session user is unavailable, sections fall back to `DEFAULT_USER_ID` (`default_user`)

## Episodic Memory List/Get/Delete Flow

### List conversations

`EpisodicMemorySection.loadConversations()` invokes:

- channel: `LIST_CONVERSATIONS`
- payload:
  - `userId`
  - `limit: 200`
  - `recordKind: "transcript"`

UI behavior:

- excludes active transcript conversation from list (prevents selecting currently active chat thread)
- clears invalid selection when selected item no longer exists

### Load selected conversation

`loadConversation(conversationKey)` invokes:

- channel: `GET_CONVERSATION`
- payload:
  - `userId`
  - `conversationId`
  - `limit: 1000`
  - `recordKind`

Result handling:

- stores raw memories for resume path
- transforms memories to chat display rows via `parseMemoriesToMessages(...)`

### Delete conversation

Context menu delete invokes:

- channel: `DELETE_CONVERSATION`
- payload:
  - `userId`
  - `conversationId` (nullable)
  - `recordKind`

Guards:

- explicit browser confirm dialog before delete
- section reloads list after successful delete

## Episodic Continue-Conversation Resume Flow

`continueConversation()` is enabled only when conversation is resumable (`is_resumable`) and has `conversation_id`.

Flow:

1. map stored raw memories to backend rehydrate schema (`toRehydrateMessage(...)`)
2. call `ApiClient.sendRehydrateConversation(conversationRef, messages)`
3. set active transcript conversation (`setActiveConversationRef`)
4. sync transcript session identity (`updateTranscriptSession(conversationRef, userId)`)
5. hydrate chat store with parsed message list
6. clear chat sending/thinking flags
7. navigate back to chat section via `onSelectSection("chat")`

Screenshot mapping rule:

- if memory screenshot looks like inline base64 image, send as `screenshot`
- otherwise treat screenshot value as reference and send as `screenshot_ref`

Legacy behavior:

- non-resumable conversations are marked view-only and do not expose Continue action.

## Semantic Memory List/Delete Flow

### List semantic memories

`SemanticMemorySection.loadSemanticMemories()` invokes:

- channel: `LIST_SEMANTIC_MEMORIES`
- payload: `userId`, `limit: 200`

Post-processing:

- each entry parsed into `{summary, facts[]}` by `parseSemanticContent(...)`
- entries sorted descending by timestamp

### Delete semantic memory

Context menu delete invokes:

- channel: `DELETE_SEMANTIC_MEMORY`
- payload: `userId`, `memoryId`

Behavior:

- confirm dialog required
- clears selection if deleted item was active
- reloads semantic list

## Context Menu + Keyboard Interaction

Shared `MemoryContextMenu`:

- opens at cursor location
- blocks event propagation to avoid accidental background clicks
- supplies Delete + Cancel actions
- backdrop click/right-click closes menu

`useMemoryContextMenuHotkeys` behavior while menu is open:

- `Escape` -> close menu
- `Delete` -> invoke delete handler on active menu target

## Display Transformation Rules (`episodicMemoryUtils`)

Conversation/message transformations include:

- `buildConversationKey(record_kind + conversation_id)`
- robust timestamp sorting (`toTimestampValue`)
- model label rendering from `model_provider/model_id`
- screenshot attachment normalization from direct and metadata fields
- transcript fallback parsing for legacy content (`User:`/`Assistant:` split)

Tool message normalization:

- `tool-bundle` rendered as `tool-call` type in message display path

## Error and Loading States

Episodic section state buckets:

- list loading/deleting errors (`listError`)
- conversation loading errors (`conversationError`)
- resume in-flight state (`isResumingConversation`)

Semantic section state buckets:

- list loading/deleting errors (`loadError`)
- current selection fallback when list empties

Both sections prefer recoverable UI errors over throwing.

## IPC Contract Touchpoints

Channels used by dashboard memory flows:

- `LIST_CONVERSATIONS`
- `GET_CONVERSATION`
- `DELETE_CONVERSATION`
- `LIST_SEMANTIC_MEMORIES`
- `DELETE_SEMANTIC_MEMORY`

Resume-specific backend send path:

- `ApiClient.sendRehydrateConversation(...)` emits websocket `rehydrate-conversation` message through main `to-backend` bridge.

## Debug Checklist

If episodic list is empty unexpectedly:

1. verify transcript session user ID is set (or expected fallback user is used)
2. verify `recordKind: transcript` data exists in local backend store
3. verify active conversation exclusion is not filtering the only thread

If Continue conversation does not switch to chat:

1. verify selected entry has `is_resumable=true` and `conversation_id`
2. verify rehydrate request succeeded (no caught error in section state)
3. verify `onSelectSection("chat")` callback is passed from app router

If semantic details show no facts:

1. inspect semantic memory `content` format (expected `SUMMARY:`/`FACTS:` style)
2. verify parser fallback path output in `parseSemanticContent`
3. verify source memory rows are semantic records, not transcript records

## Related Pages

- [Renderer Dashboard Docs Hub](dashboard/README.md)
- [Dashboard Section Router and Placeholder Panel Contract Reference](dashboard/dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](dashboard/models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)
