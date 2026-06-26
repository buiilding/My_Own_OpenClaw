---
summary: "Deep reference for DashboardShell runtime: conversation-first layout, modal/panel exclusivity including Usage, recent/search conversation grouping, and rehydrate/open-target routing contracts."
read_when:
  - When changing `DashboardShell` state ownership, modal open/close rules, or dashboard sidebar/search flows.
  - When debugging conversation resume failures, stale active conversation highlighting, or `main-window-open-target` routing drift.
title: "Dashboard Shell Modal Routing Contract Reference"
---

# Dashboard Shell Modal Routing Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/UsageSection.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/app/runtime/desktopChatEvents.js`
- `frontend/src/renderer/app/runtime/desktopDashboardSearchModalRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardLayoutRuntime.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- `tests/frontend/DashboardShell.test.jsx`

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

- `New chat` calls
  `DesktopChatEventsRuntime.dispatchDesktopRuntimeNewChatEvent(...)`, which
  dispatches the renderer-only `desktop-runtime:new-chat` browser event for the
  mounted chat surface.
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

- source channel: SDK conversation library, backed by local-runtime `conversation_events`.
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
- if length `>= 2`: run debounced search (`180ms`) through
  `DesktopConversationLibraryClient.searchConversations(...)`, which invokes the
  SDK-shaped `conversations.search` command.
- cancellation guard prevents stale async state writes on rapid query changes/unmount.

Search RPC payload:

- `userId`
- `query`
- `limit: 60`
- `recordKind: "chat_event"`

Result payload expectations:

- each row may include `conversation_id`, `title`, `snippet`, `matched_role`, `last_timestamp`.
- UI normalizes `matched_role` labels (`user -> You`, `assistant -> Assistant`).
- snippet line prefixes role only when snippet does not already start with that prefix.

Search modal behavior:

- focuses input after open through
  `DesktopDashboardSearchModalRuntime.startSearchModalLifecycle(...)`.
- `Escape` closes modal through the same lifecycle runtime.
- overlay click-outside closes modal.
- `New chat` button closes modal then dispatches new-chat action.

## Conversation Resume/Rehydrate Flow

Conversation-open lifecycle (`useDashboardConversations`):

1. resolve `conversation_ref` from selected row.
2. load the canonical SDK `ConversationView` through `DesktopConversationLibraryClient.loadConversationView(...)`.
3. set the view on the chat store with `setChatConversationView(conversationView, conversationRef)`.
4. mark backend inference state unknown so the continuity runtime can lazily rehydrate from the SDK snapshot.
5. sync transcript runtime: `setActiveConversationRef(conversationRef)` and `updateTranscriptSession(conversationRef, resolvedUserId)`.
6. leave normal rendering on `ConversationView.displayRows`; sending/thinking state is cleared through the dashboard-open workspace reset plan.

Failure behavior:

- errors are captured into `recentConversationsError`.
- existing chat state is not force-reset on failure.

## Main-Process Open Target Contract

Shell listens through `DesktopWindowRuntimeClient.onMainWindowOpenTarget(...)`.
The runtime client normalizes the host event before shell routing, so shell code
consumes a trimmed target string and does not interpret raw
`main-window-open-target` payload fields directly.

Dashboard reopen wake-up calls
`DesktopDashboardLayoutRuntime.requestDashboardLayoutPass(...)` for the
renderer-only resize pulse used by layout observers. `DashboardShell` owns the
animation and routing state, while the app-runtime facade owns the browser
resize event dispatch timing.

Dashboard shell browser adapters:

- `DesktopDashboardLayoutRuntime.scheduleDashboardOpeningClear(...)` owns the
  opening-animation timeout scheduling/cleanup
- `DesktopDashboardLayoutRuntime.applyDashboardScrollLock(...)` owns document,
  body, and root scroll-lock class add/remove mechanics
- `DashboardShell` keeps shell state, class intent, and panel routing, but does
  not call raw browser timer or document APIs for those effects

Accepted targets:

- `chat` -> close panels only.
- `settings` -> open settings modal.
- `models` -> open models modal.
- `memory` -> open memory modal.

Not wired today:

- `usage` is not handled from `main-window-open-target`; usage is currently opened only from sidebar intent.

Unrecognized targets are ignored.

## Dashboard User Snapshot Contract

Shell loads the fallback dashboard user through
`DesktopClientSessionRuntimeClient.loadMainSessionUserId()`. The runtime client
trims and normalizes `userId` from the full session snapshot while preserving
`loadMainSessionSnapshot()` for callers that need additive session metadata; the
shell consumes only the normalized user id for recent/search conversation
loading until transcript session state supplies a current user.

## Drift Hotspots

1. Adding panel booleans without extending `closeAllPanels` breaks modal exclusivity.
2. Changing hook search debounce/query-length threshold without tests can regress network chatter and stale list behavior.
3. Changing conversation grouping logic in one path (recent/search) but not the other causes UI ordering drift.
4. Skipping `updateTranscriptSession` after rehydrate causes transcript write routing to stale conversation ids.
5. Moving opening timers or scroll-lock DOM access back into `DashboardShell`
   can split browser adapter cleanup from the dashboard layout runtime.

## Related Pages

- [Dashboard Shell Docs Hub](README.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Renderer Dashboard Docs Hub](../README.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](../sections/models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)
- [Usage Section Placeholder Panel and Modal Contract Reference](../sections/usage_section_placeholder_panel_and_modal_contract_reference.md)
- [Memory IPC and RPC Mapping Reference](../../../contracts/memory_ipc_and_rpc_mapping_reference.md)
