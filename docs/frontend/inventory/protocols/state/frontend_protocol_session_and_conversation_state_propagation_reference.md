---
summary: "Deep frontend protocol state reference for websocket bridge identity/session/conversation tracking, query fallback correlation fields, renderer event gating, and transcript-session persistence/update semantics."
read_when:
  - When changing frontend connection/session identity state in `ipc.cjs` or synthetic query event payload context.
  - When changing renderer transcript-session updates, stale-conversation event filtering, or session-info persistence behavior.
title: "Frontend Protocol Session and Conversation-State Propagation Reference"
---

# Frontend Protocol Session and Conversation-State Propagation Reference

## Coverage Snapshot (2026-02-27)

- State-focused protocol test files: `8`
- Total test cases across listed files: `101`

## Scope and Sources

Primary runtime sources:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`

Primary test sources:

- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`
- `tests/frontend/TranscriptWriter.session.test.ts`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`

## State Ownership Matrix

| State Field | Owner | Update triggers | Downstream consumers |
|---|---|---|---|
| `currentUserId` | `ipc.cjs` | websocket open -> generated/sanitized handshake identity | outbound backend envelopes (`user_id`), `ipc-status`, `get-client-user-id` |
| `currentSessionId` | `ipc.cjs` | inbound backend events with `session_id` | synthetic local query context fields, renderer session info |
| `currentServerUserId` | `ipc.cjs` | inbound backend events with `user_id` | synthetic local query context fields |
| `currentConversationRef` | `ipc.cjs` | inbound backend events with `conversation_ref`; reset on reconnect close | query payload fallback when renderer omits conversation ref |
| backend endpoint snapshot (`BACKEND_URL`, `BACKEND_HTTP_URL`) | `ipc.cjs` | backend endpoint resolution during init | `get-client-user-id` payload, `ipc-status`, artifact uploader base URL sync |
| transcript session `{conversationRef,userId}` | `TranscriptWriter` state (`sessionInfoState.ts`) | `updateTranscriptSession(...)`, `setActiveConversationRef(...)` | transcript write routing, pending flush eligibility, dashboard memory views |

## Main-Process Bridge State Flow (`ipc.cjs`)

### Connect/Open

On websocket open:

- marks connected
- resets per-connection state gates (`isFirstQuery`, settings-sync gate state, overlay phase)
- generates/sanitizes `currentUserId`
- sends handshake `{type:'handshake', user_id: currentUserId}`
- broadcasts `ipc-status` snapshot

`tests/frontend/IpcMainBridge.lifecycle.test.cjs` verifies handshake send and sanitized user id behavior.

### Inbound Backend Message Updates

Every parsed backend event can update cached context:

- `data.session_id` -> `currentSessionId`
- `data.user_id` -> `currentServerUserId`
- `data.conversation_ref` -> `currentConversationRef`

On websocket close:

- clears backend session context (`currentSessionId`, `currentServerUserId`, `currentConversationRef`)
- preserves active display-affinity cache (monitor continuity for hidden-sender screenshot/main-window fallback after reconnect)
- broadcasts disconnected status
- schedules reconnect

This reset is critical to avoid leaking stale conversation identity across reconnect boundaries while preserving display-target continuity.

## Client Snapshot State Propagation (`get-client-user-id` + `ipc-status`)

`ipc.cjs` exports a snapshot via:

- `ipcMain.handle('get-client-user-id', ...)` (pull path)
- `broadcastConnectionStatus(...)` -> `ipc-status` (push path)

Snapshot fields:

- `userId`
- `isConnected`
- `backendWsUrl`
- `backendHttpUrl`

`AppConfigProvider` state propagation on each snapshot:

- `updateTranscriptSession(undefined, userId)` when user id resolves
- `setBackendHttpUrl(backendHttpUrl)` for artifact upload routing
- `syncCurrentConfigToBackend()` when already connected

Locked by:

- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

## Query Conversation-Ref Fallback and Synthetic Event Context

`ipc_query_events.cjs` encapsulates context-field assembly for query-side synthetic events.

`resolveConversationRef(payload, currentConversationRef)` rules:

- prefer explicit `payload.conversation_ref` when present
- fallback to cached backend `currentConversationRef`
- else `null`

`buildQueryContextFields(...)` produces:

- `turn_ref` = query message id
- `session_id` = cached session id
- `user_id` = server user id (or client fallback for send-failure event only)
- `conversation_ref` = resolved conversation ref

Used by:

- `buildLocalUserMessage(...)` (optimistic local echo)
- `buildQuerySendFailure(...)` (synthetic backend-unavailable error)

Locked by `tests/frontend/IpcMainBridge.query.test.cjs`:

- conversation-ref fallback reused for both local echo and outbound query
- reconnect clears stale fallback before next query
- query-send failure emits context-preserving error envelope

## Dashboard Conversation Selection State Transitions

`useDashboardConversations` state transitions:

- open conversation:
  - `setActiveConversationRef(conversationRef)`
  - `updateTranscriptSession(conversationRef, resolvedUserId)`
  - replace chat state from rehydrated transcript memories
- delete active conversation:
  - `setActiveConversationRef(null)`
  - `updateTranscriptSession(null, resolvedUserId)`
  - clear chat messages + active send/thinking flags

`ChatGptDashboardShell` consumes `useTranscriptSessionInfo()` for active-row highlighting and user-id fallback flow.

Locked by:

- `tests/frontend/ChatGptDashboardShell.test.jsx`

## Renderer Conversation Gate and Event Acceptance Rules

`useChatStream` applies `shouldIgnoreEventForActiveConversation(...)` before handling backend events.

`chatStreamConversationGate.ts` rules:

- if no active conversation ref, do not ignore
- if event has no conversation ref, do not ignore (compatibility path)
- if event conversation ref matches active one, do not ignore
- `local-user-message` mismatch events are never ignored
- mismatch events are ignored only when:
  - stream has active turn ref, and
  - stream phase is non-terminal (`idle|complete|error` are terminal)

Locked by:

- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

This prevents stale streaming events from other conversations from mutating current view during active turns.

## AppConfigProvider Session Snapshot Sync

`AppConfigProvider` ingests session/user snapshot data from:

- `IpcBridge.invoke(GET_CLIENT_USER_ID)` on mount
- ongoing `ipc-status` events

It then:

- updates transcript user context via `updateTranscriptSession(undefined, userId)` when valid user id exists
- sets artifact backend HTTP URL from metadata
- resyncs frontend config to backend when connection is reported as already connected

Locked by:

- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

## Transcript Session State Persistence and Queue Release

`sessionInfoState.ts` behavior:

- lazy-loads stored session info once
- preserves conversation ref when user-only updates occur
- updates only provided identities (no forced clear unless explicit `null`)

`TranscriptWriter` behavior:

- persists and emits `transcript-session-update` only when session info actually changes
- queued transcript entries flush only when both conversationRef and userId are available
- clearing active conversation (`setActiveConversationRef(null)`) pauses immediate writes; replay occurs after new conversation ref arrives

Locked by:

- `tests/frontend/TranscriptWriter.session.test.ts`

## Frontend Config -> Sidecar Tool Arg State Propagation

`local_backend_bridge.cjs` rewrites shell-tool args with frontend config state:

- reads `getFrontendConfig()?.agent_full_sudo_enabled`
- for `run_shell_command` only:
  - `true` -> `sudo_auth_mode: 'native'`
  - `false`/missing -> `sudo_auth_mode: 'os_prompt'`
- for `system_use` only when nested `tool === 'run_shell_command'` and nested `arguments` is an object:
  - applies the same `sudo_auth_mode` mapping inside nested `arguments`
  - leaves non-object nested `arguments` unchanged so sidecar validation remains authoritative

This is protocol state propagation because a renderer config bit changes sidecar RPC payload semantics (`execute_tool` args) without call-site changes.

Locked by:

- `tests/frontend/LocalBackendBridge.rpc.test.cjs`

## Drift Checks

When changing this surface, keep aligned:

- `ipc.cjs` cache-reset behavior on reconnect close vs query fallback logic
- `ipc_query_events.cjs` context-field names vs renderer `BackendEvent` typing
- AppConfigProvider snapshot handling (`get-client-user-id` + `ipc-status`) vs transcript session identity expectations
- conversation-gate terminal-phase list vs stream-tracking phase names
- dashboard conversation open/delete session updates vs active-row session snapshots
- websocket close/session reset behavior vs display-affinity continuity expectations (do not clear `activeDisplayAffinity`)
- `agent_full_sudo_enabled` config propagation to direct and unified-wrapper (`system_use -> run_shell_command`) `sudo_auth_mode` arg rewrite

## State Control-Path Index

| State control path | Runtime owner | State contract |
|---|---|---|
| handshake identity caching and snapshot fan-out | `frontend/src/main/ipc.cjs` | stable client identity/session endpoint snapshot exposed via `get-client-user-id` and `ipc-status` |
| backend context-field cache updates | `frontend/src/main/ipc.cjs` | inbound `session_id`/`user_id`/`conversation_ref` cache fields track latest backend correlation context |
| conversation_ref fallback for query/local echo | `frontend/src/main/ipc/ipc_query_events.cjs`, `frontend/src/main/ipc.cjs` | query payload and synthetic local-user-message share same resolved conversation reference |
| dashboard conversation open/delete session transitions | `useDashboardConversations`, transcript writer | active conversation + transcript session identity stay in sync during rehydrate/delete flows |
| renderer stale-event gating | `chatStreamConversationGate.ts` + `useChatStream.ts` | active conversation mismatch rules prevent cross-conversation stream pollution while preserving compatibility events |
| websocket-close display affinity continuity | `frontend/src/main/ipc.cjs`, `frontend/src/main/display_affinity_runtime.cjs` | backend session identity resets do not clear active monitor affinity, preserving reconnect-time screenshot/main-window fallback targeting |
| frontend config to sidecar sudo-mode propagation | `frontend/src/main/local_backend_bridge.cjs`, `frontend/src/main/local_backend_bridge_tool_args.cjs` | `agent_full_sudo_enabled` deterministically maps to `sudo_auth_mode` in direct run-shell args and nested `system_use -> run_shell_command` args |

## Related Pages

- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)
