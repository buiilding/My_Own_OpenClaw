---
summary: "Deep reference for agent prompt-context and presentation internals: iteration-aware prompt caching, first-turn prompt metadata emission, tool-schema validation, and frontend transparency event ordering."
read_when:
  - When changing `ConversationContext.get_prompt` caching behavior or prompt metadata lifetime.
  - When changing `EventPresenter` prompt-transparency event payloads (`system-prompt`, `user-message-full`, `tool-schemas`).
title: "Conversation Context and Event Presenter Prompt-Metadata Reference"
---

# Conversation Context and Event Presenter Prompt-Metadata Reference

## Canonical Modules

- `backend/src/agent/llm/conversation_context.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_interaction_loop.py`

## Responsibility Split

`ConversationContext`:

- builds and caches prompt inputs for interaction-loop iterations
- returns prompt messages + tool schemas + prompt metadata tuple
- no event emission

`EventPresenter`:

- emits frontend-facing transparency and completion/error events
- validates tool-schema transparency payload shape
- no business-flow decisions

## Iteration-Aware Prompt Retrieval

`ConversationContext.get_prompt(iteration)` behavior:

- iteration 1:
- calls `prompt_builder.build_prompt(stored_messages=history, include_tools=True)`
- caches `tool_schemas` and `PromptMetadata`
- returns freshly built prompt + metadata
- iteration > 1:
- returns `history.get_history()` (cached conversation retrieval path)
- reuses cached tool schemas and metadata from first iteration

Timing logging:

- prompt build time always logged on iteration 1
- subsequent history retrieval time logged only when > 1ms

## First-Turn Transparency Event Ordering

`InteractionLoop.run_loop()` emits prompt transparency events only when `iteration == 1` and metadata exists.

`EventPresenter.present_prompt_metadata(...)` sequence:

1. `SystemPromptEvent`
2. optional `UserMessageFullEvent` (when user metadata exists)
3. optional `ToolSchemasEvent` (when tool schemas provided)

This yields one deterministic transparency block before LLM stream events.

## Tool Schema Validation Contract

Before emitting `ToolSchemasEvent`, presenter enforces canonical schema shape:

- root is list
- each item is object with `type == "function"`
- each has `function` object
- `function.name` non-empty string
- `function.parameters` object

Invalid schema raises `ValueError` immediately.

## Assistant/Completion/Error Presentation

Presenter helpers map one-to-one to stream events:

- `present_assistant_message(content)` -> `AssistantMessageFullEvent`
- `present_completion(final_response)` -> `StreamingCompleteEvent`
- `present_error(error_message)` -> `ErrorEvent`

`TokenCountEvent` is intentionally not emitted by presenter; LLM stream processor owns it.

## Interaction-Loop Coupling Points

- presenter prompt metadata is called only first iteration
- assistant message event is emitted after normalized LLM parse before tool/final branch
- completion/error presenter helpers are the loop’s user-facing terminal event path

If prompt metadata is missing, loop continues normally without transparency prelude events.

## Drift Hotspots

1. changing first-iteration-only metadata emission can duplicate system/user/tool-schema transparency across turns.
2. weakening tool-schema validation can allow malformed transparency payloads that diverge from frontend schema contracts.
3. returning uncached tool schemas/metadata after iteration 1 can desynchronize tool availability assumptions mid-loop.
4. mixing token-count emission into presenter can duplicate token events and break formatter expectations.

## Related Pages

- [Backend Agent LLM Docs Hub](README.md)
- [LLM Stream Processor Token Count and Cache Diagnostics Reference](llm_stream_processor_token_count_and_cache_diagnostics_reference.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](../interaction_loop_and_tool_turn_orchestration_reference.md)
