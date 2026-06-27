---
summary: "Renderer dashboard memory/resume reference: MemorySection episodic/semantic data flows, removed episodicMemoryUtils helper behavior, sidebar/search conversation restore path, and transcript-session synchronization rules."
read_when:
  - When changing dashboard memory UI behavior, memory IPC payloads, or conversation resume/rehydrate flow.
  - When debugging missing memory rows, failed chat resume, or stale active conversation highlighting.
  - When resolving stale references to removed `episodicMemoryUtils.js` or `EpisodicMemoryUtils.test.js` dashboard helper paths.
title: "Dashboard Memory Management and Resume Reference"
---

# Dashboard Memory Management and Resume Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`
- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/MemoryItem.jsx`
- `frontend/src/renderer/app/runtime/desktopMemoryPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMemoryRetrievalPreferenceRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMemoryRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient.js`
- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`

## Runtime Surfaces

### Dashboard shell lifecycle surface

`DashboardShell` also owns dashboard-level runtime state that affects memory/resume UX:

- VM-mode gating:
  - when `vmModeEnabled=true`, sidebar/search/settings/models/memory/usage modal surfaces are not mounted
  - main chat surface remains mounted
- dashboard open animation state (`cg-dashboard-shell-opening`) with visibility-change replay
- global dashboard scroll-lock class (`cg-scroll-locked`) applied to `documentElement`, `body`, and root
- transport connectivity projection from:
  - `ipc-status` stream updates, plus
  - startup snapshot via `GET_CLIENT_USER_ID`

### Memory modal surface

`MemorySection` (opened from dashboard modal) owns:

- memory-type tabs: `episodic`, `semantic`, `procedural`
- memory tab labels/descriptions are projected by
  `DesktopMemoryPresentationRuntime.getDashboardMemoryTypes()`
- retrieval injection toggle (`Inject memory into prompts`) persisted through
  `DesktopMemoryRetrievalPreferenceRuntime`; that runtime facade owns the
  active localStorage key (`windieos-memory-retrieval-injection-enabled`) and
  the removed `desktop-assistant-memory-retrieval-injection-enabled` key is
  ignored and not migrated
- memory list fetch orchestration through the runtime client
- memory row projection and search filtering through `DesktopMemoryPresentationRuntime`
- edit/delete interactions for rendered memory rows

Runtime methods used by this surface:

- `DesktopMemoryRuntimeClient.listEpisodicMemories(200)`
- `DesktopMemoryRuntimeClient.listSemanticMemories(200)`
- `DesktopMemoryRuntimeClient.deleteMemoryItem({ memoryId, kind })`
- `DesktopMemoryRuntimeClient.onMemoryStoreChanged(...)`

The runtime client owns SDK-shaped memory commands, memory-store fan-out channel
names, and result normalization. Dashboard feature code must not import memory
IPC constants.

Toggle behavior contract:

- toggle `ON` (default): query payload builder performs local-runtime memory search and injects `<episodic_memory>` / `<semantic_memory>` tags.
- toggle `OFF`: query payload builder skips memory search and omits memory tags from prompt content.
- completed-turn memory persistence is SDK-owned and writes to the local-runtime memory index when memory is enabled.

### Conversation resume surface

Conversation resume now lives in shell + `useDashboardConversations` (consumed by sidebar/search surfaces), not in `MemorySection`.

Resume call chain:

- sidebar rows and search rows call `onOpenConversation(...)`
- `useDashboardConversations` loads the SDK `ConversationView` through
  `DesktopConversationLibraryClient.loadConversationView(...)`, which invokes
  the SDK-shaped `conversation.loadDisplay` command through `windie:invoke`
- shell marks backend inference state as unknown so the continuity runtime can lazily rehydrate before the next backend-dependent action
- shell synchronizes transcript state and chat store

Conversation runtime methods used by this surface:

- `DesktopConversationLibraryClient.listMetadata(...)` -> `conversations.list`
- `DesktopConversationLibraryClient.searchConversations(...)` -> `conversations.search`
- `DesktopConversationLibraryClient.loadConversationView(...)` -> `conversation.loadDisplay`
- `DesktopConversationLibraryClient.deleteConversation(...)` -> `conversations.delete`

## Shared Session Identity Contract

`DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo()`
provides runtime user id and active
conversation ref through the renderer app-runtime facade. Memory list/delete
commands go through `DesktopMemoryRuntimeClient`, which delegates active user
resolution to the command runtime instead of a renderer-owned default user
constant.

Identity is used by:

- sidebar recent-list/search calls
- resume/rehydrate update path (`updateTranscriptSession` + `setActiveConversationRef`)

## MemorySection Data Flows

### Episodic list

`DesktopMemoryRuntimeClient.listEpisodicMemories(...)` payload:

- `limit: 200`

Normalization:

- title from first non-empty content line
- date string from timestamp
- token estimate from word count
- metadata source fallback

Removed helper note:

- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js` and
  `EpisodicMemoryUtils.test.js` were removed. Episodic memory display
  normalization now lives in `desktopMemoryPresentationRuntime.js`, not in a
  separate dashboard utility or section-local helper.

### Semantic list

`DesktopMemoryRuntimeClient.listSemanticMemories(...)` payload:

- `limit: 200`

Normalization:

- parse `SUMMARY:` / `FACTS:` blocks into summary + detail view
- confidence label derived from metadata source (`manual` vs generated)

### Procedural tab

- currently placeholder list (`[]`) with static empty-state messaging.

### Store-change refresh

- `DesktopMemoryRuntimeClient.onMemoryStoreChanged(...)` triggers a full memory
  reload.
- `MemorySection` does not inspect the event payload user id; command runtime
  owns active memory user resolution.

### Delete behavior

- rows with runtime memory IDs route delete through
  `DesktopMemoryRuntimeClient.deleteMemoryItem(...)`
- rows without runtime memory IDs remain UI-local removals.

## Conversation Resume Flow (Sidebar/Search)

`handleOpenConversation(conversation)` shell behavior:

1. guard missing `conversation_id`.
2. ask the SDK conversation library to load canonical local-runtime `conversation_events`.
3. project SDK events for UI display.
4. mark the conversation inference session unknown for lazy continuity rehydrate.
5. update active conversation + transcript session identity.
6. replace chat messages and clear sending/thinking flags.

Error behavior:

- failures populate `recentConversationsError`.
- UI keeps existing chat state if resume fails.

## Conversation Search Flow

Search query behavior:

- trim query.
- query length `< 2`: no runtime search call; fallback to recent groups.
- query length `>= 2`: debounced
  `DesktopConversationLibraryClient.searchConversations(...)` call to the
  SDK-shaped `conversations.search` command (`180ms`).

Search result render extras:

- grouped by recency bucket.
- optional snippet + matched role prefix (`You` / `Assistant`).

## State Buckets

### Shell-level

- `recentConversations`, `isLoadingRecentConversations`, `recentConversationsError`
- `searchQuery`, `searchedConversations`, `isSearchingConversations`, `searchConversationsError`
- panel visibility booleans and active settings tab

### MemorySection-level

- `activeType`, `searchQuery`
- `isLoading`, `loadError`
- `memoriesByType`
- edit/add state (`isAdding`, `editingItemId`, `editedDetail`, etc.)

## Drift Hotspots

1. Treating conversation resume as memory-modal ownership reintroduces stale UX assumptions; runtime owner is shell/sidebar/search.
2. Changing fallback user id policy in one surface but not others can split memory visibility and conversation resume behavior.
3. Altering query length/debounce rules without tests can create excessive IPC traffic or stale search lists.
4. Skipping transcript-session sync after rehydrate causes new transcript writes to land on wrong conversation refs.

## Related Pages

- [Renderer Dashboard Docs Hub](dashboard/README.md)
- [Dashboard Shell Modal Routing Contract Reference](dashboard/shell/dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](dashboard/shell/sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
