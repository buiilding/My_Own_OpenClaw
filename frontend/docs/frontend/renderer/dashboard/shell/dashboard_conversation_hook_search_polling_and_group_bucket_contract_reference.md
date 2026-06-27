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
- `frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationDialogRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`
- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- `tests/frontend/ConversationGroups.test.js`
- `tests/frontend/DashboardShell.test.jsx`

## Ownership Boundary

`DashboardShell` delegates conversation list/search/rehydrate behavior to `useDashboardConversations`.
The hook is exported directly from its owner declaration in
`useDashboardConversations.js`; do not add a passive export block or alternate
hook barrel.

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

- loads conversation metadata through the desktop conversation library/SDK
  continuity service with no
  hidden limit so startup can see every local chat; explicit limits are applied
  only when a caller requests pagination
- maps SDK `ConversationMetadata` rows into dashboard row fields through
  `DesktopDashboardConversationLoadRuntime.metadataListToDashboardConversations(...)`
- the continuity service uses the SDK `LocalRuntimeConversationStore` for list,
  search, delete, display, rehydrate, revision, and title metadata invalidation
  reads and writes; the desktop conversation store factory remains only as the
  desktop write-enrichment hook
- drops rows without `conversation_id`
- sorts by `last_timestamp` descending
- prunes pinned ids no longer present in loaded list
- dedupes concurrent loads for the same `userId` (reuses in-flight promise)
- ignores stale completion paths when a newer `userId`-scoped load has already started
- when `userId` is missing or cleared, invalidates outstanding loads and clears
  recent conversations plus pinned ids so the previous user's list is not shown
- after at least one recent row has rendered, event-driven refreshes run as
  background metadata reloads and do not set the blocking recent-list loading
  state, so edit/resend does not flash or blank already-visible chats

Failure behavior:

- sets `recentConversationsError`
- preserves the current recent list

## Search Contract

Hook search policy (active only when `searchOpen=true`):

- query `< 2` chars -> clear searched list and skip runtime search
- query `>= 2` chars -> debounced through
  `DesktopDashboardConversationLoadRuntime.scheduleConversationSearchDebounce(...)`
  `DesktopConversationLibraryClient.searchConversations(...)` call to the
  SDK-shaped `conversations.search` command (`180ms`)
- request payload: `{ userId, query, limit: 60 }`
- result metadata is projected through the shared dashboard conversation load
  runtime metadata mapper before search groups consume it
- cancellation guard prevents stale async writes, and debounce cleanup routes
  through `clearConversationSearchDebounce(...)`

Search groups are derived from searched rows using the app-runtime conversation
grouping facade with metadata enabled.

## Group Bucket Utility Contract

`DesktopDashboardConversationGroupRuntime.buildConversationGroups(conversations, options)` returns:

- `today`
- `yesterday`
- `previous7Days`
- `older`

The same `DesktopDashboardConversationGroupRuntime` facade owns the ordered
group descriptors consumed by search-modal rendering:

- `getDashboardConversationGroupDescriptors()`
- `getDashboardConversationGroupKeys()`
- `getDashboardConversationGroupLabel(groupKey)`
- `getDashboardSearchSnippetDisplayText(item)`

Search UI components render group order and labels from these helpers instead
of carrying local bucket tables, and render snippet text from the search
snippet display helper instead of recomputing matched-role prefix rules.

Each item shape:

- `key`
- `title` (`'New chat'` fallback)
- `conversation`
- `isPinned`

Workspace grouping also tracks `hasPinnedConversation` on each workspace group.
Pinned workspace groups sort before unpinned workspace groups, and recency still
orders groups within the same pinned/unpinned tier.

When `includeSearchMetadata=true`, adds:

- `snippet` (trimmed)
- `matchedRole` normalized (`user -> You`, `assistant -> Assistant`)

The search snippet display helper prefixes snippets with the normalized
`matchedRole` label only when the snippet does not already begin with the same
role prefix.

## Conversation Action Handlers

### Open conversation

`handleOpenConversation(conversation)`:

1. updates transcript session and active conversation ref
2. clears the target chat workspace only when it has no cached rows, so stale
   rows do not remain visible while the SDK view is loading
3. loads the SDK `ConversationView` through the desktop conversation
   library/runtime
4. stores the loaded `ConversationView` as the normal chat read model
5. clears sending/thinking/token flags for the selected workspace
- switches visible chat workspace while in-flight loops continue in their original workspace

Dashboard resume must not project `ConversationView.displayRows` into
`chatStore.messages`. Message construction from SDK rows belongs to the chat
presentation/view projection path once `ConversationView` exists.

Shell behavior:

- conversation selection stays enabled during active loops
- stream/tool events route by conversation workspace; switching history does not hijack in-flight turns

### Rename conversation

- local optimistic title update only
- browser prompt ownership lives in
  `DesktopDashboardConversationDialogRuntime.requestDashboardConversationRenameTitle(...)`
- updates both recent and searched lists in hook state

### Pin/unpin conversation

- local pinned id list only
- prepends newly pinned id and preserves order for grouped render metadata

### Delete conversation

- confirmation required through
  `DesktopDashboardConversationDialogRuntime.confirmDashboardConversationDelete(...)`
- calls `DELETE_CONVERSATION`
- removes row from recent + search + pinned state
- if deleting active session conversation, clears transcript session and chat store state

## Transcript Title Visibility Poll Contract

Hook listens for `window` event `transcript-entry-stored` and for desktop
conversation-library metadata invalidations. The library invalidation path is
SDK-owned: local-runtime events such as `conversation-title-updated` are mapped
by `ConversationContinuityService.subscribeMetadataInvalidations(...)` before
the dashboard hook sees them.

Poll trigger condition:

- event role is `assistant`
- event message type is `llm-text`

Metadata invalidation trigger condition:

- invalidation reason is emitted by the SDK conversation continuity service
- any invalidation requests a background recent-conversation refresh

Poll behavior:

- up to `240` attempts
- interval `1250ms`
- each attempt calls `loadRecentConversations()`
- stops when conversation id becomes visible or attempt budget exhausted
- conversation-event reloads and metadata invalidations are coalesced briefly
  after the list is already visible; empty-list first-chat refresh still loads
  immediately
- browser timer scheduling/cleanup routes through
  `DesktopDashboardConversationLoadRuntime` helpers instead of direct hook
  `window.setTimeout`/`window.clearTimeout` calls

Timer hygiene:

- per-conversation timer map in ref
- old timer cleared by `scheduleTitleVisibilityPollTimer(...)` before
  scheduling a new poll for the same conversation
- all timers cleared on unmount through `clearAllTitleVisibilityPollTimers(...)`

## Drift Hotspots

1. Duplicating conversation state in shell and hook introduces conflicting update races.
2. Changing group keys without updating both sidebar and search render loops breaks section ordering.
3. Removing poll cleanup leaks timers and background list reloads.
4. Forgetting to clear active transcript session when deleting active conversation leaves stale transcript routing.
5. Reintroducing passive hook re-export blocks can obscure the dashboard
   conversation owner module without adding runtime behavior.

## Related Pages

- [Dashboard Shell Docs Hub](README.md)
- [Dashboard Section Router and Placeholder Panel Contract Reference](dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
