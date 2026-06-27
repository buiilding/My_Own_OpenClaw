---
summary: "Conceptual guide for WindieOS session, user, conversation_ref, transcript, backend history, and rehydrate ownership."
read_when:
  - When changing session identity, conversation switching, transcript resume, backend rehydrate, stop-query routing, or multi-window conversation state.
  - When debugging messages or tool results landing in the wrong conversation.
title: "Sessions and Conversations"
---

# Sessions and Conversations

WindieOS uses several related identifiers. Do not collapse them into one concept.

| Concept | Primary owner | Purpose |
| --- | --- | --- |
| `user_id` | hosted backend identity plus Electron main/renderer snapshots | scopes backend sessions, local transcript rows, memory search, settings, and install auth state |
| `session_id` | hosted backend runtime session and websocket events | identifies a live hosted backend runtime session and stream context |
| transcript row id/index | local-runtime memory store and renderer transcript queue | persists visible chat rows, replay state, and dashboard conversation lists |
| turn/message id | renderer send path and backend stream events | correlates one user turn, local optimistic row, stream events, and tool execution |

The backend session map is conversation-scoped. The renderer transcript runtime is conversation-scoped. The local-runtime memory store persists transcript rows by conversation. If any one layer invents a new conversation id without synchronizing the others, replay, memory, tool results, or active UI filtering will drift.

## Current Lifecycle

1. Renderer starts or resumes a chat and resolves a `conversationRef`.
2. Renderer transcript runtime broadcasts `transcript-session-sync` with conversation/user identity.
3. Electron main stores the latest conversation fallback and rebroadcasts identity to sibling windows.
4. Query send uses the resolved conversation ref or the main-process fallback.
5. Backend `SessionManager` resolves the `(user_id, conversation_ref)` session and runs the turn under that conversation.
6. Backend stream events carry `conversation_ref`, `session_id`, and turn fields back through Electron main.
7. Renderer filters stream events against the active conversation and writes transcript rows through the local runtime.
8. Dashboard resume loads local-runtime transcript rows and sends backend `rehydrate-conversation` so model history can continue safely.

## Rehydrate Is Not Replay

Replay displays stored transcript rows in the UI. Rehydrate converts stored transcript rows into backend-compatible model history.

- Replay is renderer/local-runtime-facing.
- Rehydrate is backend-facing.
- Tool-call and tool-output pairs must be repaired or pruned before they enter strict provider history.
- Screenshot and artifact refs must survive both display replay and backend context reconstruction.

## Change Rules

- Do not create conversation ids in arbitrary components. Use the shared transcript/session helpers.
- Do not treat `session_id` as a durable conversation key. It is live-session context.
- Do not let hidden replay-state rows outlive a deleted visible conversation.
- Do not route a tool result without enough conversation/turn correlation to find the active backend session.
- When changing active-conversation filtering, validate both dashboard and minimal pill paths because they can have separate renderer windows.

## Debug Routing

| Symptom | Start here |
| --- | --- |
| new user messages persist to the wrong chat | renderer transcript session runtime and main-process `transcript-session-sync` |
| backend continues old context after opening a past chat | dashboard resume rehydrate payload and backend rehydrate services |
| tool output appears but model does not continue | backend session lookup, tool-result ingress, request/tool-call id linkage |
| deleting a chat leaves it searchable or resumable | local-runtime transcript/replay deletion paths and dashboard refresh |

## Deep Docs

- [Session and Conversation Identity Change Workflow](../memory/session_conversation_identity_change_workflow.md)
- [Memory Hub](../memory/README.md)
- [Transcript and Replay](../memory/transcript_and_replay.md)
- Backend History and Semantic Routes (private backend docs)
- Backend Session Runtime and Config Rewire Reference (private backend docs)
- [Frontend Transcript Session and Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)
- [IPC Query Runtime and Transcript Sync Helper Reference](../frontend/main/ipc_query_runtime_and_transcript_sync_helper_reference.md)

## Evidence Notes

- When debugging wrong-conversation behavior, record the selected conversation,
  current-turn conversation, backend session key, and persisted transcript key.
- Treat a matching title or visible message text as weak evidence until the
  conversation identifier path is verified.
