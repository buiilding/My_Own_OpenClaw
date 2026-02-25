---
summary: "Deep reference for ChatGptDashboardShell runtime: conversation-first layout, modal/panel exclusivity, recent/search conversation grouping, and rehydrate/open-target routing contracts."
read_when:
  - When changing `ChatGptDashboardShell` state ownership, modal open/close rules, or dashboard sidebar/search flows.
  - When debugging conversation resume failures, stale active conversation highlighting, or `main-window-open-target` routing drift.
title: "Dashboard Shell Modal Routing Contract Reference"
---

# Dashboard Shell Modal Routing Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `tests/frontend/ChatGptDashboardShell.test.jsx`

## Primary Surface Contract

Dashboard runtime is conversation-first:

- `ChatInterface` is always mounted in the primary content region.
- settings/models/memory/search are overlays driven by shell-owned state.
- shell state owns panel visibility; child sections own their internal data/edit state.

Panel state keys in shell:

- `settingsOpen`, `settingsInitialTab`
- `modelsOpen`
- `memoryOpen`
- `searchOpen`

Global exclusivity guard:

- `closeAllPanels()` closes all panel booleans.
- every open helper (`openSettings/openModels/openMemory/handleOpenSearch`) calls `closeAllPanels()` first.
- expected invariant: max one panel open at a time.

## Sidebar and Search Surface Contract

Sidebar navigation actions:

- `New chat` dispatches `window` event `windie:new-chat`.
- `Search chats` opens modal and resets search runtime state.
- `Memory` opens memory modal.
- `Models` opens models modal.
- profile menu routes `Personalization`/`Settings` through `openSettings(tab)`.

Collapsed rail behavior:

- same action ids as expanded sidebar.
- active-state styling still tied to `searchOpen/memoryOpen/modelsOpen`.
- profile menu remains available in collapsed mode.

Recent chat list behavior:

- source channel: `LIST_CONVERSATIONS` with `recordKind: "transcript"`.
- load path runs on mount and when session user id changes.
- list is filtered to rows with `conversation_id`.
- sort order is descending by `last_timestamp`.

Grouping buckets for both recent and search result displays:

- `today`
- `yesterday`
- `previous7Days`
- `older`

## Search Chats Runtime Contract

Search modal state owned by shell:

- `searchQuery`
- `searchedConversations`
- `isSearchingConversations`
- `searchConversationsError`

Query policy:

- trim query.
- if length `< 2`: skip RPC search and clear search result list.
- if length `>= 2`: run debounced search (`180ms`) via `SEARCH_CONVERSATIONS`.
- cancellation guard prevents stale async state writes on rapid query changes/unmount.

Search RPC payload:

- `userId`
- `query`
- `limit: 60`

Result payload expectations:

- each row may include `conversation_id`, `title`, `snippet`, `matched_role`, `last_timestamp`.
- UI normalizes `matched_role` labels (`user -> You`, `assistant -> Assistant`).
- snippet line prefixes role only when snippet does not already start with that prefix.

Search modal behavior:

- focuses input after open (`setTimeout` focus handoff).
- `Escape` closes modal.
- overlay click-outside closes modal.
- `New chat` button closes modal then dispatches new-chat action.

## Conversation Resume/Rehydrate Flow

Shell `handleOpenConversation(conversation)` lifecycle:

1. resolve `conversation_ref` from selected row.
2. close all open panels.
3. call `GET_CONVERSATION` (`limit: 1000`, `recordKind` from row fallback to `transcript`).
4. map memories into renderer rows via `parseMemoriesToMessages`.
5. send backend rehydrate request: `ApiClient.sendRehydrateConversation(conversationRef, memories.map(toRehydrateMessagePayload))`.
6. sync transcript runtime: `setActiveConversationRef(conversationRef)` and `updateTranscriptSession(conversationRef, resolvedUserId)`.
7. replace chat store message list and clear sending/thinking flags.

Failure behavior:

- errors are captured into `recentConversationsError`.
- existing chat state is not force-reset on failure.

## Main-Process Open Target Contract

Shell listens on `ON_CHANNELS.MAIN_WINDOW_OPEN_TARGET`.

Accepted targets:

- `chat` -> close panels only.
- `settings` -> open settings modal.
- `models` -> open models modal.
- `memory` -> open memory modal.

Unrecognized targets are ignored.

## Drift Hotspots

1. Adding panel booleans without extending `closeAllPanels` breaks modal exclusivity.
2. Changing search debounce/query-length threshold without tests can regress network chatter and stale list behavior.
3. Changing conversation grouping logic in one path (recent/search) but not the other causes UI ordering drift.
4. Skipping `updateTranscriptSession` after rehydrate causes transcript write routing to stale conversation ids.

## Related Pages

- [Renderer Dashboard Docs Hub](README.md)
- [Dashboard Memory Management and Resume Reference](../dashboard_memory_management_and_resume_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)
- [Memory IPC and RPC Mapping Reference](../../contracts/memory_ipc_and_rpc_mapping_reference.md)
