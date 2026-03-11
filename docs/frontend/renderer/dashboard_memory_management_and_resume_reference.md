---
summary: "Renderer dashboard memory/resume reference: MemorySection episodic/semantic data flows, sidebar/search conversation restore path, and transcript-session synchronization rules."
read_when:
  - When changing dashboard memory UI behavior, memory IPC payloads, or conversation resume/rehydrate flow.
  - When debugging missing memory rows, failed chat resume, or stale active conversation highlighting.
title: "Dashboard Memory Management and Resume Reference"
---

# Dashboard Memory Management and Resume Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardSidebar.jsx`
- `frontend/src/renderer/features/dashboard/components/SearchChatsModal.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/features/dashboard/utils/conversationGroups.js`
- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/MemoryItem.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/memorySectionData.js`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`

## Runtime Surfaces

### Dashboard shell lifecycle surface

`ChatGptDashboardShell` also owns dashboard-level runtime state that affects memory/resume UX:

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
- retrieval injection toggle (`Inject memory into prompts`) persisted in localStorage key `desktop-assistant-memory-retrieval-injection-enabled`
- memory list fetch + normalization
- local search filter over loaded rows
- edit/delete interactions for rendered memory rows

IPC methods used by this surface:

- `LIST_EPISODIC_MEMORIES`
- `LIST_SEMANTIC_MEMORIES`
- `DELETE_EPISODIC_MEMORY`
- `DELETE_SEMANTIC_MEMORY`

Toggle behavior contract:

- toggle `ON` (default): query payload builder performs sidecar memory search and injects `<episodic_memory>` / `<semantic_memory>` tags.
- toggle `OFF`: query payload builder skips memory search and omits memory tags from prompt content.
- memory persistence and semanticization are unchanged (interaction `memory-store` writes and summarizer pipeline continue).

### Conversation resume surface

Conversation resume now lives in shell + `useDashboardConversations` (consumed by sidebar/search surfaces), not in `MemorySection`.

Resume call chain:

- sidebar rows and search rows call `onOpenConversation(...)`
- shell fetches full conversation via `GET_CONVERSATION`
- shell sends backend rehydrate (`ApiClient.sendRehydrateConversation`)
- shell synchronizes transcript state and chat store

IPC methods used by this surface:

- `LIST_CONVERSATIONS`
- `SEARCH_CONVERSATIONS`
- `GET_CONVERSATION`

## Shared Session Identity Contract

`useTranscriptSessionInfo()` provides runtime user id and active conversation ref.

Fallback user behavior:

- when session user id is missing, dashboard paths use `DEFAULT_USER_ID`.

Identity is used by:

- memory modal list/delete calls
- sidebar recent-list/search calls
- resume/rehydrate update path (`updateTranscriptSession` + `setActiveConversationRef`)

## MemorySection Data Flows

### Episodic list

`LIST_EPISODIC_MEMORIES` payload:

- `userId`
- `limit: 200`

Normalization:

- title from first non-empty content line
- date string from timestamp
- token estimate from word count
- metadata source fallback

### Semantic list

`LIST_SEMANTIC_MEMORIES` payload:

- `userId`
- `limit: 200`

Normalization:

- parse `SUMMARY:` / `FACTS:` blocks into summary + detail view
- confidence label derived from metadata source (`manual` vs generated)

### Procedural tab

- currently placeholder list (`[]`) with static empty-state messaging.

### Delete behavior

- rows with backend IDs route delete through memory IPC:
  - semantic -> `DELETE_SEMANTIC_MEMORY`
  - episodic -> `DELETE_EPISODIC_MEMORY`
- rows without backend IDs remain UI-local removals.

## Conversation Resume Flow (Sidebar/Search)

`handleOpenConversation(conversation)` shell behavior:

1. guard missing `conversation_id`.
2. call `GET_CONVERSATION` with `recordKind` fallback to `transcript`.
3. convert memory rows for UI display (`parseMemoriesToMessages`).
4. emit backend rehydrate with payload conversion (`toRehydrateMessagePayload`).
5. update active conversation + transcript session identity.
6. replace chat messages and clear sending/thinking flags.

Error behavior:

- failures populate `recentConversationsError`.
- UI keeps existing chat state if resume fails.

## Conversation Search Flow

Search query behavior:

- trim query.
- query length `< 2`: no IPC search call; fallback to recent groups.
- query length `>= 2`: debounced IPC call to `SEARCH_CONVERSATIONS` (`180ms`).

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
