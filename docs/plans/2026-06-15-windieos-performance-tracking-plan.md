---
title: WindieOS Performance Tracking Plan
date: 2026-06-15
status: proposed
---

# WindieOS Performance Tracking Plan

## Goal

Create a first-class WindieOS performance tracking system that explains where
time is spent across the desktop app, SDK runtime, hosted backend, provider
calls, sidecar tools, and UI surfaces.

The target is not one generic "app performance" number. WindieOS should expose
structured timelines and summaries that answer:

- how long startup took;
- how long a user send took to become a backend turn;
- how long the provider took to produce the first visible response;
- how long local tools, sidecar RPC, browser actions, MCP calls, screenshots,
  and artifact transfers took;
- whether slow behavior came from renderer, Electron main, SDK, backend,
  provider, sidecar, local tool execution, or UI surface transitions.

## User Intent

Performance diagnostics should be useful to a developer or operator without
forcing them to scrape aggregate logs, inspect renderer state, or guess which
runtime was slow. The system should preserve WindieOS ownership boundaries:

- conversation-scoped turn performance belongs in hidden durable
  `trace_event` rows;
- pre-conversation and app/runtime performance belongs in persistent app
  diagnostics;
- live logs remain a mirror for development, not the source of truth.

## Current Foundation

WindieOS already has the core substrate needed for performance tracking:

- app diagnostics discovery and inspection through
  `bin/windie diagnostics paths` and `bin/windie diagnostics list`;
- persistent app diagnostics for paths such as `desktop.startup`,
  `frontend.interaction`, `surface.visibility`, `local_backend.lifecycle`,
  `browser.session_control`, `mcp.execution`, and `wakeword.lifecycle`;
- hidden conversation `trace_event` rows for turn-scoped paths such as
  `query.dispatch`, `backend.stream`, `backend.prompt`, `provider.call`,
  `tool.execution`, `sidecar.rpc`, `artifact.upload`, `screenshot.capture`,
  `memory.retrieval`, and related runtime paths;
- conversation trace inspection through `bin/windie trace` and
  `bin/windie conversation traces`;
- layer-owned logs for Vite, Electron main, renderer, sidecar, backend, and the
  aggregate frontend stream.

The missing piece is a performance model over those rows: stable service-level
indicators, duration budgets, aggregation commands, regression checks, and
operator-facing summaries.

## Ownership Decision

Performance events must be emitted at the runtime that owns the measured work.

| Performance area | Owner | Durable store |
| --- | --- | --- |
| App launch, process readiness, app quit cleanup | Electron main | App diagnostics |
| Renderer interaction breadcrumbs | Renderer through Electron main | App diagnostics |
| Chat pill and overlay surface transitions | Electron main and SDK projection owner | App diagnostics or turn trace by scope |
| Conversation send and active turn creation | SDK runtime | Conversation `trace_event` |
| Backend websocket stream lifecycle | Backend plus SDK transport ingress | Conversation `trace_event` |
| Prompt construction and provider call | Backend | Conversation `trace_event` |
| Tool dispatch and result return | SDK tool coordinator plus sidecar/backend producer | Conversation `trace_event` |
| Local machine authority and tool execution | Python sidecar | Conversation `trace_event` or app diagnostics by scope |
| Browser, MCP, wakeword, permissions before a turn exists | Owning app/runtime producer | App diagnostics |

Renderer UI may display performance, but it must not invent performance truth
for backend, SDK, sidecar, provider, or Electron-main behavior.

## Performance Span Contract

Use one compact span shape across both durable stores.

Required fields:

- `path`
- `stage`
- `runtime`
- `status`
- `timestamp`
- `durationMs`
- `traceId`
- `spanId`
- `parentSpanId` when nested

Context fields when available:

- `conversationRef`
- `turnRef`
- `requestId`
- `bundleId`
- `toolCallId`
- `sessionId`

Allowed metadata:

- ids that are already runtime identifiers;
- counts;
- booleans;
- bounded enum strings;
- dimensions;
- byte counts;
- status codes;
- short sanitized error summaries.

Forbidden metadata:

- user message text;
- assistant text;
- prompt text;
- tool arguments;
- tool outputs;
- screenshots or image bytes;
- browser URLs, page titles, or page text;
- file contents or selected local paths;
- provider payloads;
- credentials, tokens, API keys, install ids, or raw stack traces.

## Initial Performance SLIs

Track these first because they map to user-visible slowness and existing
runtime ownership.

| SLI | Definition | Source |
| --- | --- | --- |
| App launch to renderer usable | app process start to first usable renderer state | `desktop.startup` |
| App launch to sidecar ready | app process start to local runtime ready | `desktop.startup`, `local_backend.lifecycle`, `sidecar.lifecycle` |
| Conversation list load | dashboard/sidebar request to metadata returned | `conversation.metadata.list` |
| Send to backend accepted | user send boundary to backend query acceptance | `query.dispatch` |
| Send to first visible assistant update | user send boundary to first assistant stream/display event | `query.dispatch`, `backend.stream`, provider spans |
| Prompt build duration | backend prompt build start to completed prompt payload | `backend.prompt` |
| Provider first-token latency | provider request start to first provider response chunk | `provider.call` |
| Provider total latency | provider request start to terminal provider result | `provider.call` |
| Tool round trip | tool call emitted to result delivered back to backend | `tool.execution` |
| Sidecar RPC duration | local runtime request to response or timeout | `sidecar.rpc` |
| Screenshot capture duration | capture request to artifact-ready screenshot resource | `screenshot.capture`, `artifact.upload` |
| MCP execution duration | MCP tool call start to returned MCP result | `mcp.execution`, `tool.execution` |
| Overlay transition latency | requested phase/visibility change to final visible state | `surface.visibility`, `overlay.phase` |
| Renderer interaction latency | sanitized interaction start to completed handler/milestone | `frontend.interaction` |

## Initial Budgets

These are starting targets, not permanent product promises. They should be
revised after real baseline collection.

| Path | Initial target |
| --- | ---: |
| Warm dev renderer usable | under 3 seconds |
| Packaged cold renderer usable | under 6 seconds |
| Warm sidecar ready | under 5 seconds |
| Conversation list warm load | under 500 ms |
| Send to backend accepted | under 300 ms |
| Overlay phase transition | under 150 ms |
| Normal desktop screenshot capture | under 800 ms |
| Sidecar RPC p95 excluding browser/model-heavy calls | under 1 second |
| Local tool p95 | tracked by tool name |
| Provider first token | tracked by provider and model |
| Full turn completion | tracked by task class |

Provider and model timings should be segmented by provider/model instead of
rolled into a single global target.

## CLI Surface

Add a small performance CLI over existing diagnostics and trace data.

### `bin/windie performance summary`

Aggregate recent performance rows across app diagnostics and conversation
traces.

Required options:

```text
--since <duration-or-timestamp>
--path <path>
--json
```

Output should include:

- sample count;
- success count;
- failure count;
- p50, p95, p99, max duration;
- slowest stages;
- slowest runtime;
- top sanitized error summaries;
- data source: app diagnostics, conversation traces, or both.

### `bin/windie performance inspect <conversation-ref> <turn-ref>`

Render one turn timeline with nested spans and runtime ownership.

Output should show:

- conversation and turn refs;
- total turn duration;
- send-to-accept duration;
- first-token duration;
- provider duration;
- tool execution durations;
- sidecar RPC durations;
- artifact/screenshot durations;
- terminal status and slowest span.

### `bin/windie performance startup`

Summarize recent startup performance from app diagnostics.

Output should show:

- app launch milestones;
- renderer readiness;
- sidecar readiness;
- browser runtime readiness when present;
- permission and wakeword startup effects when present;
- failures before a conversation exists.

## Implementation Phases

### Phase 1: Contract and Baseline

1. Document the performance span contract in debug or operations docs.
2. Audit current `durationMs` coverage in app diagnostics and conversation
   traces.
3. Identify required spans that already exist and required spans that are
   missing.
4. Add no new runtime behavior until the audit names the producer, consumer,
   current signal, and gap for each SLI.
5. Create a local baseline fixture from existing diagnostics and trace rows.

Deliverable:

- a report listing current coverage, missing spans, and baseline values where
  data exists.

### Phase 2: Fill Missing Producer Spans

1. Add missing spans only at producer boundaries.
2. Reuse app diagnostics for non-turn app/runtime performance.
3. Reuse hidden `trace_event` rows for turn-scoped performance.
4. Keep verbose stdout mirrors behind existing diagnostic flags.
5. Add focused tests for span serialization, sanitization, scope routing, and
   hidden display behavior.

Deliverable:

- enough structured rows to compute the initial SLI table without scraping
  logs.

### Phase 3: CLI Aggregation

1. Add `bin/windie performance summary`.
2. Add `bin/windie performance inspect`.
3. Add `bin/windie performance startup`.
4. Keep the CLI read-only.
5. Use existing diagnostics and conversation trace readers rather than adding a
   second database.

Deliverable:

- one-command local inspection for recent performance and one-turn timelines.

### Phase 4: Regression Baselines

1. Add a deterministic local benchmark script for repeatable tasks:
   - app startup smoke;
   - conversation list load;
   - simple text turn;
   - screenshot resource turn;
   - one local sidecar tool;
   - one MCP tool when enabled in a test fixture.
2. Store baseline JSON as generated evidence, not as a hardcoded product truth.
3. Add CI checks only for deterministic serialization, required span presence,
   and obvious local-regression budgets.
4. Keep provider latency checks advisory unless a mocked provider fixture is
   used.

Deliverable:

- repeatable local evidence and low-noise CI regression checks.

### Phase 5: Hosted and Product Dashboard

1. Export sanitized aggregate metrics to hosted observability only after local
   CLI inspection works.
2. Segment metrics by build mode, app version, OS, provider, model, and runtime
   path.
3. Build dashboards around p50, p95, p99, failure rate, timeout rate, and
   slowest stage.
4. Keep raw user content out of hosted metrics.

Deliverable:

- hosted trend visibility without replacing the local durable evidence path.

## Validation Plan

Focused validation should include:

```bash
bin/windie diagnostics paths --json
bin/windie docs list
git diff --check
```

After CLI implementation, add:

```bash
bin/windie performance summary --since 24h --json
bin/windie performance startup --json
bin/windie performance inspect <conversation-ref> <turn-ref> --json
```

Focused tests should cover:

- app diagnostics duration persistence;
- conversation trace duration persistence;
- path filtering;
- CLI aggregation math;
- no raw user content in performance payloads;
- trace rows hidden from normal transcript display;
- app diagnostics used when no turn context exists.

## Success Criteria

- A developer can inspect startup performance without opening aggregate logs.
- A developer can inspect one slow turn and see which runtime consumed the
  time.
- App/runtime performance before a conversation exists does not mutate
  conversation history.
- Turn-scoped performance survives restart as hidden conversation trace rows.
- Performance summaries report p50, p95, p99, max, success count, failure
  count, and slowest stage.
- Provider timings are segmented by provider and model.
- Tool timings are segmented by tool name and execution target.
- No performance event stores user content, tool outputs, screenshots, file
  contents, provider payloads, tokens, credentials, or raw stack traces.

## Non-Goals

- Do not replace existing diagnostics, trace, or logging systems.
- Do not add a new database unless the current app diagnostics and conversation
  trace stores cannot support aggregation.
- Do not scrape `.windie/logs/frontend.log` for performance truth.
- Do not make renderer state the source of truth for backend, SDK, provider,
  sidecar, or Electron-main timings.
- Do not add broad always-on verbose logging.
- Do not add external hosted dashboards before local durable evidence and CLI
  summaries work.

## Open Questions

- Which startup milestone should be the product-facing definition of
  "usable": first renderer paint, dashboard ready, chat pill ready, or first
  successful local runtime status?
- Which task classes should define full-turn performance baselines: text-only,
  screenshot-assisted, browser action, filesystem/shell, MCP, or multi-tool?
- Should performance budgets live in docs only at first, or should deterministic
  local budgets become test fixtures once enough baseline data exists?
- Should hosted export be opt-in during early development to avoid accidental
  telemetry from local machines?
