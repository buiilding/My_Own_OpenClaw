---
summary: "Reference map for WindieOS backend websocket event families, canonical event names, backend owners, renderer consumers, and validation docs."
read_when:
  - When adding, renaming, formatting, or consuming backend websocket events.
  - When debugging stream events that are missing, ignored by the renderer, stale, or malformed.
title: "WebSocket Event Reference"
---

# WebSocket Event Reference

WindieOS uses one canonical streamed-event vocabulary for backend formatter output, Agent SDK normalization/projection, typed Electron fan-out channels, and renderer chat consumption. Main no longer exposes a generic `from-backend` renderer channel for backend websocket messages. For a development workflow, read [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md).

## Canonical Event Families

| Family | Event names | Backend owner | Renderer owner |
| --- | --- | --- | --- |
| assistant stream | `llm-thought`, `streaming-response`, `streaming-complete`, `error` | private backend implementation, backend formatter specs | SDK backend-event normalizer, `useChatStream.ts` |
| tool turns | `tool-call`, `tool-bundle`, `tool-output` | backend tool orchestration, formatter specs, outgoing schemas | `useChatStream.ts`, Agent SDK display projection, transcript tool persistence |
| transparency | `system-prompt`, `user-message-full`, `assistant-message-full`, `tool-schemas` | prompt metadata/event presenter and formatter specs | message transparency sections |
| compaction | `context-compaction-started`, `context-compaction-completed`, `context-compaction-failed` | backend history compaction events and formatter specs | chat stream compaction/thinking state |
| model-history | `model-history-updated` | backend `ConversationHistory` checkpoint projection and formatter specs | SDK hidden checkpoint persistence |
| usage | `token-count` | backend token-count event formatter | token display |
| model/settings status | `models-listed`, `settings-updated` | backend model/settings handlers | app config/status providers |
| audio side-channel | `audio-chunk` | backend TTS/audio stream path | dedicated audio parser/player, outside typed chat-event union |
| local synthetic | `local-user-message` | Electron main local optimistic event builder | chat stream and transcript writer |

## Required Cross-Layer Updates

When adding or renaming a streamed backend event, update the relevant set:

1. backend event dataclass or event producer
2. `StreamingEventType` literal when it is a backend streaming event
3. formatter spec registration
4. outgoing websocket schema and message type constants
5. renderer event type guard or dedicated parser
6. renderer consumer handler
7. contract tests and focused frontend tests

Do not rely on legacy alias normalization for new events.

## Correlation Fields

Events that affect chat state should preserve:

- `id`
- `turn_ref`
- `conversation_ref`
- `session_id`
- `user_id`

Renderer active-conversation filtering and stale-turn rejection depend on these fields.

## Compaction Completed Shape

`context-compaction-completed` covers both applied and skipped outcomes:

- Applied compaction has `skipped_reason: null` and may carry replay-safe `replacement_history_entries` plus a dev/debug `replacement_history_preview`.
- Skipped compaction has a non-empty `skipped_reason`, `removed_messages: 0`, unchanged token counts, and no replacement history entries.

SDK runtime adapters treat non-empty `replacement_history_entries` as the signal for an applied normalized compaction event. Skipped outcomes remain lifecycle/debug state and should not render as assistant transcript content.

When manual compaction applies, backend sends a following
`model-history-updated` packet for the same active conversation/revision. The
compaction event carries replay/debug metadata; the model-history event carries
the bounded provider-neutral inference checkpoint used by normal resume.

## Model History Updated Shape

`model-history-updated` carries a provider-neutral model-history checkpoint:

- `conversation_ref`
- `revision_id`
- `checkpoint_id`
- `created_at`
- `rows[]` with canonical stored `role`, `message_type`, bounded `content`,
  optional tool linkage, optional artifact `image_refs`, and compaction facts

The SDK normalizes it to hidden `model_history_updated`, persists it through
`replaceModelHistory(...)`, and keeps it out of display and current rehydrate
projections. It must not carry raw screenshots, full display-only tool output,
or provider-specific prompt payloads.

## Debug Map

| Symptom | Check |
| --- | --- |
| backend produces event but websocket sends nothing | formatter spec, required fields, outgoing schema |
| DevTools shows event but UI ignores it | SDK typed event guard/projection, typed fan-out channel, or dedicated renderer parser |
| tool card renders but tool does not execute | SDK/main local-runtime tool router, `skip_local_execution` metadata, local-runtime bridge |
| event updates the wrong chat | `conversation_ref` and active transcript session state |
| token display absent | backend `token-count` event and renderer token-count handler |
| audio chunk ignored | `audio-chunk` parser, not `backendEvents.ts` typed union |

## Deep Docs

- [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md)
- [Streaming and Events](../concepts/streaming_and_events.md)
- Backend Streaming Events Contracts Hub (private backend docs)
- Streaming Event to Formatter and Outgoing Contract Alignment Reference (private backend docs)
- [Frontend Backend Event Consumer Matrix](../frontend/contracts/backend_event_consumer_matrix_reference.md)
- [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md)
