---
summary: "Backend agent LLM docs sub-hub for prompt-context caching, prompt-metadata event presentation, streaming response aggregation, and token/cache diagnostics emission."
read_when:
  - When changing `backend/src/agent/llm/*` classes or their interaction-loop wiring.
  - When debugging missing prompt transparency events, malformed stream-event handling, or token-count/cached-token diagnostics drift.
title: "Backend Agent LLM Docs Hub"
---

# Backend Agent LLM Docs Hub

## Deep Pages

- [Conversation Context and Event Presenter Prompt-Metadata Reference](conversation_context_and_event_presenter_prompt_metadata_reference.md)
- [LLM Stream Processor Token Count and Cache Diagnostics Reference](llm_stream_processor_token_count_and_cache_diagnostics_reference.md)

## Related Pages

- [Backend Agent Docs Hub](../README.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](../interaction_loop_and_tool_turn_orchestration_reference.md)
- [Prompt Constructor and Transparency Metadata Reference](../../llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
- [Token Count Event and Usage Diagnostics Reference](../../runtime/token_count_event_and_usage_diagnostics_reference.md)

## Code Scope

- `backend/src/agent/llm/conversation_context.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/llm/token_counting.py`
- `backend/src/agent/execution/interaction_loop.py`
- `tests/backend/test_llm_stream_processor.py`
- `tests/backend/test_interaction_loop.py`
