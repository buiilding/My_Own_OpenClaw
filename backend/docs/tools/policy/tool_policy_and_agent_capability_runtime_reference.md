---
summary: "Deep backend reference for ToolPolicy and agent capability selection: profile precedence, removed dev TOML tool-selection config, mouse method schema pruning, parser validation, and startup OCR/vision gating."
read_when:
  - When changing backend tool policy rules, agent tool profiles, or coordinate-method gates.
  - When debugging tool whitelist errors, mouse method denial messages, or startup OCR/vision unexpectedly enabled or skipped.
  - When searching for removed `WINDIEOS_DEV_TOOL_SELECTION_PATH`, `backend/dev/tool_selection.toml`, or dev tool_selection TOML behavior.
title: "Tool Policy and Agent Capability Runtime Reference"
---

# Tool Policy and Agent Capability Runtime Reference

This page documents policy behavior implemented in:

- `backend/src/tools/agent_capability_policy.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/llm/parser_validation.py`
- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/core/container/initializer.py`
- `tests/backend/test_tool_policy.py`
- `tests/backend/test_tool_selection.py`

## Policy Layers and Precedence

Tool exposure filtering is layered in this order:

1. config-driven hard disables (`ToolPolicy._get_config_disabled_tools()`)
2. interaction-mode allowlist from runtime config (`config.get_tool_allowlist()`)
3. session/server agent capability policy from typed `AppConfig` fields

`ToolPolicy.filter_tool_names(...)` and `ToolPolicy.filter_tool_schemas(...)`
apply those gates in that order. Tool-name filtering is direct-name only:
callers pass canonical model-visible tool names, and policy does not normalize
old wrapper names into executable tool names.

Practical effect:

- interaction-mode restrictions always apply
- config hard-disables always apply before allowlist or capability filtering
- agent capability policy narrows what remains per effective user/session config

Current config hard-disable:

- `agent_disabled_tools` removes matching direct tool names.
- `agent_disabled_capabilities=["browser"]` removes `browser`.
- `agent_disabled_capabilities=["web_search"]` removes backend logical `web_search`.

## Removed Dev Tool Selection Config

The backend no longer loads dev TOML tool-selection config from
`backend/dev/tool_selection.toml` or `WINDIEOS_DEV_TOOL_SELECTION_PATH`.
Searches for removed backend dev `tool_selection` TOML behavior should route to
this page because the replacement path is typed agent capability policy on the
effective `AppConfig`, with `ToolSelection` used only as the in-memory structural
value object.

## Agent Capability Policy

Agent capability policy is the backend-owned production path for changing what
the model can see without restarting the backend.

Typed config fields:

- `agent_tool_profile`: `default`, `chat`, `coding`, `browser`, `computer`, `full`, or `custom`
- `agent_disabled_tools`: direct tool names to remove
- `agent_available_tools`: optional client/session tool availability list; when supplied, policy intersects it with profile/server restrictions
- `agent_coordinate_methods`: optional allowed coordinate methods (`manual`, `ocr`, `prediction`)
- `agent_available_coordinate_methods`: optional client/session coordinate-method availability list; when supplied, policy intersects it with requested/server coordinate restrictions
- `agent_disabled_capabilities`: capability gates (`ocr`, `vision`, `embeddings`, `web_search`, `browser`)
- `agent_provider_unavailable_capabilities`: backend-computed capability gates for providers known unavailable before prompt construction

Profile behavior:

- `default` preserves existing `interaction_mode` plus `tool_allowlist` behavior.
- `chat`, `coding`, `browser`, `computer`, and `full` apply built-in allowlists from `backend/src/tools/agent_capability_policy.py`.
- `custom` does not add a built-in allowlist; use `tool_allowlist` or `agent_disabled_tools` to shape it.

Coordinate/capability behavior:

- `agent_coordinate_methods=["manual"]` prunes OCR and prediction fields from grounded desktop schemas.
- `agent_available_coordinate_methods=["manual"]` also prunes OCR and prediction fields for that session, even if the server default allows them.
- `agent_disabled_capabilities=["ocr"]` removes OCR coordinate fields and rejects OCR method calls.
- `agent_disabled_capabilities=["vision"]` removes prediction coordinate fields and rejects prediction method calls.
- `agent_provider_unavailable_capabilities=["ocr", "vision"]` has the same prompt/schema effect as explicit disables, but is computed from backend provider health instead of user/session preference.

The WebSocket handshake can populate `agent_available_tools` and
`agent_available_coordinate_methods` from the canonical `agent_definition`
object before the first query. Agent-definition runtime coordinate methods map
to `agent_available_coordinate_methods` because they describe client/session
availability. The removed top-level handshake capability fields are rejected.
These client-provided fields are narrowing inputs only; they do not override
backend hard-disables.

Provider-health gates are also narrowing inputs. The container-backed session
manager resolves known OCR, vision, embeddings, and web-search availability when
building effective session config:

- missing/disabled OCR provider -> `ocr`
- missing, failed, or uninitialized vision provider -> `vision`
- disabled/missing embedding provider -> `embeddings`
- no native web-search mode and no Brave fallback -> `web_search`

This layer intentionally reuses `ToolSelection` as its structural value object
so prompt schema filtering, parser validation, projected-schema pruning, and
available-tool listing stay aligned.

## ToolSelection Value Object

`ToolSelection` is the in-memory value object built by agent capability policy
from effective `AppConfig`.

Fields:

- `enabled`
- `mode` (`allowlist` or `denylist`)
- `tools` (name set)
- `mouse_enabled_coordinate_methods` (`manual|ocr|prediction`, optional)

Top-level rules:

- `enabled=false` makes the selection transparent
- allowlist keeps only named tools
- denylist removes named tools

## Mouse Method Semantics

Mouse policy has method-level controls beyond tool name visibility.

`get_allowed_mouse_coordinate_methods()` behavior:

- if `mouse_control` is disabled by top-level selection mode, returns an empty set
- if enabled and no per-method list is configured, all methods are allowed
- if an explicit method list is configured, only those methods are allowed

If allowed method set is empty:

- `mouse_control` is effectively removed from filtered tool names/schemas

## Schema Pruning for Mouse Methods

`ToolSelection.filter_tool_schemas(...)` performs deep schema edits for grounded
desktop schemas that share the coordinate-method contract.

Field/enum pruning behavior:

- narrows `find_coordinates_by.enum` to allowed methods, preserving canonical order (`manual`, `ocr`, `prediction`)
- narrows `drag_to_find_coordinates_by.enum` the same way for drag-capable grounded schemas
- adjusts default method if current default is disallowed
- removes method-specific fields when corresponding method disabled:
  - `manual` disabled -> remove `x`, `y`
  - `ocr` disabled -> remove `ocr_text`
  - `prediction` disabled -> remove `source_description`, `model_name`
- removes matching JSON Schema conditional branches so disabled method names do not remain in `allOf`
- preserves canonical field and tool descriptions; `ToolSelection` does not rewrite prose

Current grounded schema coverage:

- `mouse_control`
- `scroll_control`
- `grounded_mouse_action`
- `grounded_scroll_action`

## Parsing-Time Validation Coupling

`ToolCallValidator` composes policy in parser trust-boundary validation.

Validation flow:

1. compute valid tool-name index from registry names filtered via `ToolPolicy.filter_tool_names(...)`
2. reject tool names outside filtered set with whitelist error message
3. for `mouse_control`, call `ToolPolicy.get_method_validation_errors(...)`
4. reject disallowed source or drag-destination methods with explicit allowed-method list in error

Method normalization:

- `find_coordinates_by` values are normalized via `normalize_coordinate_method(...)`
- `drag_to_find_coordinates_by` values are normalized through the same path
- enum instances and mixed-case strings are normalized to lowercase strings

The valid tool-name cache is stable for the validator lifetime because policy is
constructed from immutable effective config at validator construction time.

## Prompt Injection Coupling

`PromptConstructor._get_filtered_tool_schemas()` no longer filters final wrapper
schemas directly.

Current flow:

1. read model-visible tool names from `ToolRegistry.get_model_tool_names()`
2. apply `ToolPolicy.filter_tool_names(...)` to that direct-tool list
3. hand the filtered list back to `ToolRegistry.get_function_declarations_filtered(...)`
4. apply `ToolPolicy.filter_tool_schemas(...)` to the returned direct function schemas
5. run provider projection
6. apply selection-only post-projection pruning for projected grounded helper schemas

Result:

- LLM only sees policy-filtered tool schemas
- prompt injection no longer depends on a separate schema-source helper path
- grounded desktop schemas the LLM receives are pruned when policy disables OCR or prediction, including provider-projected grounded helpers

## Available-Tools Listing Coupling

Tool capability metadata is read from `ToolRegistry.get_tool_capabilities(...)`
at the callers that need it; policy filtering remains at prompt construction,
parser validation, provider projection, and startup-gating boundaries.

Result:

- API/runtime available-tool lists align with prompt-injected schema visibility

## Startup Service Gating Coupling

`ContainerInitializer` startup gates OCR and vision pre-initialization with policy:

- `ToolPolicy.should_initialize_ocr()` -> true only when OCR mouse method remains allowed
- `ToolPolicy.should_initialize_vision()` -> true only when prediction mouse method remains allowed

When disabled:

- OCR startup initialization is skipped and service can be marked disabled
- vision startup model preload is skipped

This keeps startup cost aligned with currently enabled coordinate methods.

## System Prompt Coupling

`PromptManager.render_system_prompt(...)` strips OCR/prediction sections from the
rendered prompt template using the effective coordinate-method policy when one
is provided. Without explicit coordinate methods, static prompt rendering keeps
both sections because there is no runtime policy context to apply.

Result:

- runtime system prompts no longer reference disabled OCR/prediction-only guidance
- prompt transparency stays aligned with the filtered model-facing tool surface

## Test-Backed Invariants

From `test_tool_policy.py` and `test_tool_selection.py`:

- interaction-mode allowlist filtering works independently
- agent selection allowlist/denylist filtering works
- mouse method schema field pruning works
- disabled method calls produce parser validation errors
- empty mouse method list effectively disables mouse tool
- OCR/vision startup helpers reflect allowed methods
- parser valid-tool caches are stable after policy construction

## Related Docs

- [Local-Runtime Tool Bridge and Policy](../local_runtime_tool_bridge_and_policy.md)
- [Tool Security Policy Reference](../tool_security_policy_and_executor_reference.md)
