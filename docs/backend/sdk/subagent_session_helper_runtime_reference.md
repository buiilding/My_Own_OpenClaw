---
summary: "Backend SDK sub-agent helper reference for restricted tool registries and AgentFactory sub-session creation."
read_when:
  - When wiring helper-driven sub-agents or restricting child tool surfaces.
  - When debugging model override behavior for child sessions.
title: "Sub-Agent Session Helper Runtime Reference"
---

# Sub-Agent Session Helper Runtime Reference

## Canonical Modules

- `backend/src/core/services/agent_factory.py`

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

## Response Extraction

The unused SDK response-extractor helper has been removed. Callers that need a
child-session result should consume the typed `AgentSession.process_query(...)`
event stream or conversation history directly in the owning runtime instead of
reintroducing a second output extraction policy.

## Practical Risks and Drift Points

- Child registry allowlist that omits required tools can dead-end agent loops.
- `AgentFactory.create_agent(...)` must receive new `AgentSession` constructor dependencies when the session contract changes.
- Response extraction policy belongs to the runtime consuming the child session;
  do not restore a backend SDK wrapper that drifts from live stream semantics.

## Suggested Update Pattern

When changing `AgentSession` constructor deps or event classes:

1. update `AgentFactory.create_agent(...)`
2. verify restricted registry still exposes required methods used by agent runtime
3. add/extend targeted backend tests for changed event/session behavior
