---
summary: "Deep reference for dashboard MemorySection runtime: episodic/semantic fetch normalization, procedural placeholder behavior, local edit/add UX, and backend-backed delete IPC contracts."
read_when:
  - When changing `MemorySection.jsx`, `MemoryItem.jsx`, or `memorySectionData.js`.
  - When debugging dashboard memory list shape drift, episodic/semantic delete failures, or search/edit state behavior.
title: "Memory Section Data Normalization and Delete Contract Reference"
---

# Memory Section Data Normalization and Delete Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/MemoryItem.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/memorySectionData.js`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `tests/frontend/MemorySection.test.jsx`

## MemorySection Runtime Ownership

`MemorySection` owns dashboard memory modal behavior:

- memory type tabs (`episodic`, `semantic`, `procedural`)
- fetch + normalization on mount/user switch
- local search filter
- local add/edit flows
- episodic/semantic delete RPC flow (for backend-backed rows)

State buckets:

- tab/search: `activeType`, `searchQuery`
- row UI: `expandedItemId`, `editingItemId`, `editedDetail`
- add form: `isAdding`, `newTitle`, `newDetail`
- load status: `isLoading`, `loadError`
- data: `memoriesByType`

## Session/User Contract

User id for memory calls is derived from transcript session:

- `sessionInfo.userId` from `useTranscriptSessionInfo()`
- fallback `DEFAULT_USER_ID` when missing

## Fetch and Normalize Contract

Initial load runs both calls in parallel:

- `LIST_EPISODIC_MEMORIES` with `{ userId, limit: 200 }`
- `LIST_SEMANTIC_MEMORIES` with `{ userId, limit: 200 }`

Normalization modules:

- episodic -> `normalizeEpisodicMemories(...)`
- semantic -> `normalizeSemanticMemories(...)`
- procedural -> `buildProceduralMemories()` (currently empty array)

### Episodic normalization

- title uses first non-empty content line (prefixes like `user:` / `assistant:` stripped)
- date uses locale-formatted timestamp (`formatDateLabel`)
- tokens estimate uses word count
- backend ids retained in `backendMemoryId`

### Semantic normalization

- parses `Summary:` / `Facts:` style content into summary + bullet detail
- title defaults to parsed summary
- confidence label derived from metadata source (`manual` -> `Medium`, else `High`)
- source and backend ids retained

## Search Filter Contract

Search scope is current tab list only.

Match behavior:

- trim + lowercase query
- match against memory `title` OR `detail`
- empty query returns full list

## Add/Edit/Delete Semantics

### Add

- local-only insertion (no backend create IPC in current flow)
- requires non-empty title
- generated id shape: `local-<type>-<timestamp>`
- detail fallback: `(empty memory)`

### Edit

- local-only detail update for current tab list
- save mutates `detail` field in-place by `memory.id`

### Delete

- no confirmation prompt; delete is single-click
- rows with `backendMemoryId` and backend type:
  - `semantic` -> `DELETE_SEMANTIC_MEMORY`
  - `episodic` -> `DELETE_EPISODIC_MEMORY`
- rows without backend id (including local add rows and procedural placeholders) are removed from local list only

After delete:

- expanded/editing row state clears if it pointed to removed item

## MemoryItem Presentation Contract

`MemoryItem` is presentational with callback-only actions:

- header click toggles expand when not editing
- edit/delete buttons stop propagation
- metadata row by type:
  - episodic: date + token count
  - semantic: confidence + source
  - procedural: placeholder text

## Test-Backed Signals

`tests/frontend/MemorySection.test.jsx` verifies:

- load path calls episodic + semantic list channels (not conversation list APIs)
- semantic tab render + procedural empty state
- left close button delegates `onClose`
- semantic delete uses `delete-semantic-memory` with expected payload
- episodic delete uses `delete-episodic-memory` with expected payload
- semantic delete path does not use `window.confirm`

## Drift Hotspots

1. Changing sidecar memory payload shape without updating normalizers.
2. Treating local add/edit as persisted behavior without backend write path.
3. Removing backend id propagation (`backendMemoryId`) breaks backend delete routing.
4. Divergent user-id fallback policy can split memory visibility by session state.

## Related Pages

- [Dashboard Sections Docs Hub](README.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
- [Memory IPC and RPC Mapping Reference](../../../contracts/memory_ipc_and_rpc_mapping_reference.md)
