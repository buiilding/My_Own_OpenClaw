---
summary: "Backend trust-boundary observability reference: violation metrics model, lock/sample semantics, DI lifecycle wiring, and parser/prompt exception tagging behavior."
read_when:
  - When adding trust-boundary checks (size/timeout/validation) and you need consistent metrics emission.
  - When debugging why `boundary_name` metadata is missing from errors, logs, or per-boundary stats.
title: "Trust-Boundary Metrics and Enforcement Reference"
---

# Trust-Boundary Metrics and Enforcement Reference

## Canonical Modules

- `backend/src/core/observability/trust_boundary_metrics.py`
- `backend/src/core/infrastructure/exceptions.py`
- `backend/src/core/container/core_container.py`
- `backend/src/core/container/session_runtime.py`
- `backend/src/core/container/session_factory.py`
- `backend/src/llm/parser.py`
- `backend/src/llm/prompts/prompt_constructor.py`

## Purpose

Trust-boundary observability tracks hostile-input guardrail violations with consistent structured counters + metadata across parser and prompt-construction boundaries.

Current boundary producers:

- `response_parser` (`ResponseParser`)
- `prompt_constructor` (`PromptConstructor`)

## Metrics Model (`BoundaryViolationMetrics`)

Per-boundary counters:

- `size_limit_violations`
- `timeout_violations`
- `validation_violations`
- `total_violations`

Bounded history buffers:

- `rejected_sizes: deque(maxlen=METRICS_HISTORY_LIMIT)`
- `timeout_durations: deque(maxlen=METRICS_HISTORY_LIMIT)`
- `violation_details: deque(maxlen=METRICS_HISTORY_LIMIT)`

Defaults:

- `METRICS_HISTORY_LIMIT = 1000`
- `STATS_SAMPLE_WINDOW = 100`

All mutation paths are lock-protected via per-metrics `_lock`.

## Violation Recording APIs

### `record_size_violation(...)`

Stores:

- `actual_size`, `max_size`, `boundary_name`, timestamp, metadata

Also emits structured warning log with ratio.

### `record_timeout_violation(...)`

Stores:

- `timeout_seconds`, `boundary_name`, timestamp, metadata

### `record_validation_violation(...)`

Stores:

- list of validation errors
- boundary name + metadata

## Stats Snapshot Semantics

`get_stats()`:

1. copies metric buffers under lock
2. performs numeric aggregation outside lock
3. returns bounded-window stats (`last STATS_SAMPLE_WINDOW entries`)

Returned shape includes:

- violation counters
- `rejected_size_stats` (`count/min/max/avg`)
- `timeout_stats` (`count/min/max/avg`)

This avoids long-held locks during aggregation.

## Metrics Service Registry (`MetricsService`)

`MetricsService` owns boundary metric instances.

Behavior:

- lazily creates metrics per boundary name
- sets `metrics.boundary_name` on first access
- provides `get_all_metrics()` snapshot for all boundaries
- provides `reset_all_metrics()` for test isolation

Threading design:

- registry-level `_metrics_lock` only protects map access
- per-boundary stats retrieval happens after releasing registry lock

## DI Wiring and Session Lifecycle

Container wiring:

- `CoreContainer.metrics_service = providers.Singleton(MetricsService)`

Session wiring path:

1. `SessionRuntimeCoordinator` passes `core.metrics_service()` into `AgentSessionFactory`
2. `AgentSessionFactory.create_session(...)` passes it to `AgentSession`
3. `init_prompt_and_history(...)` builds `PromptConstructor(..., metrics_service=...)`

Parser wiring:

- parser constructor accepts injected `metrics_service`
- fallback behavior creates local `MetricsService()` if not injected

Operational implication:

- DI path gives shared, process-level metrics registry.
- non-DI instantiation isolates metrics per object instance.

## Exception and Metadata Conventions

Trust-boundary exceptions inherit `_TrustBoundaryError` in `exceptions.py`:

- `InputSizeLimitError`
- `ParseTimeoutError`
- `ParseValidationError`

Metadata merge helper `_merge_trust_boundary_metadata(...)` attaches:

- `boundary_name`
- optional boundary-specific fields (`actual_size`, `max_size`, `timeout_seconds`, `validation_errors`)

This keeps error payloads and logs aligned with metrics boundary identifiers.

## Enforcement Path Examples

### Parser boundary (`ResponseParser`)

- pre-parse response-size gate -> records size violation + raises `InputSizeLimitError`
- executor timeout -> records timeout violation + raises `ParseTimeoutError`
- tool-call count/validation overflow -> records validation violation + raises `ParseValidationError`

### Prompt-constructor boundary (`PromptConstructor`)

- trust-boundary comments + metrics service injection path are in place
- XML metadata extraction methods are bounded by configured message-content limits
- tool schema emission is policy-filtered before transparency/runtime use

## Test-Backed Invariants

`tests/backend/test_trust_boundary_metrics.py` validates:

- bounded history buffers honor `METRICS_HISTORY_LIMIT`
- stats sampling window honors `STATS_SAMPLE_WINDOW`
- `get_all_metrics()` does not hold registry lock while collecting per-boundary stats
- `reset_all_metrics()` clears counters across boundaries

`tests/backend/test_response_parser_limits.py` validates parser-side enforcement triggers:

- too many tool calls -> `ParseValidationError`
- oversized JSON -> `InputSizeLimitError`
- parameter/depth limits -> `ParseValidationError`

## Drift Hotspots

1. Creating ad-hoc `MetricsService()` outside DI can fragment metrics visibility.
2. New trust-boundary checks without `record_*_violation(...)` calls become invisible to observability.
3. Raising boundary exceptions without `boundary_name` breaks cross-layer diagnostics consistency.
4. Long-lived high-volume boundaries depend on bounded deques; changing limits affects tuning dashboards and memory footprint.
