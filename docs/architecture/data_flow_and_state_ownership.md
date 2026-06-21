---
summary: "WindieOS data-flow and state-ownership map for queries, streams, tool results, settings, transcripts, memory, artifacts, permissions, providers, and VM runs."
read_when:
  - When changing state that crosses backend, Electron main, renderer,
    preload, local runtime, or hosted API boundaries.
  - When debugging stale UI, wrong conversation, wrong backend endpoint, missing tool result, memory drift, or duplicated state.
title: "Data Flow and State Ownership"
---

# Data Flow and State Ownership

Most WindieOS bugs come from duplicated ownership. This page maps where state should be produced, normalized, stored, and consumed.

For model-visible prompt/tool data, websocket payloads, IPC envelopes, JSON-RPC mapper shapes, local results, transcript rows, and backend history as one end-to-end trace, use [Agent-Visible Data Pipeline](agent_visible_data_pipeline.md).

For durable or semi-durable storage changes, migrations, reset behavior, and data-loss debugging, use [Storage and Persistence Change Workflow](storage_persistence_change_workflow.md).

## State Ownership

| State | Owner | Consumers | Notes |
| --- | --- | --- | --- |
| backend endpoint URLs | Electron main | renderer, local-runtime env, SDK helpers | resolved in `frontend/src/main/app/backend_endpoints.cjs`; local runtime receives `WINDIE_BACKEND_HTTP_URL` |
| session/conversation identity | backend plus SDK conversation runtime | backend history, SDK projections, local-runtime transcript/memory, renderer display | keep `user_id`, `session_id`, `conversation_ref`, and turn ids aligned |
| model/provider settings | backend config/session policy; SDK model-selection contract; renderer stores user-facing subset | provider factory, model list UI, prompt construction | renderer should not persist backend-owned provider internals or keys; desktop query-time model patches are built through the SDK model-selection helper; conversation-scoped SDK model changes append `settings_updated` events for runtime state/debug but do not become display or rehydrate history |
| model-facing tool schema | backend | LLM provider adapters, parser validation, transparency events | client/local-runtime Python code must not import backend schema code |
| executable local tool implementation | local runtime | SDK tool coordinator, Electron main bridge, backend result ingestion, renderer display projection | backend sees results, local-runtime Python implementation does local work |
| stream event phase | backend event producer plus SDK runtime reducer | chat UI, response overlay, tool coordinator, transcript projections | stale-turn filtering belongs at consumer boundaries |
| normalized conversation events | SDK runtime | desktop, CLI, custom UI, store adapters, backend rehydrate projection | UI messages are projections, not storage truth |
| transcript queue | SDK store adapter and local-runtime local store during migration | dashboard replay, memory indexing, backend rehydrate | visible transcript is not the same as backend history |
| backend conversation history | backend | prompt context, compaction, history rehydrate | local-runtime execution should not mutate it directly |
| semantic/episodic memory | local-runtime memory store plus backend embedding/semantic APIs | prompt context, dashboard memory, search | embeddings may degrade without blocking SQLite storage |
| artifacts | backend artifact service/API plus Electron upload bridge | renderer image display, tool results, SDK clients | artifact refs should survive transcript replay |
| permissions | Electron main permission services plus stored permission state | renderer onboarding/settings, local-runtime path/tool decisions | renderer displays normalized state |
| VM run status/events | backend run control service | hosted dashboard/API callers, VM worker runtime | normal desktop chat should not route through runs API |

## Query Flow

1. UI submits a user goal to the SDK conversation runtime.
2. SDK transport sends the query through the hosted backend websocket.
3. Backend websocket route validates the message and resolves a session.
4. Backend agent loop builds prompt/tool context and streams events.
5. SDK normalizes backend events into conversation events.
6. SDK tool coordinator dispatches local tool calls to local-runtime execution.
7. The local-runtime Python implementation returns local tool results to the SDK coordinator.
8. SDK returns tool results to backend and appends normalized tool-output events.
9. Backend ingests tool results, commits history, and continues or completes.
10. UI renders SDK display projections while rehydrate snapshots are generated from the same normalized events.

Backend events without explicit conversation identity or a previously registered
turn-to-conversation mapping are quarantined at renderer ingress. They do not
fall back to the active chat, because `conversationRef` owns chat identity.

## Duplication Risk

| Risk | Avoid by |
| --- | --- |
| renderer and backend disagree on model/provider | backend owns effective policy; renderer stores only user-facing selection |
| local runtime points to different backend than websocket | Electron main injects resolved URL; debug `WINDIE_BACKEND_HTTP_URL` |
| tool schemas drift | parity tests, generated/shared contract checks, no backend imports in client/local-runtime Python code |
| visible transcript differs from backend history | use session/transcript reference and rehydrate contracts |
| UI display, replay, and edit/resend history drift | make them projections from SDK normalized conversation events |
| permission UI says granted without OS capability | permission services must probe real capability before setting granted |
| packaged app works differently than source | validate installed resource paths and bundled runtime separately |

## Migration Debt Rules

Runtime ownership cleanup is tracked through [Agent Runtime Ownership and Change Routing](../development/agent_runtime_ownership_and_change_routing.md) plus the owner-specific workflow docs. Current docs should not imply migration debt is gone until the owning search/test proves it.

| Duplicate path | Current owner | Deletion condition | Test target |
| --- | --- | --- | --- |
| Raw backend chat packets vs SDK conversation events | SDK conversation runtime owns chat meaning; raw packets are compatibility/diagnostics or typed side-channel input only | No renderer chat live-state code subscribes to `ON_CHANNELS.FROM_BACKEND`; every remaining subscription has a typed owner | `RendererChatRuntimeBoundary`, `IpcBackendEventChannels` |
| Renderer active conversation cache vs transcript session authority | Transcript/session helpers own foreground conversation selection; `chatStore.activeConversationRef` is a routing/display cache | Feature code routes active selection through session helpers and does not directly mutate the active ref | `ConversationSessionRuntime`, `DesktopChatStreamIngressRuntime`, renderer boundary tests |
| Query command fields across renderer, main, SDK, backend | SDK/main query runtime owns backend-safe payload mapping; backend schema fixture owns allowed keys | Adding a backend query field changes one mapper plus contract tests; UI-only fields never reach backend payload | `IpcQueryRuntime`, `BackendSdkWebsocketContract`, backend incoming contract parity |
| Settings/model startup effects in providers vs settings runtime | `DesktopSettingsRuntimeClient` and main settings/model runtimes own startup requests and ACK queues | Providers remain dumb stores over runtime state; startup model list is not a mount-side effect in `AppConfigProvider` | `DesktopSettingsRuntimeClient`, `AppConfigProvider.models`, `IpcSettingsSyncRuntime` |
| Renderer replay/display state vs SDK persistence projections | SDK stores/projection builders own display and rehydrate interpretation; renderer adapts display rows | No new renderer event-to-history tables outside SDK projection adapters | SDK store/projection tests and dashboard replay tests |

## Related Docs

- [Session and Transcript Reference](../reference/session_and_transcript_reference.md)
- [Agent-Visible Data Pipeline](agent_visible_data_pipeline.md)
- [Storage and Persistence Change Workflow](storage_persistence_change_workflow.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Memory Hub](../memory/README.md)

## Evidence Notes

- For every state handoff, capture the producer payload and the consumer state
  update before concluding which layer is stale.
- Durable state changes need storage evidence; transient projection changes need
  event or selector evidence from the active runtime.
