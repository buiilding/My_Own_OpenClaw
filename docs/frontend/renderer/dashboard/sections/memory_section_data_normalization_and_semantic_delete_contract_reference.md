---
summary: "Deep reference for dashboard MemorySection runtime: episodic/semantic fetch normalization, procedural placeholder behavior, local edit/add UX, runtime-backed delete, and memory-store refresh contracts."
read_when:
  - When changing `MemorySection.jsx`, `MemoryItem.jsx`, or `desktopMemoryPresentationRuntime.js`.
  - When debugging dashboard memory list shape drift, episodic/semantic delete failures, or search/edit state behavior.
title: "Memory Section Data Normalization and Delete Contract Reference"
---

# Memory Section Data Normalization and Delete Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/MemoryItem.jsx`
- `frontend/src/renderer/app/runtime/desktopMemoryPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMemoryRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient.js`
- `tests/frontend/MemorySection.test.jsx`

## MemorySection Runtime Ownership

`MemorySection` owns dashboard memory modal behavior:

- memory type tabs (`episodic`, `semantic`, `procedural`)
- fetch orchestration on mount/user switch
- refresh on memory-store change fan-out
- local search state
- episodic/semantic delete RPC flow (for runtime-backed rows)

State buckets:

- tab/search: `activeType`, `searchQuery`
- row UI: `expandedItemId`
- load status: `isLoading`, `loadError`
- data: `memoriesByType`

## Session/User Contract

User id for memory calls is resolved by the command runtime:

- conversation surfaces read `sessionInfo.userId` from `DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo()`
- memory list/delete calls go through `DesktopMemoryRuntimeClient` without a
  renderer-owned default user id

## Fetch and Normalize Contract

Initial load runs both calls in parallel:

- `DesktopMemoryRuntimeClient.listEpisodicMemories(200)`
- `DesktopMemoryRuntimeClient.listSemanticMemories(200)`

Store-change refresh:

- `DesktopMemoryRuntimeClient.onMemoryStoreChanged(...)`
- refreshes both episodic and semantic lists
- the panel does not inspect user ids from the store-change payload; active user
  resolution remains with the memory runtime commands

Presentation projection methods:

- type tabs -> `getDashboardMemoryTypes()`
- episodic -> `normalizeEpisodicMemoriesForDashboard(...)`
- semantic -> `normalizeSemanticMemoriesForDashboard(...)`
- procedural -> `buildProceduralMemoriesForDashboard()` (currently empty array)
- active type fallback -> `resolveDashboardMemoryTypeInfo(...)`
- search filtering -> `filterDashboardMemoriesByQuery(...)`

These methods live behind `DesktopMemoryPresentationRuntime` so dashboard UI
code consumes a reusable memory presentation projection facade instead of
owning local-runtime memory parsing rules or tab descriptor tables inside
section-local files.

### Episodic normalization

- title uses first non-empty content line (prefixes like `user:` / `assistant:` stripped)
- date uses locale-formatted timestamp during normalization
- tokens estimate uses word count
- runtime memory ids retained in `runtimeMemoryId`

### Semantic normalization

- parses `Summary:` / `Facts:` style content into summary + bullet detail
- title defaults to parsed summary
- confidence label derived from metadata source (`manual` -> `Medium`, else `High`)
- source and runtime memory ids retained

## Search Filter Contract

Search scope is current tab list only.

Match behavior:

- trim + lowercase query
- match against memory `title` OR `detail`
- empty query returns full list

## Mutation Semantics

Add/edit controls are intentionally not exposed in `MemorySection`. The panel is backed by local-runtime episodic and semantic stores, and local-only draft mutations would disappear on reload. Until a real create/update memory IPC contract exists for this dashboard shape, delete is the only row mutation.

- no confirmation prompt; delete is single-click
- rows with `runtimeMemoryId` and runtime memory kind call
  `DesktopMemoryRuntimeClient.deleteMemoryItem({ memoryId, kind })`
- rows without a runtime memory id are removed from local list only

`DesktopMemoryRuntimeClient` contains the SDK-shaped memory commands and desktop
memory-store fan-out channel. `MemorySection` must stay UI-scoped and call the
facade instead of importing memory IPC constants.

After delete:

- expanded row state clears if it pointed to removed item

## MemoryItem Presentation Contract

`MemoryItem` is presentational with callback-only actions:

- header click toggles expand
- delete button stops propagation
- metadata row by type:
  - episodic: date + token count
  - semantic: confidence + source
  - procedural: placeholder text

## Test-Backed Signals

`tests/frontend/MemorySection.test.jsx` verifies:

- load path calls episodic + semantic list channels (not conversation list APIs)
- semantic tab render + procedural empty state
- memory type labels/descriptions render from the app-runtime descriptor list
- left close button delegates `onClose`
- semantic delete uses the memory runtime client with expected payload
- episodic delete uses the memory runtime client with expected payload
- memory-store fan-out refreshes through the memory runtime client
- unsupported local add/edit actions are not rendered
- semantic delete path does not use `window.confirm`

## Drift Hotspots

1. Changing local-runtime memory payload shape without updating normalizers.
2. Reintroducing local add/edit without a backend write path creates reload-time data loss.
3. Removing runtime memory id propagation (`runtimeMemoryId`) breaks delete routing.
4. Importing `MEMORY_STORE_CHANGED` in the panel bypasses the runtime client and
   reintroduces desktop transport details into UI code.
5. Divergent user-id fallback policy can split memory visibility by session state.

## Related Pages

- [Dashboard Sections Docs Hub](README.md)
- [Dashboard Memory Management and Resume Reference](../../dashboard_memory_management_and_resume_reference.md)
- [Memory IPC and RPC Mapping Reference](../../../contracts/memory_ipc_and_rpc_mapping_reference.md)
