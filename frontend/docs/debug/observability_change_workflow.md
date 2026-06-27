---
summary: "Workflow for adding or changing runtime logs, trace flags, diagnostic events, metrics, evidence collection, and debug gates across backend, Electron main, renderer, local-runtime Python, and packaged app runtimes."
read_when:
  - When adding, removing, or renaming logs, trace flags, diagnostic events, metrics, or evidence collection paths.
  - When a bug needs new observability before a safe code fix can be made.
  - When deciding where debug output belongs across backend, Electron main, renderer, local-runtime Python, packaged app, and hosted runtime boundaries.
title: "Observability Change Workflow"
---

# Observability Change Workflow

Use this workflow before adding logs or diagnostic flags. Observability should prove which runtime owns a failure without creating always-on noise, leaking secrets, or corrupting local-runtime Python JSON-RPC stdout.

## Fast Owner Map

| Need | First owner | Source roots | Start docs | Tests |
| --- | --- | --- | --- | --- |
| backend log profile, logger level, third-party noise filtering | backend logging setup | private backend implementation | [Logging](logging.md), Backend Core Logging Profile Contracts (private backend docs) | private backend tests |
| backend security/trust-boundary metrics | backend observability service | private backend implementation, trust-boundary parsers/enforcers | Backend Trust-Boundary Metrics and Enforcement (private backend docs) | private backend tests |
| stream, websocket, or query event trace | backend formatter/transport plus Electron relay and SDK/renderer stream | private backend implementation, `frontend/src/main/ipc.cjs`, `frontend/src/renderer/features/chat` | [Runtime Traces](runtime_traces.md), Query Lifecycle Change Workflow (private backend docs) | backend formatter/websocket tests plus SDK/renderer stream tests |
| chat pill, response overlay, or screenshot trace | Electron main surface runtime and overlay phase handlers | `frontend/src/main/debug/chat_pill_trace_runtime.cjs`, `frontend/src/main/overlay_*`, `frontend/src/main/surfaces` | [Runtime Traces](runtime_traces.md), [Platform Change Workflow](../platforms/platform_change_workflow.md) | overlay/phase tests |
| app startup, sidebar chat-list, browser session readiness, or non-turn diagnostics that must survive restart | Electron main app diagnostics store plus producer runtime | `frontend/src/main/diagnostics/app_diagnostics_store.cjs`, SDK/runtime producer, local-runtime Python producer | [Runtime Traces](runtime_traces.md), [Storage Persistence Change Workflow](../architecture/storage_persistence_change_workflow.md) | app diagnostics store tests plus focused producer tests |
| tool execution or tool screenshot debug output | SDK tool routing and local-runtime screenshot capture | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts`, `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs` | [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md), [Runtime Traces](runtime_traces.md) | SDK tool/runtime tests, local-runtime Python screenshot tests |
| local-runtime stderr logging or system metrics | local-runtime Python implementation | `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/core/system_metrics.py`, local-runtime Python implementation modules | [Logging](logging.md), Process Health Checklist (private backend docs) | local-runtime Python focused pytest, `tests/sidecar/test_system_metrics_and_watermark_state.py` |
| packaged app log controls | reinstall helpers and Electron launch/runtime env | `<windie> reinstall <platform>`, `frontend/scripts/electron-launcher.cjs`, `frontend/src/main` | [Packaging and Reinstall Runbooks](../operations/packaging_and_reinstall_runbooks.md), [Packaging Runtime Matrix](../platforms/packaging_runtime_matrix.md) | package smoke helpers and target OS manual checks |

## Rules

- Add the smallest diagnostic signal that proves the boundary.
- Use durable `trace_event` rows for turn-scoped path timelines that must
  survive restart; use console/debug logs only as live mirrors.
- Use the persistent app diagnostics database for non-turn app/runtime paths
  that can fail before a conversation or turn exists.
- Keep verbose traces opt-in behind env flags, URL params, or test-only gates.
- Do not log secrets, bearer tokens, API keys, install tokens, file contents, or full screenshots.
- Do not write debug text to local-runtime Python stdout. Local-runtime Python stdout is protocol traffic.
- Prefer structured fields such as `user_id`, `session_id`, `conversation_ref`, `turn_ref`, `request_id`, and `bundle_id` over long prose.
- Redact or summarize payloads at trust boundaries.
- Update [Diagnostic Flags](diagnostic_flags.md) when adding, renaming, or removing a flag.
- Add tests for gating logic when logs/traces affect runtime behavior.

## Change Sequence

1. Identify the runtime that produces the missing evidence.
2. Check existing docs and flags before adding a new flag.
3. Decide whether the signal is always-on high-signal logging, opt-in trace output, test-only logging, or operational evidence.
4. Add the signal at the producer boundary, not the visible consumer symptom.
5. Gate verbose output and keep defaults quiet.
6. Add or update tests for logger setup, trace gating, metrics collection, or evidence serialization.
7. Update [Logging](logging.md), [Runtime Traces](runtime_traces.md), [Diagnostic Flags](diagnostic_flags.md), and operational runbooks as needed.

## Backend Logging Changes

Use backend logging for hosted backend events, provider failures, route/handler decisions, session lifecycle, and tool orchestration.

Primary files:

- private backend implementation
- private backend implementation
- private backend implementation
- feature modules under private backend implementation

Validation:

- private backend tests
- private backend tests
- feature tests that assert error handling or sanitized output.

Rules:

- Keep `WINDIEOS_LOG_PROFILE=important` high signal.
- Use `LOG_LEVEL=DEBUG` and `WINDIEOS_LOG_PROFILE=verbose` for broad debug.
- Keep third-party debug noise suppressed unless explicitly enabled.
- Use sanitized user-facing messages for client responses and full exception details only in server logs.

## Electron and Renderer Trace Changes

Use Electron/renderer traces for event ordering, window/overlay state, screenshot/capture timing, and renderer state transitions.

Primary files:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/debug/chat_pill_trace_runtime.cjs`
- `frontend/src/main/surfaces/main_window_overlay_runtime.cjs`
- `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts`
- `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`

Validation:

- focused stream/overlay/tool execution tests.

Rules:

- Use existing flags before adding new ones:
  - `WINDIE_DEBUG_STREAM_EVENTS`
  - `WINDIE_DEBUG_CHAT_PILL`
  - `WINDIE_DEBUG_TOOL_SCREENSHOT`
  - `WINDIE_DEBUG_GHOST_OVERLAY`
- Do not leave trace logs always on in packaged flows.
- Include turn/request identifiers when tracing stream or tool events.
- Avoid logging full user content unless the trace is explicitly developer-only and documented.

## Local-Runtime Python Logging Changes

Use local-runtime Python logs for local JSON-RPC execution, local tools, memory, browser runtime, wakeword subprocesses, and system metrics.

Primary files:

- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/core/ipc_protocol.py`
- `frontend/src/main/python/core/system_metrics.py`
- `frontend/src/main/python/tools/**`
- `frontend/src/main/python/memory/**`
- `frontend/src/main/python/wakeword_service.py`

Validation:

- focused local-runtime Python pytest for changed module.
- Electron bridge tests when stderr forwarding changes.

Rules:

- Log to stderr only.
- Keep stdout reserved for JSON-RPC frames.
- Use `WINDIE_SIDECAR_LOG_LEVEL=DEBUG` for debug verbosity.
- Use `WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR` only for explicit packaged/source debugging.
- Do not dump file contents, shell outputs, browser page text, or memory facts unless explicitly part of a sanitized tool result.

## Operational Evidence Changes

Use operational evidence docs when the signal is needed for incident triage, hosted debugging, packaged app issues, or handoff reports.

Primary docs:

- Evidence Collection Runbook (private backend docs)
- Incident Triage Runbook (private backend docs)
- [Evidence Packet](../help/evidence_packet.md)
- Process Health Checklist (private backend docs)

Rules:

- Evidence should identify runtime, version/build mode, endpoint, OS, command, and first failing boundary.
- Evidence should avoid private user content unless the user explicitly provides it for debugging.
- Packaged evidence should mention install path, package type, and local reinstall helper output.
- Hosted evidence should include route/status/close code, not raw tokens.

## Review Checklist

- The signal belongs to the producing runtime.
- Verbose output is gated.
- Local-runtime Python stdout remains protocol-only.
- Secrets and user data are redacted or omitted.
- Diagnostic flags docs are updated for flag changes.
- Tests cover gating or serialization when behavior changed.
- The evidence path gives an agent enough identifiers to route the bug without broad searching.

## Related Docs

- [Logging](logging.md)
- [Runtime Traces](runtime_traces.md)
- [Diagnostic Flags](diagnostic_flags.md)
- Process Health Checklist (private backend docs)
- Evidence Collection Runbook (private backend docs)
- [Runtime Boundary Matrix](../architecture/runtime_boundary_matrix.md)
