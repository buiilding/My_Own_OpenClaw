---
summary: "Workflow for changing WindieOS storage and persistence across renderer transcript/session storage, Electron user-data files, local-runtime SQLite/FAISS memory, backend artifacts, install-auth SQLite, caches, and in-memory services."
read_when:
  - When adding, removing, migrating, or debugging durable or semi-durable data in renderer storage, Electron user-data files, local-runtime memory SQLite/FAISS, backend artifact storage, install auth SQLite, local config, caches, or VM run state.
  - When debugging missing chats, stale dashboard data, corrupted memory indexes, artifact 404s, install-token persistence, config values that reappear after reload, or data that disappears after restart.
title: "Storage and Persistence Change Workflow"
---

# Storage and Persistence Change Workflow

WindieOS has no single database. Persistence is split by runtime and durability tier. Start by naming the storage owner, then change only the layer that actually owns the data.

Use this workflow for storage shape, migration, retention, reset, and data-loss bugs. For session/conversation identity, read [Session and Conversation Identity Change Workflow](../memory/session_conversation_identity_change_workflow.md) first. For memory semantics, read [Memory Change Workflow](../memory/memory_change_workflow.md) first.

## Persistence Tiers

| Tier | Owner | Examples | Restart behavior |
| --- | --- | --- | --- |
| Renderer browser storage | React renderer | renderer config subset, transcript session info, local snapshots | survives renderer reload when local/session storage survives |
| Electron user-data files | Electron main | `frontend-config.json`, `install-auth.json`, permission state, endpoint-derived local config | survives app restart until user-data reset |
| Local-runtime memory DB/index files | SDK local-runtime memory boundary, currently backed by local-runtime Python storage | transcript rows, episodic/semantic memories, conversation titles, FAISS indexes, semanticization watermark | survives app restart, must migrate defensively |
| Backend disk stores | Hosted backend | artifacts, install-auth SQLite | survives backend process restart if path is persistent |
| Backend process memory | Hosted backend | active sessions/history, tool futures, VM run registry, cache entries, OCR/vision loaded models | lost on process restart |
| Packaged resource/runtime files | Electron package and build scripts | bundled Python runtime, feature-pack state, app resources | replaced by reinstall/package update |

Do not promote ephemeral state to durable storage unless the product needs it across restart and the reset/migration behavior is clear.

## Fast Owner Map

| Storage surface | Primary owner | Code roots | Tests to inspect or add | Start docs |
| --- | --- | --- | --- | --- |
| Visible transcript rows and conversation continuity orchestration | SDK transcript projection/runtime | `packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts`, `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`, `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`, `frontend/src/renderer/infrastructure/transcript/**` | `tests/frontend/ConversationContinuityService.test.ts`, `tests/frontend/DesktopConversationContinuityService.test.ts`, `tests/frontend/DesktopConversationStore.test.ts`, `tests/frontend/SdkDisplayChatMessageProjection.test.ts`, `TranscriptStorage*.test.ts` | [Transcript and Replay](../memory/transcript_and_replay.md) |
| Transcript session identity cache | Renderer transcript session runtime plus Electron sync | `sessionInfoStorage.ts`, `transcriptSessionRuntime.ts`, `frontend/src/main/ipc/ipc_transcript_session_sync.cjs` | `tests/frontend/TranscriptSessionState.test.ts`, `IpcTranscriptSessionSync.test.cjs` | [Session and Transcript Reference](../reference/session_and_transcript_reference.md) |
| Frontend user settings | Renderer app-runtime config storage and Electron config file | `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`, `frontend/src/renderer/app/providers/appConfigPersistence.js`, `frontend/src/main/ipc.cjs` | `tests/frontend/configStorage.test.js`, `AppConfigPersistence.test.js`, `AppConfigProvider.storageAndIpc.test.tsx` | [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md) |
| Install auth state file | Electron main | `frontend/src/main/ipc/ipc_install_auth_state.cjs`, `frontend/src/main/ipc.cjs` | install-auth/frontend IPC tests | Credential and Token Change Workflow (private backend docs) |
| Local-runtime transcript/memory SQLite | Local-runtime memory store, currently backed by local-runtime Python modules | `frontend/src/main/python/memory/local_store.py`, `sqlite_store.py`, `operations.py`, `local_backend_memory_handlers.py` | `tests/sidecar/test_local_store*.py`, `test_local_backend.py`, `test_memory_operations.py` | [Local Runtime Memory](../memory/sidecar_local_memory.md) |
| Local-runtime FAISS indexes and vector mappings | Local-runtime memory store, currently backed by local-runtime Python modules | `frontend/src/main/python/memory/faiss_index.py`, `sqlite_store.py`, `local_store.py` | `tests/sidecar/test_local_store_init.py`, `test_local_store_delete_cleanup.py`, storage tests | [SQLite/FAISS/Watermark Reference](../frontend/sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md) |
| Semanticization watermark | Local-runtime memory summarizer, currently backed by local-runtime Python modules | `frontend/src/main/python/memory/watermark_state.py`, `summarizer.py`, `conversation_semanticization_runtime.py` | `tests/sidecar/test_memory_summarizer.py`, semanticization tests | [Local Runtime Memory Hub](../frontend/sidecar/memory/README.md) |
| Backend artifacts | Backend artifact service | `backend/src/services/artifacts/store.py`, `backend/src/api/routes/artifacts/**` | `tests/backend/test_artifacts_store.py`, artifact route tests | [Artifact Change Workflow](../desktop/artifact_change_workflow.md) |
| Backend install-auth DB | Backend auth service | `backend/src/api/auth/service.py` | `tests/backend/test_install_auth.py` | Hosted Backend Auth (private backend docs) |
| Backend active history and compaction state | Backend agent runtime | `backend/src/agent/history/**`, `backend/src/agent/compaction/**` | backend history/compaction/interaction-loop tests | Backend History and Semantic Routes (private backend docs) |
| Tool result futures and resolved-call storage | Backend tool runtime | `backend/src/agent/tools/waiting/storage/result_storage.py`, `backend/src/agent/tools/preparation/storage/resolved_call_storage.py` | `tests/backend/test_tool_result_storage.py`, `test_resolved_tool_call_storage.py` | [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) |
| Backend caches | Backend core infrastructure | `backend/src/core/infrastructure/cache*.py` | `tests/backend/test_cache_layer.py`, `test_cache_entry.py` | Backend Core Cache Hub (private backend docs) |
| VM run control registry | Backend runs service | `backend/src/services/vm_run_control.py`, `backend/src/api/routes/runs/**` | `tests/backend/test_run_control_routes.py` | VM Runs and Workers (private backend docs) |
| Browser-local files | Local-runtime Python Browser Use engine adapter | `frontend/src/main/python/tools/browser/file_store.py`, `browser_use_engine.py` | local-runtime Python browser tool/action tests | [Browser Change Workflow](../browser/browser_change_workflow.md) |
| Permission state | Electron main and renderer permission store | `frontend/src/main/permissions/permission_state_store.cjs`, `frontend/src/renderer/features/permissions/**` | frontend permission tests | [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md) |

## Ownership Rules

- Renderer storage is for UI state and visible transcript projection, not backend model history.
- Electron user-data files are app-local operational state, not a hosted account database.
- Local-runtime SQLite/FAISS owns local memory and transcript search/listing, not backend active prompt context.
- Backend artifact storage owns uploaded binary artifacts and metadata, not renderer local snapshots.
- Backend install-auth SQLite stores token hashes and install records, not provider credentials.
- Backend in-memory registries must be documented as ephemeral unless a durable store is implemented.
- Browser-local files belong to browser tool semantics, not general filesystem tool semantics.

## Change Paths

### Change SDK transcript projection storage

Read:

- [Memory Change Workflow](../memory/memory_change_workflow.md)
- [Transcript and Replay](../memory/transcript_and_replay.md)
- [Transcript Session and Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)

Edit:

- `ConversationContinuityService.ts` for SDK-owned display/rehydrate/delete orchestration over a `ConversationStore`.
- `desktopConversationContinuityService.ts` for Electron's local-runtime-backed continuity service instance.
- `desktopConversationStore.ts` for desktop projection conversion and SDK store write enrichment.
- `desktopSdkDisplayChatMessageProjectionRuntime.ts` for SDK display row to
  renderer chat-message projection.
- `sessionInfoStorage.ts` only for transcript session identity storage.
- SDK projection/rehydrate helpers if stored events are replayed into backend history.

Validate:

- immediate write success/failure paths.
- queued write retry and FIFO order.
- malformed storage payload failure behavior.
- `transcript-entry-stored` and `transcript-session-update` event behavior.
- SDK rehydrate snapshot behavior if event shape changes.

### Change renderer config persistence

Read:

- [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md)
- Runtime Configuration Matrix (private backend docs)
- Backend Config and Container Change Workflow (private backend docs) for backend-owned fields.

Edit:

- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js` for local storage defaults and normalization.
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js` for renderer-owned field filtering.
- `frontend/src/renderer/app/providers/appConfigPersistence.js` for merge/sanitize behavior.
- Electron main config persistence only if disk shape changes.
- backend validation/config only for fields that are intentionally propagated.

Validate:

- legacy local storage still loads.
- undefined values are stripped instead of persisted.
- settings save status reflects backend ACK behavior.
- renderer-managed config does not become a broad backend config write surface.

### Change Electron user-data files

Read:

- [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md)
- Credential and Token Change Workflow (private backend docs) for auth state.
- [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md) for permission state.

Edit:

- `frontend/src/main/ipc/ipc_install_auth_state.cjs` for `install-auth.json`.
- `frontend/src/main/ipc.cjs` for config/auth IPC wiring.
- `frontend/src/main/permissions/permission_state_store.cjs` for permission persistence.
- reset/reinstall docs if user-data cleanup scope changes.

Validate:

- invalid JSON is ignored safely.
- writes are atomic where the helper promises atomic temp-write/rename behavior.
- reset/uninstall docs name the files or state scope accurately.
- credentials and local paths are not committed into fixtures.

### Change local-runtime memory SQLite schema

Read:

- [Local Runtime Memory](../memory/sidecar_local_memory.md)
- [SQLite/FAISS/Watermark Reference](../frontend/sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)
- [Local Runtime Memory Storage Hub](../frontend/sidecar/memory/storage/README.md)

Edit:

- `frontend/src/main/python/memory/sqlite_store.py` for table/index creation and migration probes.
- `frontend/src/main/python/memory/local_store.py` for runtime reads/writes and schema assumptions.
- `operations.py` and `conversation_*_runtime.py` for higher-level semantics.
- dashboard renderer code only after local-runtime payload shape is stable.

Validate:

- fresh DB initialization.
- older DB migration with missing columns.
- index creation and query performance assumptions.
- malformed metadata handling.
- memory writes remain non-fatal when embeddings are unavailable.

Migration rule: add columns/indexes defensively with probes and fallback logging. Do not remove or rename columns without a real migration path and compatibility tests for existing user DBs.

### Change local-runtime FAISS or vector mapping persistence

Read:

- [SQLite/FAISS/Watermark Reference](../frontend/sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)
- [Local Memory Store Embedding/Search Reference](../frontend/sidecar/memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)

Edit:

- `faiss_index.py` for safe index read/write and corruption recovery.
- `sqlite_store.py` for vector mapping load.
- `local_store.py` for vector mapping synchronization, rebuild, and delete cleanup.
- embedding-space identity logic if provider/model/version changes affect index validity.

Validate:

- missing index files start cleanly.
- corrupted index files are handled according to the documented recovery behavior.
- vector mappings rebuild from SQLite rows.
- delete flows clean empty index artifacts and stale mapping rows.
- disk I/O stays off the event loop where helpers use thread-pool wrappers.

### Change semanticization watermark or derived semantic memory

Read:

- [Memory Change Workflow](../memory/memory_change_workflow.md)
- [Local Runtime Memory](../memory/sidecar_local_memory.md)
- [Local Runtime Memory Hub](../frontend/sidecar/memory/README.md)

Edit:

- `watermark_state.py` for persisted watermark shape.
- `summarizer.py` for scheduling/backoff behavior.
- `conversation_semanticization_runtime.py` and `conversation_window_runtime.py` for window selection and metadata.
- backend semantic routes only if remote summarization/title service contracts change.

Validate:

- missing/corrupt watermark files fall back safely.
- default keys are backfilled into loaded watermark payloads.
- summarizer resumes without reprocessing or skipping large windows unexpectedly.
- semanticization failure does not block raw transcript persistence.

### Change backend artifact storage

Read:

- [Artifact Change Workflow](../desktop/artifact_change_workflow.md)
- Backend Artifact Service Hub (private backend docs)
- Services and Storage (private backend docs)

Edit:

- `backend/src/services/artifacts/store.py` for artifact id validation, content-type allowlist, size limits, metadata, and disk paths.
- `backend/src/api/routes/artifacts/**` for upload/fetch route behavior.
- Electron artifact upload/fetch bridge only if client route shape changes.
- renderer image resolution only if artifact URLs/refs change.

Validate:

- unsupported content types and oversized uploads fail correctly.
- partial uploads are cleaned up.
- artifact id validation blocks traversal.
- owner metadata enforcement behaves as intended.

### Change backend install-auth SQLite

Read:

- Credential and Token Change Workflow (private backend docs)
- Hosted Backend Auth (private backend docs)

Edit:

- `backend/src/api/auth/service.py` for install table schema, token hash, registration, and `last_seen_at` updates.
- `backend/src/api/auth/router.py` only when registration request/response changes.
- Electron install auth persistence only if the returned field shape changes.

Validate:

- token hashes stay unique.
- tokens are returned only at registration.
- existing install rows keep authenticating or a migration exists.
- no raw tokens are logged or persisted on the backend.

### Change backend ephemeral stores

Read:

- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- VM Runs and Workers (private backend docs)
- Backend Core Cache Hub (private backend docs)

Edit:

- tool future/result stores for request-id lifecycle and cleanup.
- resolved-call storage for prepared tool-call metadata.
- cache store/manager for TTL, LRU, negative cache, and singleton behavior.
- VM run control service for run status/event/control state.

Validate:

- cleanup/TTL behavior.
- cancellation and failed-result paths.
- concurrent get-or-compute/cache stampede behavior where applicable.
- restart behavior is documented as data loss unless durability is implemented.

## Debug Routing

| Symptom | First checks | Likely owner |
| --- | --- | --- |
| Visible chat exists but is missing after reload | SDK projection writes, local-runtime store payload, conversation id | SDK projection runtime or local-runtime memory |
| Dashboard conversation exists but backend context is empty | rehydrate payload and backend rehydrate service | renderer replay/rehydrate or backend API service |
| Semantic memory search is stale | embeddings availability, FAISS mapping, semanticization watermark | local-runtime memory/index/summarizer |
| App forgets model/settings after restart | renderer local storage, Electron config file, config filter | renderer/Electron config persistence |
| Install auth works once then disappears | `install-auth.json` read/write, user-data reset, registration response normalization | Electron install auth persistence |
| Artifact 404 after upload | artifact id, base dir, owner metadata | backend artifact store or Electron upload bridge |
| VM run vanishes after backend restart | expected: VM run service is in-memory | backend run-control design, not renderer bug |
| Tool wait hangs or leaks futures | result storage cleanup, request-id mismatch, bundle result handling | backend tool waiting storage |
| Cache serves stale value | cache key namespace/TTL/negative cache behavior | backend cache store/manager |
| Browser file lands outside expected root | browser file store env/root resolution | local-runtime Python browser file store |

## Validation Matrix

| Changed storage boundary | Minimum focused validation |
| --- | --- |
| SDK transcript writes/session storage | `<windie> test frontend -- DesktopConversationContinuityService DesktopConversationStore SdkDisplayChatMessageProjection TranscriptStorage TranscriptSession` |
| Frontend config persistence | `<windie> test frontend -- configStorage AppConfigPersistence AppConfigProvider` |
| Electron install auth state | focused frontend install-auth/IPC tests plus backend auth tests if contract changes |
| Local-runtime SQLite/memory schema | `./scripts/python-in-env local-runtime python -m pytest tests/sidecar/test_local_store_init.py tests/sidecar/test_local_backend.py tests/sidecar/test_memory_operations.py` |
| Local-runtime FAISS/vector mapping | local-runtime memory delete/search/init tests and corrupted-index coverage |
| Semanticization/watermark | `./scripts/python-in-env local-runtime python -m pytest tests/sidecar/test_memory_summarizer.py` plus semanticization tests |
| Backend artifacts | `./scripts/python-in-env backend pytest tests/backend/test_artifacts_store.py` plus artifact route tests |
| Backend install-auth DB | `./scripts/python-in-env backend pytest tests/backend/test_install_auth.py` |
| Backend tool/result caches | `./scripts/python-in-env backend pytest tests/backend/test_tool_result_storage.py tests/backend/test_resolved_tool_call_storage.py tests/backend/test_cache_layer.py` |
| VM run state | `./scripts/python-in-env backend pytest tests/backend/test_run_control_routes.py` |
| Docs-only storage changes | `<windie> docs list`, `git diff --check`, and a focused Markdown link check over touched docs |

## Review Checklist

Before committing a storage change:

1. State whether the data is durable, semi-durable, or process-memory only.
2. Name the owner runtime and code root.
3. Confirm reset/uninstall behavior if user-data or local DB files are involved.
4. Add migration tests for existing disk data when changing schema.
5. Keep derived stores rebuildable from source-of-truth rows where possible.
6. Keep credential-bearing persistence out of docs, tests, and logs.
7. Update feature docs and this workflow when storage shape, retention, or reset scope changes.

## Related Docs

- [Data Flow and State Ownership](data_flow_and_state_ownership.md)
- [Memory Change Workflow](../memory/memory_change_workflow.md)
- [Local Runtime Memory](../memory/sidecar_local_memory.md)
- [Transcript and Replay](../memory/transcript_and_replay.md)
- [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md)
- Credential and Token Change Workflow (private backend docs)
- [Artifact Change Workflow](../desktop/artifact_change_workflow.md)
- Services and Storage (private backend docs)
