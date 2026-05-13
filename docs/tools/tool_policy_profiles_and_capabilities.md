---
summary: "WindieOS tool policy guide covering interaction allowlists, agent tool profiles, disabled tools/capabilities, coordinate methods, web-search exposure, browser gates, and validation."
read_when:
  - When a tool is unexpectedly hidden from the model or visible when it should be disabled.
  - When changing agent tool profiles, coordinate method gates, browser automation policy, web-search capability routing, or dev tool selection.
title: "Tool Policy Profiles and Capabilities"
---

# Tool Policy Profiles and Capabilities

Tool visibility is not just the static catalog. Backend `ToolPolicy` narrows tools before prompt construction and validates some method-level args during parsing/preparation.

## Policy Inputs

| Input | Owner | Effect |
| --- | --- | --- |
| interaction mode | backend session config | Can apply a broad allowlist for chat/agent behavior |
| `agent_tool_profile` | backend config/session/client capability | Selects a named profile such as `coding`, `browser`, `computer`, or `full` |
| `agent_available_tools` | websocket/client capability | Intersects model-visible tools with what the client can execute |
| `agent_disabled_tools` | config/session policy | Removes specific direct tools |
| `agent_disabled_capabilities` | config/session policy | Removes capability families such as `browser`, `web_search`, `ocr`, or `vision` |
| `agent_provider_unavailable_capabilities` | provider health policy | Removes capabilities known unavailable before prompt construction |
| `agent_coordinate_methods` | config/session policy | Narrows mouse/scroll coordinate methods |
| `agent_available_coordinate_methods` | websocket/client capability | Intersects server policy with client-supported coordinate methods |
| dev tool selection | local development config | Optional local structural pruning layer |
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

Profile tools are still narrowed by available tools, disabled tools, disabled capabilities, provider health, and dev selection.

## Capability Gates

### Browser

`browser` is hidden when browser automation is disabled or the `browser` capability is disabled/unavailable.

Check:

- `browser_automation_enabled`
- `agent_disabled_capabilities`
- `agent_provider_unavailable_capabilities`
- client `agent_available_tools`
- sidecar registry contains `browser`

### Web Search

`web_search` is backend/provider-owned and is not a sidecar executable tool.

Exposure requires at least one valid route:

- OpenAI model with native web search support
- Gemini model with native Google Search grounding support
- Brave fallback with `BRAVE_SEARCH_API_KEY`

Explicit policy or provider-health state can hide it even if a provider would normally support it.

### OCR and Vision

Coordinate methods are canonicalized in this order:

- `manual`
- `ocr`
- `prediction`

Disabled capabilities affect methods:

- disabled `ocr` removes OCR coordinate targeting
- disabled `vision` removes prediction coordinate targeting

If no coordinate methods remain for `mouse_control`, the tool is effectively disabled by policy.

## Method-Level Validation

`ToolPolicy.get_method_validation_errors()` currently applies method validation to `mouse_control`.

Validated fields:

- `find_coordinates_by`
- `drag_to_find_coordinates_by`

If the model asks for a disabled coordinate method, backend returns a parser/preparation validation error instead of letting a hidden capability leak into sidecar execution.

## Debugging Hidden Tools

Use this order:

1. Confirm the tool exists in `backend/src/tools/tool_catalog.py`.
2. Confirm the tool is model-visible in the catalog.
3. Check `ToolPolicy.filter_tool_names()` for disabled tools and interaction allowlist.
4. Check `agent_tool_profile`.
5. Check `agent_available_tools` from the websocket handshake.
6. Check disabled capabilities and provider-unavailable capabilities.
7. Check dev tool selection.
8. Check provider projection if the provider adds native declarations.
9. If local execution is expected, confirm sidecar `EXPOSED_TO_BACKEND_TOOL_NAMES` and registry registration.

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
- `tests/backend/test_dev_tool_selection.py`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_web_search_tool.py`

Sidecar:

- `tests/sidecar/test_tool_registry.py`
- `tests/sidecar/test_shared_tool_schema_parity.py`

Frontend:

- websocket handshake/client-capability tests
- tool-runner tests when renderer-visible behavior changes
