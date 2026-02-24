---
summary: "Backend SDK sub-agent helper reference for restricted tool registries, sub-session creation paths, model override helpers, and response extraction semantics."
read_when:
  - When wiring helper-driven sub-agents or restricting child tool surfaces.
  - When debugging helper-based response extraction, final-response fallback, or model override behavior for child sessions.
title: "Sub-Agent Session Helper Runtime Reference"
---

# Sub-Agent Session Helper Runtime Reference

## Canonical Modules

- `backend/src/core/services/agent_factory.py`
- `backend/src/sdk/agents/session_builder.py`
- `backend/src/sdk/agents/config_helper.py`
- `backend/src/sdk/agents/response_extractor.py`

## Restricted Tool Registry

`RestrictedToolRegistry` wraps parent `ToolRegistry` and filters access by `allowed_tools` set.

Behavior:

- `get_tool(name)` returns `None` if not allowed
- `get_function_declarations()` calls parent filtered declarations
- `is_tool_available(tool_name)` requires both allowlist match and parent availability
- `get_tool_capabilities(tool_name)` returns `None` if blocked
- `context_factory` is copied through for duck-typed compatibility with code expecting registry context factory access

## Sub-Session Creation Paths

Two similar helper paths exist.

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
  - `ocr_service`
  - `user_id`
- injects custom `system_prompt` into `sub_session.prompt_builder.system_prompt`

### `build_session(...)`

In `backend/src/sdk/agents/session_builder.py`:

- creates `RestrictedToolRegistry`
- creates sub-session id: `{parent_session_id}_sub_{uuid8}`
- overrides model id with `override_model_id(parent_session.cfg, model_id)`
- reuses parent `llm_client`, `tool_orchestrator`, `event_bus`, `ocr_service`
- creates child session via `parent_session.__class__(...)`
- sets `sub_session.prompt_builder.system_prompt`

Important difference:

- `AgentFactory.create_agent(...)` keeps parent config model selection.
- `build_session(...)` replaces `selected_model_id` in copied config.

## Model Override Helper

`override_model_id(config, model_id)` in `config_helper.py`:

1. `config.model_dump()`
2. set `selected_model_id = model_id`
3. revalidate via `config.__class__.model_validate(config_dict)`

This produces a new validated config object; parent config instance is not mutated.

## Response Extraction Runtime

`extract_response(...)` in `response_extractor.py` runs `session.process_query(...)` and accumulates output.

Typed event handling:

- `ChunkEvent`: append chunk text
- `FullResponseEvent`: use only when chunk accumulation is empty
- `ToolCallEvent`: optional capture (`collect_tool_calls=True`)
- `ToolOutputEvent`: observation-only for logging
- `StreamingCompleteEvent`: terminal stop
- `ErrorEvent`: return error string (or tuple with captured calls)

Compatibility path:

- dict event payloads are still handled by `type` key (`chunk`, `full_response`, `tool_call`, `tool_output`, `streaming-complete`, `error`)

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
- `build_session(...)` and `AgentFactory.create_agent(...)` may diverge if one path gets new constructor dependencies first.
- `extract_response(...)` silently tolerates dict-style legacy events; schema drift can hide until runtime behavior changes.

## Suggested Update Pattern

When changing `AgentSession` constructor deps or event classes:

1. update both session-creation helpers (`AgentFactory` and `build_session`)
2. verify restricted registry still exposes required methods used by agent runtime
3. update `extract_response(...)` typed handling and dict fallback in same commit
4. add/extend targeted backend tests for changed event/session behavior
