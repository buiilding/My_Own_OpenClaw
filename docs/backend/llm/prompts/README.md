---
summary: "Backend LLM prompt docs sub-hub for prompt-constructor trust boundary behavior, transparency metadata emission, and system-prompt manager lifecycle."
read_when:
  - When changing prompt construction or transparency metadata emission for frontend `system-prompt`/`user-message-full`/`tool-schemas` events.
  - When changing system prompt loading/initialization behavior or custom prompt injection for sub-agent sessions.
title: "Backend LLM Prompt Docs Hub"
---

# Backend LLM Prompt Docs Hub

## Deep Pages

- [Prompt Constructor and Transparency Metadata Reference](prompt_constructor_and_transparency_metadata_reference.md)
- [Prompt Manager and System Prompt Lifecycle Reference](prompt_manager_and_system_prompt_lifecycle_reference.md)

## Code Scope

- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/llm/prompts/prompt_metadata.py`
- `backend/src/llm/prompts/prompts.py`
- `backend/src/llm/prompts/system_prompt.txt`
- `backend/src/agent/llm/conversation_context.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/session/initializer.py`
- `backend/src/sdk/agents/session_builder.py`
- `backend/src/core/services/agent_factory.py`
- `tests/backend/test_prompt_constructor_utils.py`
- `tests/backend/test_prompt_manager.py`
- `tests/backend/test_session_initializer.py`
