---
summary: "Deep reference for Browser Use agent core models: settings, loop detection hashing/fingerprints, action/result schema validation, dynamic AgentOutput variants, history serialization with sensitive-data filtering, and error formatting policy."
read_when:
  - When editing `agent/views.py` models that define planner state, action outputs, or history serialization behavior.
  - When debugging loop nudges, sensitive-data masking in saved traces, or structured-output validation and recovery messaging.
title: "Agent State, Output Schema, Action Results, History, and Error Handling Contract Reference"
---

# Agent State, Output Schema, Action Results, History, and Error Handling Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/agent/views.py`

## Agent Settings and Compaction Models

`MessageCompactionSettings`:

- enforces mutual exclusivity between `trigger_char_count` and `trigger_token_count`
- derives char threshold from token threshold using `chars_per_token`
- defaults to `40000` chars when no explicit trigger is provided

`AgentSettings` includes runtime flags for:

- vision usage/detail level
- flash mode behavior (disables thinking/evaluation-next-goal fields)
- judge and planning toggles
- per-step/model timeout limits
- loop detection window and enablement

## Loop Detection Contract

`PageFingerprint`:

- immutable model (`frozen=True`) of `(url, element_count, text_hash)`
- hash uses first 16 hex chars of SHA-256 over DOM text

Action hashing:

- `search`: normalized token set and engine
- `click`/`input`: index-based identity (input includes normalized text)
- `navigate`: full URL
- `scroll`: direction + index
- fallback: sorted non-null params JSON

`ActionLoopDetector` behavior:

- tracks rolling action hash window (`window_size`)
- tracks recent page fingerprints and consecutive stagnation count
- emits escalating nudge messages at repetition counts `>=5`, `>=8`, `>=12`
- emits page-stagnation nudge when page fingerprint repeats for `>=5` steps
- advisory only; never hard-blocks execution

## Agent Runtime State Models

`AgentState` stores:

- step counters and failure counters
- current plan and plan index
- pause/stop/session flags
- follow-up-task marker
- embedded `MessageManagerState` and optional `FileSystemState`
- `ActionLoopDetector` state for loop-awareness continuity

Other coordination models:

- `AgentStepInfo` with `is_last_step()` helper
- `StepMetadata` with computed duration
- `PlanItem` (`pending/current/done/skipped`)

## Action and Judge Result Contracts

`ActionResult`:

- supports done/failure state, judgement payload, error text, attachments/images, memory/extracted content, and metadata
- validation rule: `success=True` is only valid when `is_done=True`

Judge models:

- `JudgementResult` stores verdict, reasoning, failure classification, impossible-task and captcha flags
- `SimpleJudgeResult` provides lightweight correctness check surface
- `RerunSummaryAction` carries rerun-level summary and completion status

## Agent Output Schema Variants

`AgentOutput`:

- strict schema (`extra='forbid'`)
- requires non-empty `action` list via schema metadata
- schema forces `evaluation_previous_goal`, `memory`, `next_goal`, and `action` as required by default

Dynamic model constructors:

- `type_with_custom_actions(...)`: injects custom action model list
- `type_with_custom_actions_no_thinking(...)`: removes `thinking` from schema
- `type_with_custom_actions_flash_mode(...)`: removes planning/evaluation fields and keeps only `memory` + `action`

`current_state` property backfills legacy `AgentBrain` shape.

## History Serialization and Sensitive-Data Filtering

`AgentHistory`:

- stores model output, per-action results, browser state snapshot, and optional step metadata/state-message
- `get_interacted_element(...)` resolves action indexes to interacted DOM elements
- custom `model_dump(...)` supports sensitive-data masking in action payloads only
- masking replaces configured sensitive values with `<secret>{key}</secret>` placeholders

`AgentHistoryList` provides:

- lifecycle and analytics helpers: duration, errors, result status, urls/screenshots, action names, extracted content
- serialization helpers: `save_to_file`, `load_from_file`, `load_from_dict`
- structured-output parsing helpers for final extracted payload
- `action_history()` view that includes interacted element and long-term memory only

## Error Formatting Policy

`AgentError.format_error(...)` behavior:

- `ValidationError` -> canonical invalid-output guidance
- `openai.RateLimitError` -> explicit rate-limit guidance
- malformed LLM format errors (`LLM response missing required fields` / `Expected format: AgentOutput`) -> compact, user-facing correction guidance with optional trace
- optional trace appends full stacktrace

## Variable Detection Models

`DetectedVariable` and `VariableMetadata` provide typed structures for variable extraction metadata attached to history workflows.

## Related Docs

- [Frontend Sidecar Browser Use Agent Docs Hub](README.md)
- [Agent Message History and Compaction State Contract Reference](message_history_and_compaction_state_contract_reference.md)
- [Frontend Sidecar Browser Use Tools Docs Hub](../tools/README.md)
- [Frontend Sidecar Browser Use Tokens Docs Hub](../tokens/README.md)
