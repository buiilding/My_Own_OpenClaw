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

- `COMPLETE` on 2026-02-12.
- Files changed:
  - `backend/src/sdk/tool.py`
  - `backend/src/tools/schema_registry.py`
  - `backend/src/tools/registry.py`
  - `backend/src/tools/tool_policy.py`
  - `backend/src/tools/tool_selection.py`
  - `docs/prompts/openai-tool-object-schema-replacement-migration.md`
- Behavior delta:
  - `Tool.get_json_schema()` now emits canonical provider tool objects only:
    - `{type: "function", function: {name, description, parameters}}`
  - `SchemaRegistry` now validates canonical shape, regenerates stale non-canonical cache entries, and rejects non-canonical tool schema output.
  - Tool schema filtering paths now read nested names/parameters from canonical shape:
    - `ToolPolicy.filter_tool_schemas()` allowlist checks `schema.function.name`.
    - `ToolSelection.filter_tool_schemas()` and mouse-method narrowing now operate on `schema.function.parameters`.
  - `ToolRegistry.get_tool_capabilities()` now reads parameters from `schema.function.parameters`.
  - No dual-shape runtime fallback was introduced.
- Tests run + results:
  - `./scripts/python-in-env backend python -m py_compile backend/src/sdk/tool.py backend/src/tools/schema_registry.py backend/src/tools/registry.py backend/src/tools/tool_policy.py backend/src/tools/tool_selection.py`
  - Result: pass.
  - `./scripts/python-in-env backend pytest -q tests/backend/test_tool_policy.py tests/backend/test_tool_registry_schema.py`
  - Result: 4 failing tests, all due assertions expecting legacy top-level schema fields (`schema["name"]`, `schema["parameters"]`).
- Risks left:
  - Legacy-shape expectations remain in tests until Agent 5 migration.
  - Downstream runtime consumers outside Agent 2 ownership may still read legacy fields until Agents 3 and 4 complete their contract updates.

### Agent 2 -> Agent 3/4 Handoff

- Agent 3:
  - Assume `tools` now arrive in canonical shape from registry path; remove/avoid provider adapters for legacy top-level fields.
  - Keep strict validation/erroring for missing `type`/`function` fields in transport boundary.
- Agent 4:
  - Update transparency/outgoing/frontend event typing/rendering to canonical nested structure (`tool.function.*`), not top-level name/parameters.
- Shared:
  - Do not add dual-shape fallback in runtime-critical paths.

### Agent 2 Source Pack Evidence (Read Before Coding)

- LiteLLM function-calling request examples show `tools` entries as `{ "type": "function", "function": { ... } }`.
- LiteLLM Anthropic provider docs list `tools`, `tool_choice`, and `parallel_tool_calls` as supported params in translated requests.
- OpenAI function-calling docs define same canonical `tools` object shape and `tool_choice` controls (`auto`/`required`/`none`/forced function).
- Applied implication in Agent 2:
  - Schema production moved to canonical provider contract at source.
  - Internal filtering logic moved from top-level `name/parameters` to nested `function.name/function.parameters`.

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

- `COMPLETE` on 2026-02-12.
- Files changed:
  - `backend/src/llm/providers/base.py`
  - `docs/prompts/openai-tool-object-schema-replacement-migration.md`
- Behavior delta:
  - Removed provider-boundary legacy schema adapter behavior that converted top-level `{name, description, parameters}` tool entries into canonical shape.
  - `LLMProvider._build_request_params()` now validates `tools` entries against canonical contract and fails fast with actionable `LLMAPIError`s.
  - Canonical validation now requires:
    - `tool.type == "function"`
    - `tool.function` object present
    - `tool.function.name` non-empty string
    - `tool.function.parameters` present and object
    - `tool.function.description` string when provided
  - Forwarding semantics for `tools`, `tool_choice`, and `parallel_tool_calls` remain unchanged after validation.
- Tests run + results:
  - `./scripts/python-in-env backend python -m py_compile backend/src/llm/client.py backend/src/llm/providers/base.py backend/src/llm/providers/openai.py backend/src/llm/providers/anthropic.py backend/src/llm/providers/kimi_coding.py backend/src/llm/providers/gemini.py backend/src/llm/providers/openrouter.py backend/src/llm/providers/mistral.py backend/src/llm/providers/local.py`
  - Result: pass.
  - `./scripts/python-in-env backend pytest -q tests/backend/test_llm_provider_base.py tests/backend/test_llm_client.py`
  - Result: 3 failing tests in `tests/backend/test_llm_provider_base.py`, all expected from strict replacement (tests still assert legacy normalization/skip behavior or missing `function.parameters` acceptance).
  - `./scripts/python-in-env backend python - <<'PY' ... AnthropicProvider/KimiCodingProvider _build_request_params() validation probe ... PY`
  - Result: both providers reject legacy top-level tool schema with clear `LLMAPIError`, and accept canonical schema with `type=function`, preventing downstream `KeyError: 'type'` transport path.
- Risks left:
  - Provider-base tests still encode legacy adapter expectations and must be migrated by Agent 5.
  - Some canonical test fixtures still omit `function.parameters`; strict contract now rejects these.
  - Agent 4 transparency/event migration remains required for end-to-end contract alignment.

### Agent 3 -> Agent 5/6 Handoff

- Agent 5:
  - Update `tests/backend/test_llm_provider_base.py` expectations from adapter behavior to strict canonical validation errors.
  - Add/adjust regression tests for missing `type`, missing `function`, missing `function.parameters`, and non-object `function.parameters`.
  - Ensure canonical tool fixtures always include `function.parameters` object.
- Agent 6:
  - Re-run full gate after Agent 4 + Agent 5 land to confirm no remaining runtime/test legacy-shape assumptions.
  - Include a provider smoke (Anthropic/Kimi path) to verify strict validation catches malformed tool objects before LiteLLM boundary.

### Agent 3 Source Pack Evidence (Read Before Coding)

- LiteLLM function-calling docs define `tools` entries in OpenAI tool-object form with `type: "function"` + nested `function` payload.
- LiteLLM Anthropic provider docs list `tools`, `tool_choice`, and `parallel_tool_calls` as supported translated request params.
- OpenAI function-calling docs describe same canonical tool-object shape and `tool_choice` modes (`auto`, `required`, `none`, forced function).
- Anthropic tool-use docs emphasize follow-up message ordering (`tool_result` after `tool_use`); Agent 3 made no ordering changes, only request-schema validation.

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

- `COMPLETE` on 2026-02-12.
- Files changed:
  - `backend/src/core/events/streaming_events.py`
  - `backend/src/agent/llm/event_presenter.py`
  - `backend/src/api/processing/formatters/tool_schemas.py`
  - `backend/src/api/schemas/outgoing.py`
  - `frontend/src/renderer/types/backendEvents.ts`
  - `frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates.ts`
  - `frontend/src/renderer/features/chat/utils/messageTransparency.js`
  - `docs/prompts/openai-tool-object-schema-replacement-migration.md`
- Behavior delta:
  - Streaming event dataclasses now type transparency schemas as canonical `List[ToolSchema]` instead of dict-shaped payloads.
  - `EventPresenter` now validates transparency tool schemas as canonical OpenAI/LiteLLM tool objects and fails fast with explicit path-level errors.
  - Tool-schema formatter now rejects non-list payloads and only emits canonical list payloads.
  - Outgoing WebSocket schema now enforces canonical nested tool schema objects:
    - `ToolSchemaPayload = {type: "function", function: {...}}`
    - `ToolSchemasPayload.tool_schemas: List[ToolSchemaPayload]`
    - `SystemPromptPayload.tool_schemas: Optional[List[ToolSchemaPayload]]`
  - Frontend backend event typing now models canonical tool schema shape (`tool_schemas?: ToolSchema[]`).
  - Frontend transparency utilities now only accept/render canonical tool schema lists; non-canonical legacy payloads are dropped.
- Tests run + results:
  - `./scripts/python-in-env backend python -m py_compile backend/src/core/events/streaming_events.py backend/src/agent/llm/event_presenter.py backend/src/api/processing/formatters/tool_schemas.py backend/src/api/schemas/outgoing.py`
  - Result: pass.
  - `./scripts/python-in-env backend pytest -q tests/backend/test_outgoing_schema_contract.py`
  - Result: 1 failing test (`test_tool_schemas_formatter_output_matches_schema`) due legacy dict payload fixture.
  - `cd frontend && npm run test:ci -- tests/frontend/ChatStreamMessageUpdates.test.ts tests/frontend/MessageTransparency.test.js`
  - Result: 2 failing tests due legacy non-canonical payload expectations (`tool_schemas: ['a']`, object-wrapped tool schema content).
- Risks left:
  - Agent 5 must migrate failing backend/frontend tests to canonical tool object payload fixtures/assertions.
  - `useChatStream` still forwards `tool-schemas` payload directly into message state (typed as canonical, but runtime validation remains adapter-local in updated transparency helpers).

### Agent 4 -> Agent 5 Handoff

- Update test fixtures/assertions from legacy tool schema shape to canonical objects in:
  - `tests/backend/test_outgoing_schema_contract.py`
  - `tests/frontend/ChatStreamMessageUpdates.test.ts`
  - `tests/frontend/MessageTransparency.test.js`
- Add/adjust regression coverage to assert formatter/presenter reject non-canonical transparency payloads (non-list payload, missing `type`, missing nested `function.name`/`function.parameters`).
- Keep strict replacement: do not reintroduce top-level `name/parameters` shape into event payload assertions.

### Agent 4 -> Agent 6 Handoff

- Integration smoke should verify transparency pane still shows canonical tool schemas emitted from first-turn metadata.
- Confirm no transport/event boundary emits legacy dict-mapped tool schemas.

### Agent 4 Source Pack Evidence (Read Before Coding)

- LiteLLM function-calling docs: request `tools` entries use canonical object shape with `type: "function"` + nested `function`, and `tool_choice` is a first-class request control.
- LiteLLM Anthropic provider docs: translated provider path supports `tools`, `tool_choice`, and `parallel_tool_calls`; canonical tool object shape is required at boundary.
- OpenAI function-calling docs: canonical tool object shape plus `tool_choice` modes (`auto`, `required`, `none`, forced function) match replacement target.
- Anthropic tool-use docs: tool result ordering constraints still apply (tool results must follow prior tool use blocks in sequence). Agent 4 changes did not alter message ordering logic.

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

- `COMPLETE` on 2026-02-12.
- Files changed:
  - `tests/backend/test_tool_registry_schema.py`
  - `tests/backend/test_tool_policy.py`
  - `tests/backend/test_prompt_constructor_utils.py`
  - `tests/backend/test_llm_provider_base.py`
  - `tests/backend/test_outgoing_schema_contract.py`
  - `tests/frontend/ChatStreamMessageUpdates.test.ts`
  - `tests/frontend/MessageTransparency.test.js`
  - `tests/frontend/ChatStreamThinkingStatus.test.tsx`
  - `docs/prompts/openai-tool-object-schema-replacement-migration.md`
- Behavior delta:
  - Migrated legacy top-level schema assertions (`name`, `parameters`) to canonical OpenAI/LiteLLM tool-object assertions (`type=function`, nested `function.name/function.parameters`) across backend/frontend migration-owned tests.
  - Replaced provider-base tests that expected legacy adapter behavior with strict validation tests for malformed tool objects:
    - reject legacy top-level tool schema (missing `type`)
    - reject non-object tool entries
    - reject missing/invalid `function` object
    - reject missing/non-object `function.parameters`
  - Updated outgoing formatter contract tests to assert canonical tool-schema payload acceptance and non-list payload rejection.
  - Updated chat-stream/transparency frontend tests to assert canonical tool-schema arrays and `undefined` behavior for non-canonical payloads.
- Tests run + results:
  - `./scripts/python-in-env backend pytest -q tests/backend/test_tool_registry_schema.py tests/backend/test_tool_policy.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_llm_provider_base.py tests/backend/test_llm_client.py tests/backend/test_outgoing_schema_contract.py`
  - Result: pass.
  - `cd frontend && npm run test:ci -- tests/frontend/ChatStreamMessageUpdates.test.ts tests/frontend/MessageTransparency.test.js tests/frontend/ChatStreamThinkingStatus.test.tsx`
  - Result: pass.
  - `./scripts/test-backend`
  - Result: pass (`713 passed`).
  - `cd frontend && npm run test:ci`
  - Result: pass (`69 passed`).
- Risks left:
  - Full `./scripts/test` orchestration was interrupted on request; sidecar suite is known to intermittently fail in constrained PTY environments (`out of pty devices`) when multiple long-running test invocations overlap.
- Agent 5 -> Agent 6 Handoff:
  - Run full gate serially (`./scripts/test`) from a clean shell with no parallel pytest/jest processes to avoid PTY exhaustion false negatives.
  - If sidecar PTY failure reappears, verify no stale processes and rerun `./scripts/test-sidecar`; this is environment-capacity risk, not tool-schema contract logic.
  - Perform final Kimi/Anthropic native-tool smoke to confirm canonical tool objects flow end-to-end with strict validation intact.
- Agent 5 Source Pack Evidence (Read Before Coding):
  - LiteLLM/OpenAI docs require `tools[]` entries in canonical object form (`type: "function"`, nested `function` payload).
  - LiteLLM Anthropic path supports `tools`, `tool_choice`, `parallel_tool_calls`; strict test expectations were aligned to this canonical request contract.

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

- `COMPLETE` on 2026-02-12.
- Files changed:
  - `docs/prompts/openai-tool-object-schema-replacement-migration.md`
- Behavior delta:
  - Completed final integration audit for migration-owned runtime paths after Agents 1-5:
    - provider boundary enforces canonical tool object validation (`type=function`, nested `function.name`, `function.parameters`)
    - transparency/event contract remains canonical end-to-end for `tool_schemas`
    - no migration-owned runtime adapter reintroducing legacy top-level `{name, description, parameters}` tool schema shape
  - Final migration orchestrator doc now records end-state closure under Agent 6.
- Tests run + results:
  - No new test execution in Agent 6 by explicit user request ("no need to run tests, they all work").
  - Relied on latest completed evidence from prior agents/user-run commands:
    - backend suite pass (`./scripts/test-backend`: `713 passed`)
    - frontend suite pass (`cd frontend && npm run test:ci`: `69 passed`)
    - migration-focused backend/frontend suites passed in Agent 5 scope.
- Risks left:
  - Full `./scripts/test` umbrella command was not re-run in Agent 6 after user request to skip tests.
  - Prior environment-level PTY saturation/hanging behavior remains an execution-environment risk, not a schema-contract regression.
- Agent 6 -> Sequential Agents Handoff:
  - No further migration agents; implementation and test-contract migration are closed.
  - If future regressions appear, enforce canonical input at boundaries and avoid dual-shape fallback reintroduction.
- Agent 6 Source Pack Evidence (Applied):
  - OpenAI/LiteLLM canonical request shape remains `{type: "function", function: {...}}`; final integration confirms WindieOS migration-owned codepaths align with that contract.
  - `tool_choice`/provider translation semantics were preserved by earlier agents and not altered in Agent 6 closure pass.

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
