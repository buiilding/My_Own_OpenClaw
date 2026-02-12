---
summary: "Orchestrator guide to migrate WindieOS from custom JSON tool parsing to native SDK tool-calling via LiteLLM."
read_when:
  - When replacing parser-driven tool orchestration with API-native tool calls.
  - When splitting this migration across multiple coding agents.
---

# Native SDK Tool Calling Migration (WindieOS)

## Goal

Remove custom tool-call text protocol + parser maintenance burden.
Use native tool-calling from the model API path (via LiteLLM) while keeping WindieOS multi-provider support.

## Decision (Research-Backed)

1. Keep LiteLLM as transport abstraction.
2. Stop requiring model to emit JSON blobs in plain text for tool calls.
3. Pass tools via request params (`tools`, `tool_choice`) and consume structured tool calls from API response.
4. Preserve frontend sidecar tool execution path (`tool-call` / `tool-bundle` events) to limit blast radius.
5. Migrate conversation history to include proper tool-call/tool-result message structure where needed for follow-up turns.

Rationale:
- WindieOS already centralizes providers in LiteLLM.
- LiteLLM exposes OpenAI-style function calling across providers (including Anthropic models with provider translation).
- This keeps one implementation path, avoids per-provider SDK rewrites, and removes brittle parser/prompt format coupling.

## Source Pack (Read First)

- LiteLLM function calling: https://docs.litellm.ai/docs/completion/function_call
- LiteLLM Anthropic provider + supported params (`tools`, `tool_choice`, `parallel_tool_calls`): https://docs.litellm.ai/docs/providers/anthropic
- Anthropic tool use semantics: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use
- Anthropic OpenAI-compatible endpoint (context for normalization compatibility): https://docs.anthropic.com/en/release-notes/api
- OpenAI function-calling concepts: https://platform.openai.com/docs/guides/function-calling

### Web Research Gate (Mandatory Before Coding, All Agents)

Before starting implementation, every agent must:

1. Open and read all links in **Source Pack**.
2. Capture short implementation notes in the PR/handoff with:
   - exact param names to send (`tools`, `tool_choice`, `parallel_tool_calls` where supported)
   - expected tool-call response fields to normalize (`id`, function/tool `name`, parsed `arguments`)
   - any provider-specific caveats that affect streaming or tool-call deltas
3. Quote exact error strings from docs for known invalid tool-call payload patterns when relevant.

Hard rule:
- No implementation starts until this research step is complete.

## Agent Count

Use **5 agents**.

Why 5:
- One contract/architecture pass needed first to prevent interface drift.
- One focused LLM transport implementation pass.
- Two parallel passes after transport (agent loop integration + prompt/docs cleanup) with minimal file overlap.
- One integration/QA pass for regression coverage and CI green.

## Execution Graph

1. Agent 1 (sequential, first)
2. Agent 2 (sequential, depends on Agent 1)
3. Agent 3 + Agent 4 (parallel, both depend on Agent 2)
4. Agent 5 (sequential, final integrator/QA)

Parallel window:
- Only **Agent 3 and Agent 4** can run at the same time.
- Keep strict file ownership to avoid merge churn.

## Agent 1: Contract + Migration Skeleton (Sequential)

### Mission
Define canonical backend contracts for native tool-calling responses and tool messages.

### Own These Files
- `backend/src/core/types/schemas.py`
- `backend/src/llm/client.py` (interfaces only; no provider behavior yet)
- `backend/src/core/config/models.py` (feature flag if needed)
- `docs/LLM_INTEGRATION.md` (contract notes section)

### Tasks
1. Define normalized response type that can carry:
   - assistant text content
   - structured tool calls (`id`, `name`, `arguments`)
   - finish reason (optional but useful)
2. Extend message typing to support tool-role message fields needed for follow-up turns.
3. Add migration flag (default enabled) only if rollback is required.
4. Document contract and cutover rules in docs.

### Out of Scope
- No provider request logic.
- No interaction-loop rewiring.
- No parser deletion yet.

### Done Criteria
- Downstream agents can code against one stable response/message contract.
- Type checks pass for touched modules.

### Status
- `COMPLETE` on 2026-02-12.
- Implemented:
  - `NormalizedToolCall` + expanded `NormalizedLLMResponse` contract (`content`, optional `tool_calls`, optional `finish_reason`).
  - `LLMMessage` union support for assistant `tool_calls` and `tool` role follow-up messages.
  - `LLMClient.get_completion_response(...)` normalized interface in client layer, with `get_completion(...)` backward compatibility.
  - Migration rollback flag: `AppConfig.native_tool_calling_enabled` (default `true`).
  - Contract notes + cutover rules in `docs/LLM_INTEGRATION.md`.

## Agent 2: LiteLLM Native Tool-Calling Transport (Sequential)

### Mission
Implement native tool-calling in provider/client layer.

### Own These Files
- `backend/src/llm/providers/base.py`
- `backend/src/llm/providers/openai.py`
- `backend/src/llm/providers/anthropic.py`
- `backend/src/llm/providers/gemini.py` (if shared behavior path touched)
- `backend/src/llm/providers/openrouter.py` / `mistral.py` / `kimi_coding.py` / `local.py` (only as needed for compatibility)
- `backend/src/llm/client.py`
- `backend/src/tools/registry.py` (only if tool schema payload accessor needed)

### Tasks
0. Complete **Web Research Gate** and include notes in handoff.
1. Pass tool schemas via request params (`tools`, `tool_choice`).
2. Parse structured tool calls from model response objects instead of extracting from text.
3. Keep streaming text behavior where possible; if streaming tool-call deltas are provider-inconsistent, implement safe fallback path with clear logs.
4. Return normalized response object from client layer (contract from Agent 1).
5. Keep provider abstraction intact (no per-provider app-layer branching).

### Out of Scope
- No prompt text rewrite.
- No interaction-loop business logic rewrite.

### Done Criteria
- OpenAI + Anthropic paths both return structured tool calls in normalized format.
- Non-tool responses unaffected.
- Existing non-tool streaming remains functional.
- Handoff includes brief evidence that all Source Pack links were read first and applied.

### Agent 1 -> Agent 2 Handoff
- Use Agent 1 contract exactly:
  - Tool call shape: `{id: str, name: str, arguments: Dict[str, Any]}`.
  - Response shape: `{content: str, tool_calls?: [...], finish_reason?: str | None}`.
- Ensure provider responses always include `content` key (empty string is acceptable for tool-only turns).
- Wire `tools` + `tool_choice` through provider params and normalize provider-specific tool-call payloads at provider boundary.
- Respect `AppConfig.native_tool_calling_enabled` as rollback gate during transport cutover.

### Status
- `COMPLETE` on 2026-02-12.
- Implemented:
  - Provider/client native tool-calling transport params wired end-to-end (`tools`, `tool_choice`, `parallel_tool_calls`) with optional args/default no-op behavior.
  - Structured tool-call extraction/normalization at provider boundary from response objects (OpenAI `message.tool_calls` and Anthropic-style `content[type=tool_use]` fallback) into canonical shape:
    - `{id, name, arguments: Dict[str, Any]}`.
  - Normalized completion payload extraction now returns:
    - `content` (always present, `""` allowed),
    - optional `tool_calls`,
    - optional `finish_reason`.
  - Streaming safety fallback retained:
    - text streaming unchanged,
    - tool-call deltas detected/logged and suppressed from text chunks (non-stream completion remains source of structured tool calls).
  - Rollback gate enforced in client transport:
    - when `AppConfig.native_tool_calling_enabled == false`, native tool-calling params are not sent and normalized `tool_calls` are suppressed from client output.
  - Coverage added/updated:
    - `tests/backend/test_llm_client.py`
    - `tests/backend/test_llm_provider_base.py`
    - targeted provider regression check: `tests/backend/test_local_llm_providers.py`.

### Agent 2 Source Pack Evidence (Read Before Coding)
- LiteLLM function-calling docs:
  - request params confirmed: `tools`, `tool_choice`.
  - response normalization target confirmed: `choices[0].message.tool_calls[].id`, `.function.name`, `.function.arguments`.
- LiteLLM Anthropic provider docs:
  - supported Anthropic params via LiteLLM include `tools`, `tool_choice`, `parallel_tool_calls`.
  - translation path allows keeping provider abstraction without app-layer Anthropic branching.
- Anthropic tool-use docs:
  - message ordering caveat for follow-up turn: `tool_result` blocks must immediately follow prior `tool_use` and come first in the next user message content.
  - exact known invalid payload error string captured:
    - ``messages.6: `tool_use` ids were found without `tool_result` blocks immediately after: toolu_01A09q90qw90lq917835lq9``.
- Anthropic OpenAI-compatible endpoint notes:
  - compatibility supports normalized OpenAI-style tooling contract assumptions for translation layers.
- OpenAI function-calling guide:
  - canonical function/tool-call object shape aligns with Agent 1 contract mapping (`id`, `name`, parsed JSON `arguments`).

### Agent 2 -> Agent 3/4/5 Handoff
- Agent 3:
  - Start consuming `LLMClient.get_completion_response(..., tools=..., tool_choice=..., parallel_tool_calls=...)` normalized payload.
  - Trust provider boundary normalization; do not re-parse tool calls from assistant text.
  - Keep fallback behavior if migration flag disabled (`tool_calls` absent by design).
- Agent 4:
  - Prompt cleanup can proceed assuming transport now supports native tool-calling params + structured response parsing.
  - Keep any prompt guidance about tool-result ordering constraints (Anthropic strictness) even after removing JSON text protocol instructions.
- Agent 5:
  - Expand integration tests from provider/client unit coverage to full loop/history paths once Agent 3 lands.
  - Include regression for tool-only assistant turns (`content == ""`, non-empty `tool_calls`) and rollback gate behavior.

## Agent 3: Interaction Loop + History Integration (Parallel after Agent 2)

### Mission
Cut agent runtime from parser-driven tool detection to native structured tool calls.

### Own These Files
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/execution/executor.py`
- `backend/src/agent/session/state.py`
- `backend/src/core/messages/structures.py`
- `backend/src/tools/orchestrator.py` (only if type wiring needed)

### Tasks
1. Replace `ResponseParser.parse_response(...)` dependency in loop with normalized tool-calls from LLM layer.
2. Convert normalized tool calls into existing tool orchestration input types (reuse `ParsedToolCall` only if still useful).
3. Store assistant/tool messages in history with enough structure for next-turn tool continuation.
4. Keep current frontend event contract (`tool-call`, `tool-bundle`, `tool-output`) unchanged.
5. Remove parser-recovery loop behavior that is no longer relevant.

### Out of Scope
- No provider request changes.
- No system prompt rewrite.

### Done Criteria
- Agent can do multi-turn tool workflows without text-JSON parser.
- Tool execution loop stable for single + bundle flows.

### Status
- `COMPLETE` on 2026-02-12.
- Files changed:
  - `backend/src/agent/execution/interaction_loop.py`
  - `backend/src/agent/llm/llm_stream_processor.py`
  - `backend/src/agent/execution/executor.py`
  - `backend/src/agent/session/state.py`
  - `backend/src/core/messages/structures.py`
  - `docs/prompts/native-sdk-tool-calling-migration.md`
- Behavior delta:
  - Interaction loop no longer parses assistant text for tool calls; it consumes normalized payloads from LLM layer and bridges native tool calls into existing `ParsedToolCall` orchestration types.
  - Parser-recovery retry behavior removed from loop; parse-validation corrective user-message injection path no longer runs in Agent loop.
  - `LLMStreamProcessor` now supports native completion payload path (when tools + native flag enabled) and still preserves legacy stream path for non-tooling/legacy callers.
  - Conversation history now stores assistant tool-call metadata (`assistant.tool_calls`) and tool result linkage (`tool_call_id`) for follow-up turns.
  - Tool-result history now emits `role=tool` messages first (per staged tool-call ids) and still keeps legacy user-role tool-output message for screenshot continuity.
- Tests run + results:
  - `pytest -q tests/backend/test_llm_stream_processor.py` -> passed (`2 passed`).
  - `pytest -q tests/backend/test_conversation_history.py` -> passed (`8 passed`).
  - `pytest -q tests/backend/test_session_cleanup.py` -> passed (`2 passed`).
  - `pytest -q tests/backend/test_conversation_history.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_session_llm_factory.py` -> `3 failed, 14 passed`; failures are Agent-4-era prompt schema expectation changes (`<tool_schemas>` embedding removed), not Agent 3 loop/history regressions.
- Risks left:
  - Native-tool path currently returns one synthesized `ChunkEvent` for content instead of provider token-by-token chunks.
  - History currently stores both `role=tool` and legacy user tool-output messages; this keeps screenshot context but increases context size and may need cleanup once prompt/schema migration stabilizes.
  - Bundle mode maps one bundled result across staged tool-call ids; integration tests should verify provider-specific expectations.

### Agent 3 -> Agent 5 Handoff
- Add integration tests for:
  - assistant tool-only turns (`content == ""` + non-empty `tool_calls`) through full Agent loop.
  - follow-up request message order: assistant tool_calls -> tool result messages with matching `tool_call_id`.
  - bundle tool-call turns with multiple ids and one bundled frontend result path.
- Validate whether keeping legacy user tool-output messages is still needed after native prompt/schema cutover; remove if redundant.
- Keep rollback gate test path (`native_tool_calling_enabled=false`) on interaction-loop/history behavior.

### Agent 3 Source Pack Evidence (Read Before Coding)
- LiteLLM function calling docs: request params confirmed as `tools` + `tool_choice`; response shape normalized around `message.tool_calls[].id`, `.function.name`, `.function.arguments`.
- LiteLLM Anthropic provider docs: Anthropic path supports `tools`, `tool_choice`, `parallel_tool_calls` through LiteLLM translation.
- Anthropic tool-use docs: tool-result ordering rule captured (`tool_result` must immediately follow `tool_use`), with known invalid payload string:
  - ``messages.6: `tool_use` ids were found without `tool_result` blocks immediately after: toolu_01A09q90qw90lq917835lq9``.
- Anthropic OpenAI-compat endpoint notes: confirms compatibility layer framing for OpenAI-style normalized tool-call contracts.
- OpenAI function-calling guide: canonical function call payloads include stable call id, function name, and JSON arguments.

## Agent 4: Prompt/Schema Cleanup + Docs (Parallel after Agent 2)

### Mission
Delete obsolete prompt protocol instructions and schema wrapping patterns tied to text parsing.

### Own These Files
- `backend/src/llm/prompts/system_prompt.txt`
- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/sdk/tool.py`
- `docs/TOOL_SYSTEM.md`
- `docs/AGENT_SYSTEM.md`

### Tasks
1. Remove instructions that force exact JSON text tool-call emission in assistant content.
2. Remove `<tool_schemas>` embedding dependency for tool invocation protocol if no longer needed for runtime behavior.
3. Ensure tool schema shape emitted to LLM path matches native function-calling expectations.
4. Keep operational behavior instructions (autonomy, safety, verification) but decouple from text-format protocol.
5. Update docs to reflect native tool-calling flow.

### Out of Scope
- No core provider transport changes.
- No interaction-loop logic changes.

### Done Criteria
- Prompt docs and runtime prompt generation no longer depend on custom JSON parser format.
- Tool schema path aligns with API-native tool-calling.

### Status
- `COMPLETE` on 2026-02-12.
- Files changed:
  - `backend/src/llm/prompts/system_prompt.txt`
  - `backend/src/llm/prompts/prompt_constructor.py`
  - `backend/src/sdk/tool.py`
  - `backend/src/tools/tool_selection.py` (compat helper for dev mouse-method filtering with native schema)
  - `docs/TOOL_SYSTEM.md`
  - `docs/AGENT_SYSTEM.md`
  - `docs/prompts/native-sdk-tool-calling-migration.md`
- Behavior delta:
  - Removed parser-era prompt requirements that forced literal JSON tool-call text output and metadata/action wrapper format.
  - Prompt constructor no longer injects `<tool_schemas>` into first user message; schemas remain returned for native API `tools` params + transparency events.
  - SDK tool schema generation now emits native direct argument schema for all tools (no computer-tool wrapper object).
  - Tool-selection mouse arg filtering supports both legacy wrapped schema and native direct-args schema.
  - Docs updated to describe native tool-calling transport (`tools`, optional `tool_choice`, optional `parallel_tool_calls`) and structured response flow.
- Tests run + results:
  - Ran:
    - `./scripts/python-in-env backend pytest tests/backend/test_prompt_constructor_utils.py tests/backend/test_tool_registry_schema.py tests/backend/test_tool_policy.py`
  - Result: `5 failed, 13 passed`.
  - Failures are expected parser-era assertions in tests still expecting:
    - `<tool_schemas>` embedding in user content.
    - wrapped computer-tool schema (`metadata` + `action.functionCall.args`) instead of native direct args.
- Risks left:
  - Agent runtime (`InteractionLoop`) is still parser-driven until Agent 3 lands, so old parser behavior remains in-flight elsewhere by design.
  - Parser-era test suites still assert removed behavior; migration-aligned test updates remain for Agent 5.
  - `tests/backend/test_tool_policy.py` currently asserts legacy wrapped schema paths and must be updated to native schema expectations.

### Agent 4 -> Agent 5 Handoff (Sequential)
- Update parser-era tests to native contracts:
  - `tests/backend/test_prompt_constructor_utils.py` (remove `<tool_schemas>` embedding assertions).
  - `tests/backend/test_tool_registry_schema.py` (assert direct `parameters` shape for computer tools).
  - `tests/backend/test_tool_policy.py` (assert method filtering against native `parameters.properties`).
- Add integration regression coverage once Agent 3 lands:
  - tool-only assistant turns (`content == ""`, non-empty `tool_calls`).
  - follow-up turn tool-result message ordering constraints for Anthropic paths.
- Keep rollback gate coverage (`native_tool_calling_enabled == false`) intact while removing parser assumptions.

### Agent 4 Source Pack Evidence (Read Before Coding)
- LiteLLM function-calling docs:
  - request params confirmed: `tools`, `tool_choice`.
  - structured tool-call response fields normalized from `choices[0].message.tool_calls`.
- LiteLLM Anthropic provider docs:
  - supported params include `tools`, `tool_choice`, `parallel_tool_calls`.
  - confirms translation path can stay in shared LiteLLM abstraction.
- Anthropic tool-use implementation docs:
  - strict follow-up ordering caveat: `tool_result` blocks must immediately follow prior `tool_use`.
  - exact invalid payload error string recorded:
    - ``messages.6: `tool_use` ids were found without `tool_result` blocks immediately after: toolu_01A09q90qw90lq917835lq9``.
- Anthropic OpenAI-compatible endpoint notes:
  - compatibility context supports normalized OpenAI-style tool-call assumptions across translation layers.
- OpenAI function-calling guide:
  - canonical tool-call shape aligns with contract used by Agents 1/2 (`id`, function/tool `name`, JSON `arguments`).

## Agent 5: Integration QA + Regression Net (Sequential Final)

### Mission
Land tests, cleanups, and CI green across backend + frontend contracts.

### Own These Files
- `tests/backend/test_response_parser.py` (deprecate/replace as needed)
- `tests/backend/test_parser_*` (cleanup/migrate where obsolete)
- `tests/backend/test_tool_result_orchestrator.py`
- `tests/backend/test_bundle_execution.py`
- `tests/backend/test_tool_preparer.py`
- `tests/frontend/*` only if event contract changed
- `docs/TESTING.md` (if commands/scope changed)

### Tasks
1. Add regression tests for:
   - structured tool-call extraction from provider output
   - single-tool + multi-tool(bundle) cycles
   - follow-up turn after tool result
2. Remove or rewrite parser-specific tests that are no longer valid.
3. Run full gate:
   - `./scripts/test`
   - frontend tests if touched
4. Fix CI until green.

### Done Criteria
- Full test gate green.
- No dead parser-path assumptions left in runtime-critical code.

## File Ownership Matrix (Conflict Avoidance)

- Agent 1: contracts + config + LLM integration docs.
- Agent 2: `backend/src/llm/providers/*`, `backend/src/llm/client.py`.
- Agent 3: `backend/src/agent/*`, session/history message structures.
- Agent 4: prompts/schema formatting docs and schema generation.
- Agent 5: tests + final cleanup.

Hard rule:
- If a file is owned by another active agent in the same phase, do not edit it.

## Handoff Format (Required From Every Agent)

Each agent must return:
1. Files changed.
2. Behavior delta.
3. Tests run + results.
4. Risks left.
5. Exact follow-up expected from next agent.
6. Source Pack evidence: what was read first and which doc details affected implementation.

## Notes for Orchestration

- Keep context windows small per agent:
  - Give each agent only owned files + this prompt.
  - Do not dump unrelated architecture docs.
- Prefer thin adapters over broad rewrites in one PR.
- Keep parser modules until Agent 5 confirms full replacement; then remove dead code safely.
