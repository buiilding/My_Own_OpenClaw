---
summary: "Realtime execution report for provider-agnostic transient retry policy implementation."
read_when:
  - When reviewing or continuing the provider transient retry policy implementation.
  - When validating backend LLM retry behavior for transient hosted provider failures.
title: "Provider Transient Retry Policy Report"
---

# Provider Transient Retry Policy Report

Plan: [Provider Transient Retry Policy Plan](2026-06-06-provider-transient-retry-policy-plan.md)

## Status

Complete.

## Checklist

- [x] Approval received to implement the plan.
- [x] Canonical docs reread before runtime edits.
- [x] Recent commits inspected for stream error and LLM processor behavior.
- [x] Provider error metadata includes status code, provider, kind, retryable,
  transient, and optional retry-after fields where available.
- [x] Retry classifier is provider-agnostic and metadata-first.
- [x] `LLMStreamProcessor` retries only pre-output transient failures.
- [x] Retry attempts are logged with provider, status/kind, attempt count, and
  delay.
- [x] Exhausted retries emit one final terminal error to `InteractionLoop`.
- [x] `InteractionLoop` remains free of OpenAI-specific retry logic.
- [x] User-message history admission is not replayed by retry.
- [x] Tool execution is never replayed by retry.
- [x] Docs describe the retry boundary and provider metadata contract.
- [x] `CHANGELOG.md` records the behavior change before commit.
- [x] Focused validation passes.
- [x] Fresh design inspection finds no remaining in-scope violations.

## Decisions

- Retry ownership stays in backend LLM sampling. The websocket query handler,
  frontend, SDK, Electron main, and sidecar do not retry or replay user turns.
- The first implementation uses a conservative attempt budget: two total
  attempts, one retry, and no retry after any downstream-visible output.
- `429` remains rate-limit behavior, not blind transient retry.

## Inspection Log

- Initial inspection confirmed current behavior:
  - provider stream wrappers convert provider exceptions into `ErrorEvent`
  - `LLMStreamProcessor` forwards stream errors
  - `InteractionLoop` aborts non-recoverable LLM stream errors and records one
    assistant-side error marker
- Recent related commits inspected:
  - `318707bde fix(llm): sanitize streaming error events`
  - `68440f794 fix(backend-llm): mark late stream failures terminal`
  - `30bf0dc69 fix(backend-llm): serialize stream processor turns`
- Implementation inspection found retry logic confined to:
  - `backend/src/agent/llm/retry_policy.py`
  - `backend/src/agent/llm/llm_stream_processor.py`
  - `backend/src/llm/providers/error_mapping.py`
  - `backend/src/llm/providers/base.py`
- `InteractionLoop`, websocket query handling, frontend, SDK, Electron main,
  and sidecar paths were not given retry ownership.
- A nearby provider-wrapper gap was fixed: structured `LLMAPIError` values from
  streaming provider internals now remain structured `ErrorEvent` values, so
  recoverable streamed tool-call argument failures still reach the interaction
  loop correction path instead of being generic-sanitized.

## Validation Log

- Pass: `./scripts/python-in-env backend pytest tests/backend/test_llm_provider_base.py tests/backend/test_llm_stream_processor.py tests/backend/test_interaction_loop.py tests/backend/test_gemini_provider.py::test_gemini_stream_emits_error_event_when_tool_arguments_json_is_invalid tests/backend/test_kimi_coding_provider.py::test_kimi_stream_emits_error_event_when_tool_arguments_json_is_invalid -q`
- Pass: `./scripts/python-in-env backend python -m black --check backend/src/agent/llm/retry_policy.py backend/src/agent/llm/llm_stream_processor.py backend/src/llm/providers/error_mapping.py backend/src/llm/providers/base.py tests/backend/test_llm_stream_processor.py tests/backend/test_llm_provider_base.py tests/backend/test_kimi_coding_provider.py`
- Pass: `./scripts/python-in-env backend python -m isort --check-only backend/src/agent/llm/retry_policy.py backend/src/agent/llm/llm_stream_processor.py backend/src/llm/providers/error_mapping.py backend/src/llm/providers/base.py tests/backend/test_llm_stream_processor.py tests/backend/test_llm_provider_base.py tests/backend/test_kimi_coding_provider.py`
- Pass: `bin/windie docs list`
- Pass: `git diff --check`
- Fail, out of scope: `bin/windie test backend`
  - Result: `14 failed, 2152 passed`
  - Remaining failures are outside this retry surface:
    - stale stream-context equality expectations now seeing `stream_event_sequencer`
    - embedding provider tests expecting `SentenceTransformer` on the module
    - incoming websocket contract fixture drift around envelope fields
    - prompt-manager test still expecting `./bin/docs-list`
    - SDK prompt-preview tests expecting older prompt message ordering/content

## Commits

- Pending implementation commit.

## Blockers

- None.
