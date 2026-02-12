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

### Agent 1 -> Agent 2 Handoff
- Use Agent 1 contract exactly:
  - Tool call shape: `{id: str, name: str, arguments: Dict[str, Any]}`.
  - Response shape: `{content: str, tool_calls?: [...], finish_reason?: str | None}`.
- Ensure provider responses always include `content` key (empty string is acceptable for tool-only turns).
- Wire `tools` + `tool_choice` through provider params and normalize provider-specific tool-call payloads at provider boundary.
- Respect `AppConfig.native_tool_calling_enabled` as rollback gate during transport cutover.

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

## Notes for Orchestration

- Keep context windows small per agent:
  - Give each agent only owned files + this prompt.
  - Do not dump unrelated architecture docs.
- Prefer thin adapters over broad rewrites in one PR.
- Keep parser modules until Agent 5 confirms full replacement; then remove dead code safely.
