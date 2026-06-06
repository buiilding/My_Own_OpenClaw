---
summary: "Plan for adding a provider-agnostic transient retry policy for backend LLM sampling without replaying query or tool side effects."
read_when:
  - When changing backend LLM provider error mapping, streaming retry behavior, provider transient failure handling, or interaction-loop failure semantics.
  - When debugging OpenAI, Anthropic, Gemini, Kimi, OpenRouter, or other hosted model 5xx, timeout, reset, or transient provider failures.
title: "Provider Transient Retry Policy Plan"
---

# Provider Transient Retry Policy Plan

## User Intent

The user observed a live hosted backend error where OpenAI returned a transient
Responses API failure:

```text
HTTP 503 Service Unavailable
upstream connect error or disconnect/reset before headers
reset reason: connection timeout
```

The user wants WindieOS to retry this class of rare provider-side failure
safely. The retry must not duplicate the user query, duplicate conversation
history rows, replay local tools, or become an OpenAI-only branch that cannot be
reused for future hosted model providers.

## Architectural Change

Add a provider-agnostic retry policy around backend LLM sampling:

```text
InteractionLoop
  owns turn semantics, history commit decisions, tool-loop continuation

LLMStreamProcessor
  owns one model sampling operation and bounded retry attempts for that sampling

Provider adapters/base provider wrapper
  own raw provider/library exception normalization into structured metadata

Retry policy helper
  owns classification, attempt budget, and backoff
```

The retry boundary is the provider sampling attempt after the prompt has been
built and before assistant output or tool side effects are committed.

The retry boundary must not wrap:

- websocket query handling
- user-message history admission
- interaction-loop tool execution
- frontend or SDK query resend behavior

## Source Of Truth Changes

Current behavior:

- `backend/src/llm/providers/base.py` catches streaming provider exceptions and
  emits an `ErrorEvent`.
- `backend/src/agent/llm/llm_stream_processor.py` forwards that error event.
- `backend/src/agent/execution/interaction_loop.py` treats non-recoverable LLM
  stream errors as terminal, emits a sanitized failure, and records one
  assistant-side error marker.

Target behavior:

- Provider wrappers attach normalized error metadata to provider `ErrorEvent`
  values.
- `LLMStreamProcessor` applies one shared transient retry policy before the
  terminal error reaches `InteractionLoop`.
- `InteractionLoop` remains responsible for final turn failure semantics and
  should not gain provider-specific retry branches.

## Runtime Ownership

Backend owns this change. It is model-provider orchestration and prompt sampling
behavior.

No frontend, preload, Electron main, SDK, or Python sidecar runtime should own
the retry mechanic. Those runtimes may receive the final successful stream or
the final exhausted error, but they should not replay the query.

## Retry Contract

Retry only when all are true:

- the failure is normalized as transient or server-side
- no assistant text, thinking block, web-search progress, tool call, or other
  downstream-visible model output has been emitted for the attempt
- no tool call has been dispatched to local runtime or backend remote execution
- attempts remain

Initial retryable classes:

- HTTP `502`
- HTTP `503`
- HTTP `504`
- connection timeout before response headers
- upstream disconnect or reset before response headers
- temporary transport failure where no provider response was completed

Special handling:

- `429` should not use blind immediate retry. Preserve existing rate-limit
  handling unless a later approved slice adds `Retry-After`-aware backoff.
- context overflow should continue using the existing compaction recovery path.
- recoverable tool-call formatting errors should continue using the existing
  synthetic tool-output correction path.

Non-retryable classes:

- `400`, `401`, `403`, `404`, `422`
- invalid schema/request payload errors
- missing/invalid credentials
- unavailable model/configuration errors
- provider response parsing errors after partial output
- failures after any local or backend tool side effect starts

## Normalized Error Metadata Contract

Provider errors should expose metadata shaped like:

```python
{
    "provider": "openai",
    "status_code": 503,
    "error_kind": "server_error",
    "retryable": True,
    "transient": True,
    "retry_after_seconds": None,
}
```

`error_kind` should be provider-agnostic. Proposed values:

- `rate_limit`
- `transient_network`
- `server_error`
- `auth`
- `invalid_request`
- `context_overflow`
- `tool_call_format`
- `unknown`

The retry policy should prefer metadata. Bounded string matching is acceptable
only as a compatibility fallback for provider/library errors that cannot yet
produce structured metadata.

## Attempt Budget And Backoff

Initial policy:

- total attempts: `2`
- retries: `1`
- backoff: short fixed or jittered delay, approximately `0.5s` to `1.0s`
- retry budget applies per LLM sampling attempt, not per whole query

This intentionally covers rare upstream blips without masking repeated provider
outages or adding long latency to every failed turn.

## Workflow

1. Reread canonical docs and code anchors:
   - `docs/backend/agent/llm/llm_stream_processor_token_count_and_cache_diagnostics_reference.md`
   - `docs/backend/agent/interaction_loop_and_tool_turn_orchestration_reference.md`
   - `docs/debug/error_failure_change_workflow.md`
   - `backend/src/llm/providers/base.py`
   - `backend/src/agent/llm/llm_stream_processor.py`
   - `backend/src/agent/execution/interaction_loop.py`
   - `tests/backend/test_llm_provider_base.py`
   - `tests/backend/test_llm_stream_processor.py`
   - `tests/backend/test_interaction_loop.py`
2. Inspect recent commits and blame around provider error mapping and
   interaction-loop stream error handling.
3. Add normalized transient metadata at the provider-wrapper boundary.
4. Add a small shared retry policy helper for classification and backoff.
5. Teach `LLMStreamProcessor` to retry the provider sampling attempt only when
   the attempt emitted no downstream-visible output.
6. Keep `InteractionLoop` provider-agnostic. It should continue to see only a
   successful final stream or the exhausted terminal error.
7. Add focused backend tests.
8. Run validation and inspect live code paths again before marking complete.
9. Update docs and changelog for the new retry contract.

## Checklist

- [ ] Provider error metadata includes status code, provider, kind, retryable,
  transient, and optional retry-after fields where available.
- [ ] Retry classifier is provider-agnostic and metadata-first.
- [ ] `LLMStreamProcessor` retries only pre-output transient failures.
- [ ] Retry attempts are logged with provider, status/kind, attempt count, and
  delay.
- [ ] Exhausted retries emit one final terminal error to `InteractionLoop`.
- [ ] `InteractionLoop` remains free of OpenAI-specific retry logic.
- [ ] User-message history admission is not replayed by retry.
- [ ] Tool execution is never replayed by retry.
- [ ] Docs describe the retry boundary and provider metadata contract.
- [ ] `CHANGELOG.md` records the behavior change before commit.

## Tests

Add or update focused backend tests for:

- pre-output HTTP `503` retries once and then succeeds
- pre-output HTTP `503` retries once and then emits one final error
- pre-output HTTP `502`/`504` classify as retryable
- `400`/`401`/invalid request errors do not retry
- `429` preserves rate-limit behavior and does not use blind immediate retry
- provider error after a `ChunkEvent` does not retry
- provider error after a thinking/progress event does not retry
- interaction loop does not duplicate the admitted user history row
- interaction loop does not rerun tool dispatch after any tool call starts

## Validation Commands

Run focused tests first:

```bash
./scripts/python-in-env backend pytest tests/backend/test_llm_provider_base.py
./scripts/python-in-env backend pytest tests/backend/test_llm_stream_processor.py
./scripts/python-in-env backend pytest tests/backend/test_interaction_loop.py
```

Then run broader backend validation if the touched surface warrants it:

```bash
bin/windie test backend
bin/windie docs list
git diff --check
```

## Success Criteria

- A transient provider 5xx/timeout/reset before output is retried once inside
  the same LLM sampling operation.
- A successful retry is invisible to the frontend except for normal final
  output timing.
- A failed retry sequence emits one final sanitized error and one assistant-side
  failure marker.
- No query handler, frontend sender, SDK sender, or Electron bridge resubmits
  the user query.
- No local or backend tool execution is replayed by retry.
- The retry path is reusable by future providers through normalized metadata,
  not OpenAI-specific string checks.

## Out Of Scope

- Retrying whole websocket queries.
- Retrying user-message history admission.
- Retrying local tool execution or backend remote tool execution.
- Retrying after partial assistant text is already visible.
- Adding user-facing retry buttons.
- Adding long provider-failover chains across multiple model providers.
- Changing provider model catalogs or selected-model routing.
- Changing rate-limit policy beyond preserving existing behavior.

## Assumptions

- The observed OpenAI `503` timeout is transient and can be retried safely when
  no output has been emitted.
- Provider retry should be deterministic and conservative before adding more
  advanced retry-after, circuit-breaker, or provider-failover behavior.
- Existing context-overflow and recoverable tool-call correction paths remain
  separate from transient provider retry.

## Approval Gate

Do not edit runtime code until the user approves this plan. If the user changes
the retry boundary, retry budget, or provider metadata contract, update this
plan first and ask for approval again.
