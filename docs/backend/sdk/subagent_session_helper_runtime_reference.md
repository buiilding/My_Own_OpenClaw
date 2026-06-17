---
summary: "Backend SDK sub-agent helper reference for restricted tool registries, AgentFactory sub-session creation, and response extraction semantics."
read_when:
  - When wiring helper-driven sub-agents or restricting child tool surfaces.
  - When debugging helper-based response extraction, final-response fallback, or model override behavior for child sessions.
title: "Sub-Agent Session Helper Runtime Reference"
---

# Sub-Agent Session Helper Runtime Reference

## Canonical Modules

- `backend/src/core/services/agent_factory.py`
- `backend/src/sdk/agents/response_extractor.py`

## Restricted Tool Registry

`RestrictedToolRegistry` wraps parent `ToolRegistry` and filters access by `allowed_tools` set.

Behavior:

- `get_tool(name)` returns `None` if not allowed
- `get_function_declarations()` calls parent filtered declarations
- `is_tool_available(tool_name)` requires both allowlist match and parent availability
- `get_tool_capabilities(tool_name)` returns `None` if blocked
- `context_factory` is copied through because tool sender/orchestrator paths read it from the session tool registry

## Sub-Session Creation Path

### `AgentFactory.create_agent(...)`

In `backend/src/core/services/agent_factory.py`:

- creates `RestrictedToolRegistry`
- creates sub-session id: `{parent_session_id}_{name}_{uuid8}`
- reuses parent resources:
  - `cfg`
  - `llm_client`
  - `llm_client_factory`
  - `tool_orchestrator`
  - `event_bus`
  - `ocr_router`
  - `user_id`
- injects custom `system_prompt` into `sub_session.prompt_builder.system_prompt`

## Response Extraction Runtime

`extract_response(...)` in `response_extractor.py` runs `session.process_query(...)` and accumulates output.

Typed event handling:

- `ChunkEvent`: append chunk text
- `FullResponseEvent`: use only when chunk accumulation is empty
- `ToolCallEvent`: optional capture (`collect_tool_calls=True`)
- `ToolOutputEvent`: observation-only for logging
- `StreamingCompleteEvent`: terminal stop
- `ErrorEvent`: return error string (or tuple with captured calls)

Runtime path:

- response extraction accepts typed streaming events from `AgentSession.process_query(...)`

Fallback behavior when no response text arrived from events:

- scans `session.history.get_history()` in reverse
- extracts last assistant message
- for multimodal list content, concatenates text parts where `type == ContentType.TEXT.value`

Return type:

- default: `str`
- with `collect_tool_calls=True`: `tuple[str, list[dict]]`

Default no-text fallback message:

- `"Agent finished without a response."`

## Practical Risks and Drift Points

- Child registry allowlist that omits required tools can dead-end agent loops.
- `AgentFactory.create_agent(...)` must receive new `AgentSession` constructor dependencies when the session contract changes.
- `extract_response(...)` handles typed streaming event classes; schema drift should fail in tests instead of being masked by shape-tolerant parsing.

## Suggested Update Pattern

When changing `AgentSession` constructor deps or event classes:

1. update `AgentFactory.create_agent(...)`
2. verify restricted registry still exposes required methods used by agent runtime
3. update `extract_response(...)` typed handling in the same commit
4. add/extend targeted backend tests for changed event/session behavior
