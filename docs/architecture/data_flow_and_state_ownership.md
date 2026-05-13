---
summary: "WindieOS data-flow and state-ownership map for queries, streams, tool results, settings, transcripts, memory, artifacts, permissions, providers, and VM runs."
read_when:
  - When changing state that crosses backend, Electron main, renderer, preload, sidecar, or hosted API boundaries.
  - When debugging stale UI, wrong conversation, wrong backend endpoint, missing tool result, memory drift, or duplicated state.
title: "Data Flow and State Ownership"
---

# Data Flow and State Ownership

Most WindieOS bugs come from duplicated ownership. This page maps where state should be produced, normalized, stored, and consumed.

For model-visible prompt/tool data, websocket payloads, IPC envelopes, JSON-RPC mapper shapes, sidecar results, transcript rows, and backend history as one end-to-end trace, use [Agent-Visible Data Pipeline](agent_visible_data_pipeline.md).

For durable or semi-durable storage changes, migrations, reset behavior, and data-loss debugging, use [Storage and Persistence Change Workflow](storage_persistence_change_workflow.md).

## State Ownership

| State | Owner | Consumers | Notes |
| --- | --- | --- | --- |
| backend endpoint URLs | Electron main | renderer, sidecar env, SDK helpers | resolved in `frontend/src/main/backend_endpoints.cjs`; sidecar receives `WINDIE_BACKEND_HTTP_URL` |
| session/conversation identity | backend plus Electron/renderer transcript state | backend history, renderer replay, sidecar transcript/memory | keep `user_id`, `session_id`, `conversation_ref`, and turn ids aligned |
| model/provider settings | backend config/session policy; renderer stores user-facing subset | provider factory, model list UI, prompt construction | renderer should not persist backend-owned provider internals or keys |
| model-facing tool schema | backend | LLM provider adapters, parser validation, transparency events | frontend/sidecar must not import backend schema code |
| executable local tool implementation | sidecar | Electron main bridge, renderer tool runner, backend result ingestion | backend sees results, sidecar does local work |
| stream event phase | backend event producer and Electron/renderer consumers | chat UI, response overlay, tool runner, transcript | stale-turn filtering belongs at consumer boundaries |
| transcript queue | renderer and sidecar local store | dashboard replay, memory indexing, backend rehydrate | visible transcript is not the same as backend history |
| backend conversation history | backend | prompt context, compaction, history rehydrate | sidecar should not mutate it directly |
| semantic/episodic memory | sidecar local store plus backend embedding/semantic APIs | prompt context, dashboard memory, search | embeddings may degrade without blocking SQLite storage |
| artifacts | backend artifact service/API plus Electron upload bridge | renderer image display, tool results, SDK clients | artifact refs should survive transcript replay |
| permissions | Electron main permission services plus stored permission state | renderer onboarding/settings, sidecar path/tool decisions | renderer displays normalized state |
| VM run status/events | backend run control service | hosted dashboard/API callers, VM worker runtime | normal desktop chat should not route through runs API |

## Query Flow

1. Renderer submits a user goal.
2. Electron main enriches with endpoint/config/session/workspace/screenshot/system-state context.
3. Backend websocket route validates the message and resolves a session.
4. Backend agent loop builds prompt/tool context and streams events.
5. Renderer consumes stream events for UI state.
6. Tool calls are dispatched to renderer/main/sidecar as needed.
7. Sidecar returns local tool results through Electron main.
8. Backend ingests tool results, commits history, and continues or completes.
9. Renderer persists visible transcript and replay state.

## Duplication Risk

| Risk | Avoid by |
| --- | --- |
| renderer and backend disagree on model/provider | backend owns effective policy; renderer stores only user-facing selection |
| sidecar points to different backend than websocket | Electron main injects resolved URL; debug `WINDIE_BACKEND_HTTP_URL` |
| tool schemas drift | parity tests, generated/shared contract checks, no backend imports in frontend/sidecar |
| visible transcript differs from backend history | use session/transcript reference and rehydrate contracts |
| permission UI says granted without OS capability | permission services must probe real capability before setting granted |
| packaged app works differently than source | validate installed resource paths and bundled runtime separately |

## Related Docs

- [Session and Transcript Reference](../reference/session_and_transcript_reference.md)
- [Agent-Visible Data Pipeline](agent_visible_data_pipeline.md)
- [Storage and Persistence Change Workflow](storage_persistence_change_workflow.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Memory Hub](../memory/README.md)
