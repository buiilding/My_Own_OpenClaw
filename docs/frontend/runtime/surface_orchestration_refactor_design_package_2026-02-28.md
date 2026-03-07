---
summary: "No-code design package for frontend surface lifecycle orchestration refactor: state machine, ownership boundaries, touchpoint inventory, invariants, and phased migration plan."
read_when:
  - When refactoring tool execution surface lifecycle across renderer/main/sidecar.
  - When changing focus, click-through, overlay visibility, stop semantics, or screenshot timing.
title: "Surface Orchestration Refactor Design Package (2026-02-28)"
---

# Surface Orchestration Refactor Design Package (2026-02-28)

## Goals

- Preserve current behavior while reducing cross-file coupling for tool execution surface control.
- Introduce single source of truth for renderer-side surface lifecycle transitions.
- Make race conditions diagnosable via deterministic correlation-id transition logs.
- Keep dev/prod behavior gates explicit and testable.

## State Machine (Execution + Surface)

Two coordinated state machines are required.

### A) Stream/turn phase machine (backend-event driven)

States:

- `idle`
- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`
- `complete`
- `error`

Primary transitions:

- `idle -> awaiting-first-chunk` on `local-user-message`
- `awaiting-first-chunk -> streaming` on first `streaming-response`
- `streaming|awaiting-first-chunk -> tool-call` on `tool-call|tool-bundle`
- `tool-call -> awaiting-first-chunk` on `tool-output`
- `awaiting-first-chunk|streaming|tool-call|tool-output -> complete` on `streaming-complete`
- non-`idle` -> `error` on non-ignored `error`
- any -> `idle` on websocket reconnect/close reset

### B) Surface execution phase machine (renderer orchestrator driven)

States:

- `idle`
- `preparing_interactive_focus`
- `interactive_ready`
- `preparing_capture_visibility`
- `capture_ready`
- `executing_tool`
- `restoring_surface`
- `failed_terminal`

Transitions by mode:

- `idle -> preparing_interactive_focus` for interactive computer tool turns
- `preparing_interactive_focus -> interactive_ready` after bounded focus verification + click-through enable
- `interactive_ready -> executing_tool` when tool dispatch starts
- `executing_tool -> restoring_surface` on success/failure completion
- `restoring_surface -> idle` after click-through and visibility restore
- `idle -> preparing_capture_visibility` for screenshot/capture paths
- `preparing_capture_visibility -> capture_ready` after hide-before-capture completes
- `capture_ready -> executing_tool` for screenshot/system-state capture
- any prepare state -> `failed_terminal` when bounded retries exhaust or IPC preparation fails
- `failed_terminal -> restoring_surface` for best-effort cleanup, then `idle`

Correlation key:

- every transition carries deterministic `correlationId` (`request_id`, `bundle_id`, or event fallback id).

## Ownership Map (Renderer/Main/Sidecar)

Renderer (`frontend/src/renderer`):

- owns tool/stream state and UI state transitions.
- owns surface intent resolution (`none|interactive|capture`) from tool metadata.
- owns transition logging schema and correlation-id propagation.
- owns pre/post-execution orchestration contract invocation against main IPC.

Main (`frontend/src/main`):

- owns overlay window primitives (show/hide, focus demotion, click-through flag).
- owns external focus tracking and verification capability (`canVerifyExternalFocus`, `externalFocusActive`).
- owns response overlay phase visibility behavior and renderer broadcasts.
- must remain side-effect primitive provider, not duplicate renderer orchestration policy.

Sidecar (`frontend/src/main/python`):

- owns actual tool execution and screenshot/system-state production.
- must not own overlay/focus/chat-pill state policy.
- receives stable tool-result and bundle-result payload contracts from renderer/main pipeline.

## Current Touchpoint Inventory

Renderer touchpoints:

- `features/chat/hooks/useToolRunner.ts` (tool-call/bundle intake + surface prep wiring)
- `features/chat/utils/toolRunner/toolRunnerSurface.ts` (surface mode resolution + tokenized prep/restore)
- `infrastructure/services/{ScreenshotAttachmentPipeline,SystemStateCapture}.ts` (current split capture services that replaced mixed capture orchestration)
- `infrastructure/services/ToolExecutionCapture.ts` (autocapture entry)
- `infrastructure/services/ToolExecutionService.ts` (tool/bundle execution + backend send)
- `features/chat/hooks/useChatStream.ts` and `useChatStreamToolHandlers.ts` (phase updates and tool message rows)
- `types/backendEvents.ts` (event contract types)

Main touchpoints:

- `ipc.cjs` + `ipc_runtime_helpers.cjs` (backend message -> overlay phase mapping)
- split IPC registrars (`overlay_phase_ipc_runtime.cjs`, `window_controls_ipc_runtime.cjs`, `permission_ipc_runtime.cjs`) now own show/hide and related main-process control channels; legacy focus-prep/click-through RPCs are gone
- `main_window_runtime.cjs` (focus demotion + external focus verify)
- `window_visibility_runtime.cjs` (chat/main visibility policy)
- `external_focus_tracker.cjs` (platform focus tracking)

Sidecar touchpoints:

- `main/python/tools/computer/screenshot_tool.py` and system-state providers via `get-system-state`
- no surface policy code expected here (contract boundary only)

## Target Architecture

Renderer introduces `SurfaceOrchestrator` (single source of truth):

- typed transition API (`beginToolExecution`, `beginCapture`, `markExecutionStart`, `markExecutionDone`, `failPreparation`, `restore`).
- unified token/reference tracking for overlapping operations.
- mode resolver (`none|interactive|capture`) centralized.
- single place for focus retry policy and max-attempt bounds.
- single place for hide-before-capture/show-after logic.
- deterministic logs per transition with snapshot (`phase_before`, `phase_after`, `correlation_id`, `attempt`, `reason`).

Contract normalization:

- backend-event-to-UI phase payload accepts optional recovery metadata:
  - `correlation_id`, `attempt`, `max_attempts`, `recovery_stage`, `failure_reason`.
- renderer listeners must tolerate absent metadata (backward compatible) and use it when present.

Main/sidecar boundary:

- main remains primitive executor for overlay/focus IPC requests.
- sidecar remains tool executor/capture producer.
- renderer orchestrator is policy owner.

## Explicit Invariants

Focus invariants:

- interactive tool execution must not dispatch until focus prep returns success.
- if focus verification is supported, prep must either verify external focus within bounded attempts or fail closed.
- focus prep failures must produce explicit terminal failure payloads (not silent drop).

Click-through invariants:

- click-through enabled only within interactive execution window.
- click-through must always be restored on all terminal paths (success, failure, cancellation).
- overlapping interactive executions require reference counting; click-through disabled only when final token restores.

Overlay visibility invariants:

- screenshot/capture flow uses hide-before-capture and show-after-capture when dashboard/main window is visible.
- overlapping capture flows must not restore early.
- restore path is best-effort and never blocks terminal tool-result delivery.

Stop control availability invariants:

- stop remains available whenever stream phase is `awaiting-first-chunk|streaming|tool-call|tool-output` or send latch active.
- surface orchestration transitions must not suppress stop UI transitions.

Screenshot timing invariants:

- hide-before-capture must complete before screenshot invocation.
- show-after-capture must happen after capture completes/fails and after final overlapping capture token releases.
- capture wait delay and timing fields must be logged with the same correlation id as transition logs.

## Migration Plan

Phase 0 (no-code spec + inventory):

- land this design package.

Phase 1 (orchestrator extraction, no behavior change):

- add `SurfaceOrchestrator` module with typed APIs and log envelope.
- keep existing IPC primitives and constants unchanged.
- mirror existing retry values and timing constants.

Phase 2 (consumer migration):

- migrate `useToolRunner` to orchestrator APIs.
- migrate screenshot and system-state capture services onto orchestrator capture APIs.
- remove duplicated token/toggle/retry logic from legacy helpers.

Phase 3 (event contract standardization):

- normalize overlay-phase payload types to include optional recovery metadata.
- keep backward compatibility for older payload shape.
- preserve current phase progression semantics.

Phase 4 (tests + docs + hardening):

- scenario tests for race-prone flows:
  - tool start/stop timing
  - click-through windows
  - hide-before-capture/show-after
  - focus verification retries + bounded exhaustion
  - recovery after failed surface prep
- update architecture/runtime docs with new boundaries and contract tables.

## Non-goals

- No sidecar tool behavior changes.
- No backend query semantics changes.
- No UX redesign of chat-pill/dashboard visuals.

## Acceptance Mapping

- behavior preserved: phase mapping and IPC channels unchanged at API level.
- fewer files touched: new surface changes concentrate in orchestrator + typed contracts.
- single source of truth: all renderer surface transitions route via orchestrator.
- proof: new/updated scenario tests pass for transition stability and race handling.
