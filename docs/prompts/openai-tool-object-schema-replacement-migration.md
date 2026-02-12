---
summary: "Orchestrator guide to replace WindieOS tool schema shape with canonical OpenAI/LiteLLM tool objects."
read_when:
  - When replacing `{name, description, parameters}` tool schema objects with OpenAI/LiteLLM `tools[]` objects.
  - When coordinating this replacement across multiple coding agents.
---

# OpenAI Tool Object Schema Replacement Migration (WindieOS)

## Goal

Replace current function-payload schema shape:
- `{name, description, parameters}`

With canonical provider-facing tool object shape everywhere:
- `{type: "function", function: {name, description, parameters}}`

No additive dual-shape architecture. Full replacement across runtime-critical paths.

## Problem Statement

Current schema source emits function payload shape, then LLM transport adapts ad-hoc.
This creates contract drift and provider-specific bugs (example: LiteLLM Anthropic/Kimi path expects `tool["type"]` and crashes with `KeyError: 'type'` when missing).

Root fix is not boundary patching; root fix is single canonical schema contract at source.

## Decision (Strict)

1. Canonical internal tool schema shape becomes OpenAI/LiteLLM tool object (`type=function`, nested `function`).
2. Tool schema producers emit canonical shape directly.
3. LLM transport consumes canonical shape directly (no shape conversion logic in provider boundary).
4. Transparency/event payloads are updated to reflect new shape (replace, not parallel legacy shape).
5. Parser-era/legacy assertions for top-level `name` shape are removed or rewritten.

Hard rules:
- No compatibility dual-shape contract in runtime-critical code.
- No silent fallback from canonical shape to legacy shape.
- Validate shape early; fail clearly.

## Source Pack (Read First)

- LiteLLM function calling:
  - https://docs.litellm.ai/docs/completion/function_call
- LiteLLM Anthropic provider params/translation:
  - https://docs.litellm.ai/docs/providers/anthropic
- OpenAI function-calling:
  - https://platform.openai.com/docs/guides/function-calling
- Anthropic tool use semantics (ordering constraints):
  - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use

### Web Research Gate (Mandatory Before Coding, All Agents)

Before implementation, each agent:
1. Reads Source Pack links.
2. Records schema contract notes in handoff:
   - exact request shape for `tools[]` entries (`type`, nested `function`)
   - `tool_choice` semantics for targeted providers
3. Notes provider caveats that could break strict replacement.

## Agent Count

Use **6 agents**.

Why 6:
- One contract pass to freeze replacement scope.
- One schema-source pass to replace generation.
- Two parallel passes for runtime consumers (LLM + transparency/events).
- One test/doc migration pass.
- One final integration/QA pass.

## Execution Graph

1. Agent 1 (sequential, first)
2. Agent 2 (sequential, depends on Agent 1)
3. Agent 3 + Agent 4 (parallel, both depend on Agent 2)
4. Agent 5 (sequential, depends on Agent 3+4)
5. Agent 6 (sequential final integrator/QA)

Parallel window:
- Only **Agent 3 and Agent 4** run concurrently.

## Agent 1: Contract Freeze + Type Definitions (Sequential)

### Mission

Define canonical schema type contract and replacement boundaries.

### Own These Files

- `backend/src/core/types/schemas.py`
- `docs/LLM_INTEGRATION.md`
- `docs/TOOL_SYSTEM.md`

### Tasks

1. Add explicit typed alias/model for canonical tool object:
   - `type: Literal["function"]`
   - nested `function.{name, description?, parameters}`
2. Update docs to declare old top-level shape deprecated/removed.
3. Define where this canonical type is required (registry/prompt metadata/events/providers).

### Out of Scope

- No schema generation logic changes.
- No provider/runtime behavior changes.

### Done Criteria

- One documented canonical contract that downstream agents implement directly.

### Status

- `COMPLETE` on 2026-02-12.
- Files changed:
  - `backend/src/core/types/schemas.py`
  - `backend/src/core/types/__init__.py`
  - `docs/LLM_INTEGRATION.md`
  - `docs/TOOL_SYSTEM.md`
  - `docs/prompts/openai-tool-object-schema-replacement-migration.md`
- Behavior delta:
  - Added canonical typed contract:
    - `ToolSchema = {type: "function", function: {name, description?, parameters}}`
    - `ToolFunctionSchema` exported in `backend/src/core/types/__init__.py`.
  - Updated docs to declare strict replacement of legacy top-level tool schema shape (`{name, description, parameters}`) in runtime-critical paths.
  - Documented canonical-shape required boundaries: registry/schema source, LLM transport params, transparency/events, provider boundary validation.
- Tests run + results:
  - `./scripts/python-in-env backend python -m py_compile backend/src/core/types/schemas.py backend/src/core/types/__init__.py`
  - Result: pass.
- Risks left:
  - Runtime schema producers/consumers are not switched yet; legacy shape assumptions still exist outside Agent 1 ownership and must be removed by downstream agents.

### Agent 1 -> Agent 2 Handoff

- Treat `ToolSchema` in `backend/src/core/types/schemas.py` as the canonical runtime contract; do not emit legacy top-level `name/description/parameters` objects.
- Update schema generation and policy/filtering to read/write nested `tool["function"]["parameters"]`.
- Keep strict replacement behavior: no dual-shape fallback in runtime-critical paths.

### Agent 1 Source Pack Evidence (Read Before Coding)

- LiteLLM function-calling docs: canonical `tools[]` entries include `type: "function"` with nested `function` object; `tool_choice` is sent as request param.
- LiteLLM Anthropic provider docs: provider supports `tools`, `tool_choice`, and `parallel_tool_calls` in translated path.
- OpenAI function-calling docs: `tool_choice` semantics include `auto`, `required`, `none`, and forced function object.
- Anthropic tool-use docs: follow-up ordering constraint still applies (`tool_result` blocks must directly follow prior `tool_use` chain), so schema replacement must not break message-order logic downstream.

## Agent 2: Schema Source Replacement (Sequential)

### Mission

Replace tool schema creation path to emit canonical OpenAI/LiteLLM tool object.

### Own These Files

- `backend/src/sdk/tool.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/registry.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`

### Tasks

1. Change schema creation to output canonical tool object directly.
2. Update filtering/policy logic to operate on nested `function.parameters`.
3. Remove legacy top-level `name/parameters` assumptions.
4. Keep method-level mouse filtering behavior intact under new path.

### Out of Scope

- No provider error-mapping changes.
- No frontend formatting changes.

### Done Criteria

- `ToolRegistry.get_function_declarations*()` returns canonical tool objects only.
- No legacy shape consumers remain in owned files.

### Status

- `PENDING`

## Agent 3: LLM Transport Simplification (Parallel after Agent 2)

### Mission

Consume canonical tools directly in provider path; remove schema-shape adapters.

### Own These Files

- `backend/src/llm/client.py`
- `backend/src/llm/providers/base.py`
- `backend/src/llm/providers/openai.py`
- `backend/src/llm/providers/anthropic.py`
- `backend/src/llm/providers/kimi_coding.py`
- `backend/src/llm/providers/gemini.py`
- `backend/src/llm/providers/openrouter.py`
- `backend/src/llm/providers/mistral.py`
- `backend/src/llm/providers/local.py`

### Tasks

1. Remove shape-conversion adapters in provider boundary.
2. Validate canonical tool object shape and fail fast with actionable errors.
3. Ensure `tools`, `tool_choice`, `parallel_tool_calls` forwarding remains unchanged.
4. Verify Kimi/Anthropic path no longer throws `KeyError: 'type'`.

### Out of Scope

- No frontend event payload changes.

### Done Criteria

- Transport path expects/uses canonical tools only.
- Provider tests cover invalid/missing `type` and nested function fields.

### Status

- `PENDING`

## Agent 4: Transparency/Event Contract Replacement (Parallel after Agent 2)

### Mission

Replace tool-schema transparency payload consumers to canonical tool object.

### Own These Files

- `backend/src/core/events/streaming_events.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/api/processing/formatters/tool_schemas.py`
- `backend/src/api/schemas/outgoing.py`
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/messageTransparency.js`

### Tasks

1. Update event payload types to canonical tool object list.
2. Ensure frontend transparency rendering still works with nested function fields.
3. Remove old top-level tool schema assumptions from event adapters.

### Out of Scope

- No provider request logic.
- No tool execution loop behavior changes.

### Done Criteria

- Tool schema transparency events are typed/consumed in canonical format end-to-end.

### Status

- `PENDING`

## Agent 5: Test Migration + Dead-Path Cleanup (Sequential)

### Mission

Rewrite tests and remove legacy assertions that depend on old shape.

### Own These Files

- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_tool_policy.py`
- `tests/backend/test_prompt_constructor_utils.py`
- `tests/backend/test_llm_provider_base.py`
- `tests/backend/test_llm_client.py`
- `tests/backend/test_outgoing_schema_contract.py`
- `tests/frontend/ChatStreamMessageUpdates.test.ts`
- `tests/frontend/MessageTransparency.test.js`
- `docs/TESTING.md` (if commands/scope changed)

### Tasks

1. Replace top-level name/parameters assertions with canonical tool object assertions.
2. Add regression coverage for provider transport rejecting malformed canonical objects.
3. Remove obsolete parser-era schema-shape tests.

### Done Criteria

- Test suites align with single canonical schema contract.

### Status

- `PENDING`

## Agent 6: Integration QA + CI Green (Sequential Final)

### Mission

Run full validation, fix regressions, and close migration.

### Own These Files

- Any failing test files touched by Agent 5 scope only.
- `docs/prompts/openai-tool-object-schema-replacement-migration.md` (status updates)

### Tasks

1. Run full gate:
   - `./scripts/test`
2. Validate runtime query flow with Kimi + tool call (manual smoke if feasible).
3. Confirm no remaining runtime use of legacy schema assumptions.
4. Record final status and residual risks.

### Done Criteria

- Full gate green.
- Canonical schema contract used end-to-end without conversion adapters.

### Status

- `PENDING`

## File Ownership Matrix (Conflict Avoidance)

- Agent 1: types/docs contract
- Agent 2: schema production + policy/filtering
- Agent 3: LLM provider transport
- Agent 4: transparency event path + frontend types
- Agent 5: tests + cleanup
- Agent 6: integration/QA + final status

Hard rule:
- Do not edit files owned by another active agent in same phase.

## Handoff Format (Required From Every Agent)

Each agent returns:
1. Files changed.
2. Behavior delta.
3. Tests run + results.
4. Risks left.
5. Exact follow-up expected from next agent.
6. Source Pack evidence and applied details.

## Migration Notes

- This migration is intentionally strict replacement, not dual-shape compatibility.
- If hosted/local trust constraints require shape differences, handle at policy layer, not schema shape layer.
- Keep changes reviewable: small commits per ownership boundary.
