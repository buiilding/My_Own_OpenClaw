---
summary: "Deep reference for ChatGptDashboardShell runtime: conversation-first layout, modal/panel exclusivity including Usage, recent/search conversation grouping, and rehydrate/open-target routing contracts."
read_when:
  - When changing `ChatGptDashboardShell` state ownership, modal open/close rules, or dashboard sidebar/search flows.
  - When debugging conversation resume failures, stale active conversation highlighting, or `main-window-open-target` routing drift.
title: "Dashboard Shell Modal Routing Contract Reference"
---

# Dashboard Shell Modal Routing Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/dashboard/utils/conversationGroups.js`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/UsageSection.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `tests/frontend/ChatGptDashboardShell.test.jsx`

## Primary Surface Contract

Dashboard runtime is conversation-first:

- `ChatInterface` is always mounted in the primary content region.
- settings/models/memory/usage/search are overlays driven by shell-owned state.
- shell state owns panel visibility; child sections own their internal data/edit state.

Panel state keys in shell:

- `settingsOpen`, `settingsInitialTab`
- `modelsOpen`
- `memoryOpen`
- `usageOpen`
- `searchOpen`

Global exclusivity guard:

- `closeAllPanels()` closes all panel booleans.
- every open helper (`openSettings/openModels/openMemory/openUsage/handleOpenSearch`) calls `closeAllPanels()` first.
- expected invariant: max one panel open at a time.

## Sidebar and Search Surface Contract

Sidebar navigation actions:

- `New chat` dispatches `window` event `windie:new-chat`.
- `Search chats` opens modal and resets search runtime state.
- `Memory` opens memory modal.
- `Usage` opens usage modal.
- `Models` opens models modal.
- profile menu routes `Personalization`/`Settings` through `openSettings(tab)`.

Collapsed rail behavior:

- same action ids as expanded sidebar.
- active-state styling is tied to `searchOpen/memoryOpen/usageOpen/modelsOpen`.
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

Conversation-open lifecycle (`useDashboardConversations`):

1. resolve `conversation_ref` from selected row.
2. call `GET_CONVERSATION` (`limit: 1000`, `recordKind` from row fallback to `transcript`).
3. map memories into renderer rows via `parseMemoriesToMessages`.
4. send backend rehydrate request: `ApiClient.sendRehydrateConversation(conversationRef, memories.map(toRehydrateMessagePayload))`.
5. sync transcript runtime: `setActiveConversationRef(conversationRef)` and `updateTranscriptSession(conversationRef, resolvedUserId)`.
6. replace chat store message list and clear sending/thinking flags.

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

Not wired today:

- `usage` is not handled from `main-window-open-target`; usage is currently opened only from sidebar intent.

Unrecognized targets are ignored.

## Drift Hotspots

1. Adding panel booleans without extending `closeAllPanels` breaks modal exclusivity.
2. Changing hook search debounce/query-length threshold without tests can regress network chatter and stale list behavior.
3. Changing conversation grouping logic in one path (recent/search) but not the other causes UI ordering drift.
4. Skipping `updateTranscriptSession` after rehydrate causes transcript write routing to stale conversation ids.

## Related Pages

- [Dashboard Shell Docs Hub](README.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Renderer Dashboard Docs Hub](../README.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](../sections/models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)
- [Usage Section Placeholder Panel and Modal Contract Reference](../sections/usage_section_placeholder_panel_and_modal_contract_reference.md)
- [Memory IPC and RPC Mapping Reference](../../../contracts/memory_ipc_and_rpc_mapping_reference.md)
