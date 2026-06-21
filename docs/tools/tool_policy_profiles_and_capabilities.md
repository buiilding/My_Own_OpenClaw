---
summary: "Tool policy guide covering interaction allowlists, agent tool profiles, disabled tools/capabilities, coordinate methods, web-search exposure, browser capability policy, and validation."
read_when:
  - When a tool is unexpectedly hidden from the model or visible when it should be disabled.
  - When changing agent tool profiles, coordinate method gates, browser automation policy, or web-search capability routing.
title: "Tool Policy Profiles and Capabilities"
---

# Tool Policy Profiles and Capabilities

Tool visibility is not just the static catalog. Backend `ToolPolicy` narrows tools before prompt construction and validates some method-level args during parsing/preparation.

## Policy Inputs

| Input | Owner | Effect |
| --- | --- | --- |
| interaction mode | backend session config | Can apply a broad allowlist for chat/agent behavior |
| `agent_tool_profile` | backend config/session policy | Selects a named profile such as `coding`, `browser`, `computer`, or `full` |
| `agent_available_tools` | websocket `agent_definition.tools` or session config | Intersects model-visible tools with what the client can execute |
| `agent_disabled_tools` | config/session policy | Removes specific direct tools |
| `agent_disabled_capabilities` | config/session policy | Removes capability families such as `browser`, `web_search`, `ocr`, or `vision` |
| `agent_provider_unavailable_capabilities` | provider health policy | Removes capabilities known unavailable before prompt construction |
| `agent_coordinate_methods` | config/session policy | Narrows mouse/scroll coordinate methods |
| `agent_available_coordinate_methods` | specialized websocket `agent_definition.runtime` or session config | Optional narrowing input for clients that truly lack a coordinate method; Electron does not send it |
| provider projection | backend provider layer | May add or adapt provider-native declarations after canonical filtering |

Primary files:

- `backend/src/tools/tool_policy.py`
- `backend/src/tools/agent_capability_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/tools/provider_health.py`
- `backend/src/tools/provider_projection.py`

## Built-In Profiles

| Profile | Tools |
| --- | --- |
| `chat` | `open_app`, `process`, `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`, `run_shell_command`, `replace`, `read_file`, `get_system_stats`, `get_open_windows`, `web_search` |
| `coding` | `run_shell_command`, `process`, `read_file`, `replace`, `screenshot` |
| `browser` | `browser`, `run_shell_command` |
| `computer` | `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`, `get_open_windows`, `get_system_stats`, `run_shell_command` |
| `full` | `browser`, `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`, `get_open_windows`, `get_system_stats`, `run_shell_command`, `open_app`, `process`, `read_file`, `replace`, `web_search` |
| `default` or `custom` | no profile allowlist by itself |

Profile tools are still narrowed by available tools, disabled tools, disabled capabilities, and provider health.
Provider projection reuses `ToolPolicy.from_config(...)`, so direct calls to
`project_tool_schemas_for_provider(...)` cannot bypass those config-driven
tool availability and disabled-tool gates.
Provider-health gates accept readiness as either boolean attributes or zero-arg
methods such as `is_ready()` and `is_initialized()`; readiness exceptions are
treated as unavailable.

## Capability Gates

### Browser

`browser` follows the same model-visible policy path as other client/local-runtime tools: it must be present in the accepted client manifest or backend catalog, and it can be narrowed by profiles, available tools, disabled tools, disabled capabilities, or provider-unavailable capabilities.

Check:

- `agent_disabled_capabilities`
- `agent_provider_unavailable_capabilities`
- client `agent_available_tools`
- local-runtime executable registry contains `browser`

### Web Search

`web_search` is backend/provider-owned and is not a local-runtime executable tool.
For the detailed execution-mode and result contract, start with
[Web Search Tool](web_search.md).

Exposure requires at least one valid route:

- OpenAI model with native web search support
- Gemini model with native Google Search grounding support
- Brave fallback with `BRAVE_SEARCH_API_KEY`

Explicit policy or provider-health state can hide it even if a provider would normally support it.
Direct `WebSearchTool.run(...)` execution must enforce the same disabled-capability
policy before resolving the Brave API key, so stale registries cannot bypass
`agent_disabled_capabilities=["web_search"]`.

### OCR and Vision

Coordinate methods are canonicalized in this order:

- `manual`
- `ocr`
- `prediction`

Disabled capabilities affect methods:

- disabled `ocr` removes OCR coordinate targeting
- disabled `vision` removes prediction coordinate targeting

If no coordinate methods remain for `mouse_control`, the tool is effectively disabled by policy.

Electron does not advertise local coordinate-method availability. OCR, vision,
and prediction availability is resolved by backend policy, provider health, and
server-side capability gates. Client-provided coordinate fields are narrowing
inputs only and must not be treated as a way to unlock backend capabilities.

## Method-Level Validation

`ToolPolicy.get_method_validation_errors()` currently applies method validation to `mouse_control`.

Validated fields:

- `find_coordinates_by`
- `drag_to_find_coordinates_by`

If the model asks for a disabled coordinate method, backend returns a method-policy preparation error instead of letting a hidden capability leak into local execution.

## Debugging Hidden Tools

Use this order:

1. Confirm the tool exists in `backend/src/tools/tool_catalog.py`.
2. Confirm the tool is model-visible in the catalog.
3. Check `ToolPolicy.filter_tool_names()` for disabled tools and interaction allowlist.
4. Check `agent_tool_profile`.
5. Check `agent_available_tools` derived from websocket
   `agent_definition.tools` and the accepted client manifest.
6. Check disabled capabilities and provider-unavailable capabilities.
7. Check provider projection if the provider adds native declarations.
8. If local execution is expected, confirm the local-runtime built-in tool set
   (`LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`) and executable registry registration.

## Debugging Unexpectedly Visible Tools

Use this order:

1. Check whether `default` or `custom` profile leaves the full catalog available.
2. Check whether the client omitted `agent_available_tools`.
3. Check whether disabled capability names match policy names exactly.
4. Check whether provider projection preserved a non-function provider-native declaration.
5. Check tests for the specific profile or capability combination before changing policy code.

## Validation Targets

Backend:

- `tests/backend/test_tool_policy.py`
- `tests/backend/test_tool_selection.py`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_web_search_tool.py`

Local runtime / local-runtime Python implementation:

- `tests/sidecar/test_tool_registry.py`
- `tests/sidecar/test_shared_tool_schema_parity.py`

Frontend:

- websocket `agent_definition`/SDK runtime tests
- SDK/local-runtime tool projection tests when renderer-visible behavior changes
