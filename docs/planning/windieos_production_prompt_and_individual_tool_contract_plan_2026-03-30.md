---
summary: "Refactor plan for a production-grade system prompt and provider-agnostic model-facing tool contract, including removal of unified wrapper tools in favor of individual tools."
read_when:
  - Refactoring `backend/src/llm/prompts/system_prompt.txt`.
  - Replacing unified wrapper tools with individual model-facing tools.
  - Standardizing model-facing tool schema shape across providers and transparency surfaces.
title: "Production Prompt and Individual Tool Contract Plan (2026-03-30)"
---

# Production Prompt and Individual Tool Contract Plan (2026-03-30)

## Summary

Refactor WindieOS prompt and tool-contract design so it behaves more like a production agent runtime:

- a shorter, higher-signal system prompt
- model-facing tool schemas that are first-class contracts rather than wrapper envelopes
- individual tools exposed directly to the model instead of `computer_use` and `system_use`
- one provider-agnostic internal tool-spec shape, with provider adapters responsible for transport-specific conversion

This plan intentionally supersedes the wrapper-preservation assumption in `docs/planning/windieos_dynamic_tool_schema_refactor_plan_2026-03-30.md`.

## Current Problems

The current prompt and schema surface have several production-readiness issues:

1. The system prompt is too long, too repetitive, and too schema-dependent.
2. The prompt teaches wrapper payload shapes (`computer_use`, `system_use`) instead of a clean tool surface.
3. Schema details are split between prompt text, static wrapper schema dicts, parser normalization, and sidecar routing.
4. The model-facing tool contract is not provider-agnostic. WindieOS treats nested OpenAI/LiteLLM function objects as canonical, even though the OpenAI Responses path already converts them into a flatter top-level tool shape.
5. Wrapper tools hide the actual action surface from the model and force extra normalization logic throughout parsing, policy, preparation, and execution.
6. Browser still mixes compatibility surface and model-facing surface instead of exposing a purpose-built production schema.

## Goals

1. Replace the current oversized prompt with a concise production-grade prompt.
2. Expose individual tools directly to the model instead of `computer_use` and `system_use`.
3. Introduce one provider-agnostic internal tool-spec model shaped like a production tool contract:
   - `type`
   - `name`
   - `description`
   - `strict`
   - `parameters`
   - optional custom-tool `format` for freeform tools in the future
4. Keep provider adapters responsible for converting the internal tool spec to provider-native transport shape.
5. Remove prompt instructions that exist only to work around wrapper envelopes or schema drift.

## Non-Goals

1. Do not remove backend ownership of tool registration in this phase.
2. Do not implement freeform custom tools unless there is a concrete product need for them in the same change.
3. Do not redesign unrelated execution orchestration unless wrapper removal requires it.

## Proposed Design

### 1. New system prompt philosophy

The production prompt should be short and durable.

It should cover only:

- identity and role
- safety and determinism
- state verification expectations
- tool-selection principles
- response behavior
- critical platform/runtime constraints

It should not contain:

- giant schema tutorials
- large JSON few-shot blocks for every tool
- repeated field-name reminders that belong in tool descriptions and JSON Schema
- wrapper-envelope teaching that exists only because the current tool design is awkward

The prompt should move from “teach schema syntax in prose” to “teach behavior and decision policy.”

### 2. Individual model-facing tools

Remove model-facing wrappers and expose individual tools directly.

Computer/domain tools become direct tools such as:

- `mouse_control`
- `keyboard_control`
- `screenshot`
- `scroll_control`
- `switch_tab`
- `wait`
- `run_shell_command`
- `replace`
- `read_file`
- `get_system_stats`
- `get_open_windows`
- `open_app`
- `process`
- `browser` or a later browser-tool split if approved

This removes the need for:

- `computer_use` envelope metadata rules
- `system_use` top-level explanation injection rules
- parser-time wrapper normalization
- wrapper-specific corrective error text
- wrapper-specific policy normalization logic

### 3. Provider-agnostic internal tool spec

Define one internal model-facing tool spec as the canonical backend contract:

```json
{
  "type": "function",
  "name": "tool_name",
  "description": "Tool description",
  "strict": false,
  "parameters": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false
  }
}
```

This internal shape becomes the source of truth for:

- prompt transparency events
- tool registry output
- policy filtering
- parser whitelist generation
- sub-agent restricted registries
- test fixtures and contract validation

Provider adapters then convert:

- internal flat function tools -> nested OpenAI/LiteLLM `{"type":"function","function":{...}}` when needed
- internal flat function tools -> OpenAI Responses flat tool shape directly
- future custom/freeform tools -> provider-specific supported representations

This keeps model-facing semantics stable while transport-specific shape stays isolated to provider adapters.

### 4. Tool descriptions become the schema-level teaching surface

Move operational tool guidance out of the system prompt and into individual tool descriptions and parameter descriptions.

Examples:

- keyboard focus and retry guidance belongs on `keyboard_control`
- OCR/prediction/manual targeting guidance belongs on `mouse_control` and `scroll_control`
- shell foreground/background/yield guidance belongs on `run_shell_command`
- pagination and stale-ref rules belong on browser action schemas where possible

The prompt should still teach cross-tool reasoning such as “verify outcomes” and “prefer deterministic state.”

### 5. Browser stays one tool for now, but with a production contract

Do not keep browser’s current broad compatibility schema as the model-facing contract.

Instead:

- define a canonical production browser schema for model use
- keep compatibility parsing for legacy aliases only at runtime boundaries
- remove compatibility-only fields from the internal model-facing browser spec entirely

If later desired, browser can be split into multiple tools, but this plan does not require that. The important change is that browser’s model-facing schema must be a deliberate production contract, not a pruned compatibility superset.

### 6. Prompt examples become minimal and strategic

Retain only a few high-value examples in the system prompt, if any.

Prefer examples for:

- multi-step read-before-write reasoning
- state verification after UI mutation
- browser pagination discipline
- background process management boundaries

Do not include exhaustive per-tool JSON examples for the entire tool surface.

## Implementation Outline

### Phase 1: Introduce internal flat tool spec

- add internal typed representation for flat model-facing tool specs
- update registry/schema generation to emit that internal shape
- update transparency types and validation to use the flat shape
- keep provider adapters responsible for nested OpenAI/LiteLLM conversion

### Phase 2: Remove wrapper tools from model-facing surface

- stop emitting `computer_use` and `system_use` as model-facing tools
- expose concrete computer and system tools directly
- remove parser normalization paths that rewrite wrappers into concrete names
- remove wrapper-specific preparation and corrective guidance paths
- update allowlist and selection logic to operate on concrete tools only

### Phase 3: Rewrite the system prompt

- replace the current long prompt with a concise production prompt
- keep only durable behavioral guidance
- remove wrapper-specific sections and most embedded JSON examples
- move tool-specific teaching into schema descriptions

### Phase 4: Rebuild browser’s production-facing schema

- define a canonical browser contract for model use
- isolate compatibility parsing to runtime-only validation paths
- ensure browser pagination and stale-ref rules are represented in schema and concise prompt guidance, not giant example blocks

### Phase 5: Align frontend transparency and tests

- update frontend transparency rendering to accept the flat internal tool-spec shape, or add one compatibility adapter if the frontend should still receive provider-shaped schemas
- update docs, contract references, and tests to remove wrapper assumptions

## Public Interface and Contract Changes

Expected contract changes:

- model-facing tool surface removes `computer_use` and `system_use`
- internal canonical tool schema shape changes from nested provider style to flat production tool-spec style
- provider transports continue working via adapter conversion
- prompt transparency payload should align with the internal canonical tool-spec shape, not whichever provider-specific nesting WindieOS happens to use

The concrete tool names above become the direct schema names the model sees and the parser accepts.

## Tests

Add or update tests for:

### Prompt

- prompt-manager still loads, caches, and renders `{os}` correctly
- repo prompt contract tests assert concise production sections instead of wrapper-heavy sections
- prompt no longer contains `computer_use` or `system_use` envelope instructions

### Tool-spec contract

- internal registry emits flat production tool specs
- OpenAI/LiteLLM adapter converts flat specs into nested `function` transport objects
- OpenAI Responses adapter consumes flat specs directly without lossy conversion
- transparency validation and provider validation both accept the new internal contract

### Wrapper removal

- parser rejects removed wrapper tool names when model-facing wrappers are disabled
- parser accepts concrete tool names directly
- tool preparation and execution work from direct tool names without wrapper normalization
- allowlist and restricted sub-agent registries behave on direct tool names only

### Browser

- browser model-facing schema contains only canonical production fields
- legacy aliases remain runtime-only compatibility behavior when preserved
- stale-ref and pagination rules remain test-backed after prompt simplification

## Assumptions and Defaults

- `browser` remains a single model-facing tool in this phase.
- Internal canonical tool specs should include `strict: false` by default unless a tool is intentionally hardened for exact-schema mode.
- Production prompt quality means shorter and more behavior-focused, not more verbose.
- If needed, this work can land in two PRs:
  - PR 1: flat internal tool-spec contract plus direct-tool model surface
  - PR 2: system prompt rewrite and browser production-schema cleanup
