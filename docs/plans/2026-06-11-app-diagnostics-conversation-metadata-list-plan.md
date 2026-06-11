---
summary: "Pre-flight plan for adding persistent app diagnostics for dashboard conversation metadata listing failures."
read_when:
  - When adding persistent diagnostics for dashboard/sidebar chat-list loading, conversation metadata listing, SDK-shaped conversations.list IPC, or sidecar history DB readiness.
  - When debugging `Unable to load chats.` in the dashboard sidebar after app restart.
title: "App Diagnostics Conversation Metadata List Plan"
---

# App Diagnostics Conversation Metadata List Plan

Status: proposed on 2026-06-11.

## User Intent

Add persistent diagnostics for the dashboard sidebar chat-list path so
`Unable to load chats.` can be explained after restart without opening DevTools
or relying on transient console logs.

The concrete diagnostic store path is:

```text
/Users/peterbui/Library/Application Support/desktop-assistant/diagnostics/diagnostics.db
```

This path follows the current local sidecar app-data root used by memory and
conversation history:

```text
/Users/peterbui/Library/Application Support/desktop-assistant
```

## Problem Statement

The current durable `trace_event` system records hidden conversation-scoped
trace rows. That is the correct storage model for turn-scoped paths such as
memory retrieval, screenshot capture, backend streaming, provider calls, and
tool execution.

Dashboard chat-list loading is different:

- it runs during app/sidebar startup;
- it can fail before there is an active conversation or turn;
- it crosses renderer, Electron main, SDK, sidecar RPC, and sidecar SQLite;
- its visible symptom is generic UI state: `Unable to load chats.`;
- the current CLI can read legacy history directly, while the app path goes
  through the canonical SDK/sidecar list path.

Therefore this path needs persistent app diagnostics, not conversation
`trace_event` rows.

## Current Runtime Path

The inspected live path is:

```text
DashboardSidebar
-> useDashboardConversations.loadRecentConversations()
-> DesktopConversationLibraryClient.listMetadata(userId)
-> invokeWindieCommand('conversations.list', { userId, limit })
-> Electron main SDK command handler
-> requireCommandUserId(payload)
-> ensureWindieAgent({ reason: 'sdk-command:conversations.list' })
-> WindieAgent.listConversations()
-> SidecarConversationStore.listMetadata()
-> sidecar RPC conversation.list
-> LocalMemoryStore.list_chat_conversations()
-> memory.chat_event_store.list_chat_conversations(history_db_path)
```

The current canonical sidecar history path is:

```text
/Users/peterbui/Library/Application Support/desktop-assistant/history/history.db
```

The CLI inspector has a read-time fallback to:

```text
/Users/peterbui/Library/Application Support/desktop-assistant/memory/episodic.db
```

The app runtime does not use that CLI fallback for each list request. It expects
the sidecar `LocalMemoryStore` initialization/migration path to create and use
the canonical history database.

## Target Architecture

Add a persistent app diagnostics store owned by the local desktop runtime.

The store records sanitized events for app/runtime paths that are not naturally
conversation-scoped. It must not become a second transcript store, memory
store, or renderer-only log.

The first path is:

```text
conversation.metadata.list
```

This path should explain which boundary failed:

- renderer did not have a usable user id;
- Electron main rejected the user id;
- `ensureWindieAgent` failed;
- SDK local runtime was unavailable;
- sidecar RPC failed;
- canonical history DB was missing or unreadable;
- legacy DB existed but canonical migration did not complete;
- renderer normalization/render state failed after a successful result.

## Storage Path And Schema

Store app diagnostics in:

```text
~/Library/Application Support/desktop-assistant/diagnostics/diagnostics.db
```

On this machine that expands to:

```text
/Users/peterbui/Library/Application Support/desktop-assistant/diagnostics/diagnostics.db
```

Initial SQLite table:

```sql
CREATE TABLE IF NOT EXISTS diagnostic_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  path TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  runtime TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration_ms INTEGER,
  request_id TEXT,
  session_id TEXT,
  conversation_ref TEXT,
  data TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_events_path_time
ON diagnostic_events(path, timestamp);

CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace
ON diagnostic_events(trace_id, timestamp);
```

`data` and `error` are JSON strings containing only sanitized fields.

## Diagnostic Timeline

Expected successful path:

```text
conversation.metadata.list requested succeeded runtime=renderer
conversation.metadata.list ipc_send started runtime=renderer
conversation.metadata.list ipc_received succeeded runtime=electron-main
conversation.metadata.list user_validated succeeded runtime=electron-main
conversation.metadata.list agent_ready succeeded runtime=electron-main
conversation.metadata.list sdk_list started runtime=sdk
conversation.metadata.list sidecar_rpc started runtime=sdk
conversation.metadata.list history_db_checked succeeded runtime=sidecar
conversation.metadata.list store_list succeeded runtime=sidecar
conversation.metadata.list sdk_list succeeded runtime=sdk
conversation.metadata.list normalized succeeded runtime=renderer
conversation.metadata.list rendered succeeded runtime=renderer
```

Expected active-user-id failure:

```text
conversation.metadata.list requested succeeded runtime=renderer
conversation.metadata.list ipc_received succeeded runtime=electron-main
conversation.metadata.list user_validated failed runtime=electron-main error=active_user_id_required
conversation.metadata.list rendered failed runtime=renderer
```

Expected canonical-history mismatch:

```text
conversation.metadata.list history_db_checked failed runtime=sidecar
conversation.metadata.list store_list failed runtime=sidecar error=history_db_unavailable
```

The event must include booleans for canonical and legacy DB presence so the
diagnostic can distinguish "no data exists" from "migration/runtime path failed."

## Safe Metadata

Allowed fields:

- `hasUserId`
- `userIdSource`: `session`, `snapshot`, `missing`, or `unknown`
- `userIdMatchesActive`
- `limit`
- `resultCount`
- `canonicalHistoryDbExists`
- `legacyEpisodicDbExists`
- `backendConnected`
- `sidecarReady`
- `storeKind`
- `durationMs`
- `requestId`
- `shortError`
- `errorCode`

Forbidden fields:

- raw user ids
- chat titles
- last-message text
- workspace paths
- SQL rows
- stack traces
- tokens, install ids, bearer credentials, or API keys
- raw RPC payloads
- memory text, prompt text, or assistant output

## Source Of Truth Changes

- Conversation history remains in sidecar history storage.
- Turn-scoped traces remain hidden `trace_event` rows in the conversation
  ledger.
- App/runtime diagnostics move into `diagnostics/diagnostics.db`.
- Renderer may emit its own request/render facts, but it must not invent
  sidecar, SDK, or Electron main facts.
- Electron main owns IPC receipt, user-id validation, agent readiness, and
  diagnostic DB writing if that is the narrowest reliable app-runtime sink.
- SDK owns `agent.listConversations()` and store adapter facts.
- Sidecar owns local history DB existence, schema/migration state, and
  `conversation.list` execution facts.

## Out Of Scope

- Fixing the chat-list bug itself.
- Migrating conversation history storage.
- Moving existing turn-scoped `trace_event` rows into the new diagnostics DB.
- Adding a user-facing diagnostics panel.
- Persisting raw chat metadata, titles, snippets, workspace paths, or message
  content.
- Adding a hosted/backend diagnostics database for this local desktop path.

## Implementation Workflow

1. Add a small desktop diagnostics store module with deterministic path
   resolution, schema creation, append, and query helpers.
2. Make diagnostics append failures non-fatal and stderr/log-safe.
3. Add a narrow trace context for `conversation.metadata.list` requests.
4. Emit renderer request/result spans around
   `DesktopConversationLibraryClient.listMetadata(...)`.
5. Emit Electron main spans around the `conversations.list` SDK command
   handler, especially user-id validation and `ensureWindieAgent`.
6. Emit SDK spans around `WindieAgent.listConversations()` and
   `SidecarConversationStore.listMetadata()`.
7. Emit sidecar spans around canonical/legacy DB presence and
   `list_chat_conversations(...)`.
8. Add CLI inspection commands:

```bash
bin/windie diagnostics list --path conversation.metadata.list --limit 50
bin/windie diagnostics inspect <trace-id>
```

9. Update runtime trace and observability docs to distinguish:
   - conversation `trace_event` rows for turn-scoped paths;
   - app diagnostics DB rows for non-conversation runtime paths.
10. Add focused tests and run validation.

## Testing Plan

Focused frontend/Electron tests:

- `conversations.list` success emits sanitized started/succeeded diagnostics.
- missing/invalid user id emits a failed `user_validated` diagnostic.
- diagnostics writer failure does not make `conversations.list` fail.
- renderer list failure produces a sanitized rendered-failed diagnostic.

Focused SDK tests:

- `WindieAgent.listConversations()` forwards trace context to the store.
- `SidecarConversationStore.listMetadata()` emits success/failure diagnostics
  without raw metadata.

Focused sidecar tests:

- diagnostics DB schema initializes under `diagnostics/diagnostics.db`.
- canonical and legacy DB existence facts are recorded as booleans.
- sidecar `conversation.list` diagnostics omit titles, message text, workspace
  paths, raw SQL, and stack traces.

CLI/docs validation:

```bash
bin/windie docs list
bin/windie diagnostics list --path conversation.metadata.list --limit 5
git diff --check
```

## Migration And Compatibility Notes

- No migration is required for existing conversation history databases.
- The diagnostics database is created lazily when diagnostics are first
  emitted or inspected.
- Existing `bin/windie conversation ...` commands keep their current canonical
  history DB plus legacy fallback behavior.
- New diagnostics commands should tolerate a missing diagnostics DB and report
  an empty result instead of failing.
- Retention policy is intentionally deferred, but the first implementation
  should keep query limits capped and avoid unbounded CLI output.

## Success Criteria

- A sidebar `Unable to load chats.` failure has a persistent
  `conversation.metadata.list` diagnostic timeline.
- The timeline identifies the failing boundary without exposing user content or
  credentials.
- The diagnostics DB is stored at the deterministic app-data path:
  `~/Library/Application Support/desktop-assistant/diagnostics/diagnostics.db`.
- Conversation history and memory stores are not used for app diagnostics.
- Existing conversation list behavior is not made dependent on diagnostics
  writes.
- Docs explain when to use `bin/windie trace` versus the new diagnostics
  commands.

## Reread Anchors After Compaction

- `AGENTS.md`
- `docs/debug/observability_change_workflow.md`
- `docs/architecture/storage_persistence_change_workflow.md`
- `docs/debug/runtime_traces.md`
- `docs/frontend/renderer/dashboard/shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
- `packages/windie-sdk-js/src/stores/SidecarConversationStore.ts`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/chat_event_store.py`
- `scripts/windie/commands.cjs`
