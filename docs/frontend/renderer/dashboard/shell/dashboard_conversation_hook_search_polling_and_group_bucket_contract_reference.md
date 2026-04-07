---
summary: "Deep reference for dashboard conversation runtime hook: recent/search loading, transcript-title visibility polling, rehydrate/open/delete handlers, and shared recency bucket grouping semantics."
read_when:
  - When changing `useDashboardConversations` state ownership, search/recent loaders, or conversation action handlers.
  - When changing grouped conversation bucket behavior in sidebar/search surfaces.
title: "Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference"
---

# Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/dashboard/utils/conversationGroups.js`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `tests/frontend/ConversationGroups.test.js`
- `tests/frontend/ChatGptDashboardShell.test.jsx`

## Ownership Boundary

`ChatGptDashboardShell` delegates conversation list/search/rehydrate behavior to `useDashboardConversations`.

Shell-owned concerns:

- panel visibility and modal routing
- main-window open-target routing
- chat composer focus token and open-animation behavior

Hook-owned concerns:

- recent conversation loading and error state
- search query/results/loading/error state
- conversation action handlers (open/rename/pin/delete)
- grouped-list derivation for sidebar and search modal
- transcript-title visibility polling after assistant transcript writes

## Recent Conversation Loader Contract

`loadRecentConversations()`:

- invokes `LIST_CONVERSATIONS` with `{ userId, limit: 200, recordKind: 'transcript' }`
- drops rows without `conversation_id`
- sorts by `last_timestamp` descending
- prunes pinned ids no longer present in loaded list
- dedupes concurrent loads for the same `userId` (reuses in-flight promise)
- ignores stale completion paths when a newer `userId`-scoped load has already started

Failure behavior:

- sets `recentConversationsError`
- preserves the current recent list

## Search Contract

Hook search policy (active only when `searchOpen=true`):

- query `< 2` chars -> clear searched list and skip IPC search
- query `>= 2` chars -> debounced `SEARCH_CONVERSATIONS` call (`180ms`)
- request payload: `{ userId, query, limit: 60 }`
- cancellation guard prevents stale async writes

Search groups are derived from searched rows using shared bucket utility with metadata enabled.

## Group Bucket Utility Contract

`buildConversationGroups(conversations, options)` returns:

- `today`
- `yesterday`
- `previous7Days`
- `older`

Each item shape:

- `key`
- `title` (`'New chat'` fallback)
- `conversation`
- `isPinned`

When `includeSearchMetadata=true`, adds:

- `snippet` (trimmed)
- `matchedRole` normalized (`user -> You`, `assistant -> Assistant`)

## Conversation Action Handlers

### Open conversation

`handleOpenConversation(conversation)`:

1. loads full transcript rows through `loadConversationTranscriptMemories(...)` (paginated `GET_CONVERSATION` calls with `afterMessageIndex` cursor)
2. parses rows with `parseMemoriesToMessages(...)`
3. sends backend rehydrate (`ApiClient.sendRehydrateConversation`)
4. updates transcript session and active conversation ref
5. replaces chat store messages and clears sending/thinking flags
- switches visible chat workspace while in-flight loops continue in their original workspace

Shell behavior:

- conversation selection stays enabled during active loops
- stream/tool events route by conversation workspace; switching history does not hijack in-flight turns

### Rename conversation

- local optimistic title update only (`window.prompt`)
- updates both recent and searched lists in hook state

### Pin/unpin conversation

- local pinned id list only
- prepends newly pinned id and preserves order for grouped render metadata

### Delete conversation

- confirmation required (`window.confirm`)
- calls `DELETE_CONVERSATION`
- removes row from recent + search + pinned state
- if deleting active session conversation, clears transcript session and chat store state

## Transcript Title Visibility Poll Contract

Hook listens for `window` event `transcript-entry-stored`.

Poll trigger condition:

- event role is `assistant`
- event message type is `llm-text`

Poll behavior:

- up to `240` attempts
- interval `1250ms`
- each attempt calls `loadRecentConversations()`
- stops when conversation id becomes visible or attempt budget exhausted

Timer hygiene:

- per-conversation timer map in ref
- old timer cleared before scheduling new poll for same conversation
- all timers cleared on unmount

## Drift Hotspots

1. Duplicating conversation state in shell and hook introduces conflicting update races.
2. Changing group keys without updating both sidebar and search render loops breaks section ordering.
3. Removing poll cleanup leaks timers and background list reloads.
4. Forgetting to clear active transcript session when deleting active conversation leaves stale transcript routing.

## Related Pages

- [Dashboard Shell Docs Hub](README.md)
- [Dashboard Section Router and Placeholder Panel Contract Reference](dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
