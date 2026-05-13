---
summary: "Reference map for WindieOS user, session, conversation, turn, transcript, replay, and rehydrate identifiers across backend, Electron main, renderer, and sidecar."
read_when:
  - When changing identifier fields, transcript persistence, backend rehydrate payloads, conversation resume, event filtering, or VM run conversation routing.
  - When debugging wrong-conversation, stale-turn, orphan tool-row, or replay/rehydrate issues.
title: "Session and Transcript Reference"
---

# Session and Transcript Reference

This page is a compact identifier lookup. For the conceptual explanation, read [Sessions and Conversations](../concepts/sessions_and_conversations.md).

## Identifier Map

| Identifier | Shape | Owner | Used by |
| --- | --- | --- | --- |
| `user_id` / `userId` | string | backend install auth, Electron main status snapshot, renderer transcript state | backend sessions, sidecar memory rows, settings, transcript search |
| `session_id` / `sessionId` | string | backend websocket/session runtime | stream events, transcript metadata, live runtime diagnostics |
| `conversation_ref` / `conversationRef` | string | renderer transcript runtime, backend session registry | active conversation filtering, backend history, transcript persistence, VM run metadata |
| `turn_ref` | string | renderer query send and backend stream events | stale-turn filtering, local optimistic user row, tool-runner correlation |
| `tool_call_id` | string | provider/tool parser and backend history | provider replay, tool-output linkage, rehydrate repair |
| `correlation_id` | string | renderer/tool runner and transcript persistence | UI/tool execution correlation across live and stored rows |
| `message_index` | integer | sidecar transcript store | ordered replay, dashboard pagination, semantic candidate windows |
| `run_id` | string | `/api/runs/*` control plane | VM run status, assignment, event timeline, controls |

## Alias Policy

Renderer/main boundaries often accept both camelCase and snake_case aliases for identity fields. Normalize aliases at the boundary and write one canonical internal shape afterward.

Examples:

- `conversationRef` -> `conversation_ref`
- `sessionId` -> `session_id`
- `userId` -> `user_id`

Do not let every consumer implement its own alias parser.

## Transcript Row Types

Common stored row families:

- user message
- assistant text
- tool-call
- tool-output
- error/assistant terminal state
- hidden replay-state rows
- episodic/semantic memory rows

Tool-call and tool-output rows must preserve enough structured metadata to rebuild strict provider history after rehydrate.

## Active Conversation Flow

1. Renderer chooses or creates `conversationRef`.
2. Renderer transcript state emits `transcript-session-sync`.
3. Electron main stores active fallback identity and rebroadcasts to other windows.
4. Query payload includes `conversation_ref`.
5. Backend resolves `(user_id, conversation_ref)` session.
6. Backend stream events return with conversation/session fields.
7. Renderer drops stale or wrong-conversation events.

## Validation Targets

| Change touches | Validate |
| --- | --- |
| backend session creation/routing | backend session manager and query/rehydrate tests |
| renderer transcript identity | renderer transcript/session tests and dashboard resume tests |
| main-process identity sync | IPC transcript-session-sync tests |
| tool-call/tool-output linkage | backend conversation history and rehydrate repair tests |
| VM run conversation routing | runs route/service tests and VM worker tests |

## Deep Docs

- [Sessions and Conversations](../concepts/sessions_and_conversations.md)
- [Transcript and Replay](../memory/transcript_and_replay.md)
- [Backend Session Runtime and Config Rewire Reference](../backend/agent/session_runtime_and_config_rewire_reference.md)
- [Frontend Transcript Session and Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)
- [IPC Event Replay and Transcript Session Sync Reference](../frontend/main/ipc_event_replay_and_transcript_session_sync_reference.md)
- [Backend History Tool-Call ID Staging Reference](../backend/agent/history/tool_call_id_staging_and_tool_output_history_row_contract_reference.md)
