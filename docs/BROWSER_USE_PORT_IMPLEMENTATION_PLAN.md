---
summary: "Phased implementation plan to replace WindieOS browser_control internals with Browser Use execution while keeping WindieOS orchestration."
read_when:
  - Starting Browser Use migration work for WindieOS browser control.
  - Onboarding a new coding agent to execute browser-control porting.
  - Validating scope boundaries between WindieOS orchestration and Browser Use runtime.
---

# Browser Use Port Implementation Plan (WindieOS Orchestrator Preserved)

## Core Clarification (Non-Negotiable)

This migration does **not** replace WindieOS agent orchestration.

- WindieOS remains the **brain**:
  - conversation/session history
  - tool schema exposure
  - parser validation
  - tool policy/filtering
  - tool-result routing and frontend/backend transport
- Browser Use becomes the browser **hands and legs**:
  - browser session lifecycle
  - browser interaction execution
  - page extraction/snapshot interaction primitives

Do **not** adopt Browser Use `Agent` runtime for WindieOS interaction loop/history orchestration.

## Scope

Replace the current custom browser stack in WindieOS:

- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/controller.py`
- supporting browser modules under `frontend/src/main/python/tools/browser/`

with a Browser Use-powered execution adapter, while preserving WindieOS backend/frontend tool orchestration contracts.

## Non-Goals

- Replacing WindieOS `InteractionLoop`, parser, or session managers.
- Rewriting all remote tool architecture across non-browser domains.
- Introducing Browser Use cloud/sandbox requirements unless explicitly approved.

## Success Criteria

1. Browser actions in WindieOS execute via Browser Use internals.
2. WindieOS orchestration flow remains unchanged at system level.
3. Existing browser-control behavior is preserved or explicitly deprecated with documented reason.
4. Tool contract drift tests pass across backend and sidecar.
5. No silent feature loss: every legacy browser action is mapped to:
   - `ported`, `ported via compatibility`, or `intentionally dropped`.

## Mandatory Research Requirement (Before Coding)

The implementing agent must research both codebases deeply before any implementation PR.

### WindieOS Research Targets (Required)

- Backend browser schema/stub and tool registration:
  - `backend/src/tools/browser/schemas.py`
  - `backend/src/tools/remote_tools/browser.py`
  - `backend/src/tools/remote_tools/registry.py`
  - `backend/src/tools/registry.py`
  - `backend/src/tools/tool_policy.py`
  - `backend/src/llm/parser_validation.py`
  - `backend/src/core/config/models.py`
- Sidecar browser execution and registration:
  - `frontend/src/main/python/tools/browser/*.py`
  - `frontend/src/main/python/tools/registry.py`
  - `frontend/src/main/python/local_backend.py`
- Frontend execution transport/runtime assumptions:
  - `frontend/src/main/local_backend_bridge.cjs`
  - `frontend/src/renderer/infrastructure/services/ToolExecution*.ts`
  - `frontend/src/renderer/infrastructure/services/MessageFormatter.ts`
- Docs and runbooks:
  - `docs/BROWSER_CONTROL.md`
  - `docs/BROWSER_CONTROL_RUN.md`
  - `docs/TOOL_SYSTEM.md`
  - `docs/AGENT_SYSTEM.md`

### Browser Use Research Targets (Required)

- Tool/action execution pipeline:
  - `browser_use/tools/service.py`
  - `browser_use/tools/registry/service.py`
  - `browser_use/tools/views.py`
  - `browser_use/tools/extraction/*`
- Browser runtime/session lifecycle:
  - `browser_use/browser/session.py`
  - `browser_use/browser/session_manager.py`
  - `browser_use/browser/views.py`
  - `browser_use/browser/events.py`
- Interaction helpers and actor behavior:
  - `browser_use/actor/*`
- Practical model/runtime examples (for adapter usage patterns):
  - `examples/features/follow_up_task.py`
  - `examples/features/follow_up_tasks.py`
  - `examples/models/*` (only for usage patterns, not orchestration adoption)

## Feature Parity Ledger (Required Artifact)

Before coding, create a parity ledger (markdown table) listing every current `browser_control` action and status:

- `connect`
- `status`
- `profiles`
- `navigate`
- `open`
- `snapshot`
- `extract`
- `click`
- `type`
- `press`
- `scroll`
- `screenshot`
- `wait`
- `get_tabs`
- `switch_tab`
- `evaluate`
- `console`
- `errors`
- `requests`
- `trace_start`
- `trace_stop`
- `pdf`
- `upload`
- `dialog`
- `cookies`
- `cookies_set`
- `cookies_clear`
- `storage_get`
- `storage_set`
- `storage_clear`
- `set_offline`
- `set_headers`
- `set_credentials`
- `set_geolocation`
- `set_media`
- `set_timezone`
- `set_locale`
- `set_device`
- `act`
- `close`

Each row must include:

- Browser Use primitive(s) used
- adapter strategy
- behavior differences
- test coverage target
- migration decision (`port`, `compat`, `deprecate`)

## Phased Implementation Plan

## Phase 0: Discovery, Baseline, and Lock

### Goals

- Freeze current behavior and produce migration map.
- Avoid coding blind spots.

### Deliverables

1. Capability parity ledger (required artifact above).
2. Baseline run log for current WindieOS browser-control critical flows.
3. Decision log for any action not directly mappable to Browser Use.

### Exit Criteria

- Every current action has an explicit migration status.
- No unresolved “unknown behavior” actions.

### Phase 0 Status (Completed February 16, 2026)

Delivered artifacts:

1. Capability parity ledger:
   - `docs/plan/BROWSER_USE_PORT_PHASE0_PARITY_LEDGER.md`
2. Baseline run log:
   - `docs/plan/BROWSER_USE_PORT_PHASE0_BASELINE_RUN_LOG.md`
3. Decision log for non-direct Browser Use mappings:
   - `docs/plan/BROWSER_USE_PORT_PHASE0_DECISION_LOG.md`

Completion note:

- All listed `browser_control` actions have explicit migration status (`port` / `compat` / `deprecate`).
- No unresolved “unknown behavior” actions remain in the Phase 0 inventory.

## Phase 1: Target Architecture and Adapter Design

### Goals

- Define the Browser Use adapter boundary.
- Keep WindieOS orchestration unchanged.

### Design Requirements

1. WindieOS backend still exposes browser tool schemas and handles tool selection/policy.
2. Sidecar `ToolRegistry` still executes a browser-domain tool entrypoint.
3. Browser Use adapter handles:
   - browser connection/session management
   - action execution
   - structured result normalization into `ToolResult`.
4. No Browser Use `Agent` loop inside WindieOS runtime.

### Deliverables

- Architecture doc section with sequence diagram:
  - LLM tool call -> backend remote tool stub -> frontend IPC -> sidecar tool registry -> Browser Use adapter -> ToolResult -> backend.
- Adapter interface spec (method signatures and expected normalized return schema).

### Exit Criteria

- Explicitly documented ownership boundary between WindieOS and Browser Use.

### Phase 1 Status (Completed February 16, 2026)

Delivered artifacts:

1. Architecture boundary and sequence diagram:
   - `docs/plan/BROWSER_USE_PORT_PHASE1_ARCHITECTURE_AND_ADAPTER_SPEC.md`
2. Adapter interface + normalized return schema specification:
   - `docs/plan/BROWSER_USE_PORT_PHASE1_ARCHITECTURE_AND_ADAPTER_SPEC.md`
3. Phase-ledger continuity update:
   - `docs/plan/BROWSER_USE_PORT_PHASE0_PARITY_LEDGER.md` (Phase 1 addendum)

Completion note:

- Ownership boundaries are explicitly documented from backend tool schema/policy through sidecar adapter execution.
- Adapter method signatures and normalized result contract are frozen for Phase 2 wiring.
- Phase 0 migration decisions remain unchanged after Phase 1 architecture review.

## Phase 2: Compatibility Wrapper (No Contract Break Yet)

### Goals

- Keep `browser_control` contract initially.
- Swap internals to Browser Use incrementally.

### Tasks

1. Introduce a new sidecar module (example: `tools/browser_use_adapter/*`).
2. Route `browser_control` action handlers through adapter where possible.
3. Preserve current payload shape expected by backend/frontend formatters.

### Exit Criteria

- Existing `browser_control` calls operate through Browser Use-backed internals for core actions.
- No backend contract break in this phase.

### Phase 2 Status (In Progress - Updated February 16, 2026)

Delivered Phase 2 artifacts so far:

1. Compatibility-wrapper module and adapter contract wiring:
   - `frontend/src/main/python/tools/browser_use_adapter/types.py`
   - `frontend/src/main/python/tools/browser_use_adapter/controller_adapter.py`
   - `frontend/src/main/python/tools/browser_use_adapter/__init__.py`
2. Browser tool routing through adapter for initial Phase 2 action batch:
   - `frontend/src/main/python/tools/browser/browser_tool.py`
3. Implementation progress log:
   - `docs/plan/BROWSER_USE_PORT_PHASE2_COMPAT_WRAPPER_PROGRESS.md`

Current routing coverage:

- Adapter-routed actions: `connect`, `status`, `profiles`, `navigate`, `open`, `snapshot`, `extract`, `click`, `type`, `press`, `scroll`, `screenshot`, `wait`, `get_tabs`, `switch_tab`, `evaluate`, `console`, `errors`, `requests`, `trace_start`, `trace_stop`, `pdf`, `upload`, `dialog`, `cookies`, `cookies_set`, `cookies_clear`, `storage_get`, `storage_set`, `storage_clear`, `set_offline`, `set_headers`, `set_credentials`, `set_geolocation`, `set_media`, `set_timezone`, `set_locale`, `set_device`, `act`, `close`.
- Current compatibility note: `snapshot`, `extract`, and `act` are adapter-native (no legacy delegates remain in `browser_tool` Phase 2 routing).

Validation snapshot:

- Sidecar browser suites pass after routing (`tests/sidecar/tools/test_browser_tool.py`, `tests/sidecar/tools/test_browser_controller.py`).
- Added adapter-routing regression coverage in `tests/sidecar/tools/test_browser_tool.py`.
- Added adapter-core regression coverage in `tests/sidecar/tools/test_browser_use_adapter.py`.

## Phase 3: Core Action Migration (High-Value First)

### Minimum Action Set

- `connect`, `navigate`, `open`, `get_tabs`, `switch_tab`, `close`
- `snapshot`, `extract`
- `click`, `type`, `press`, `scroll`, `wait`, `screenshot`
- `evaluate`

### Requirements

- Respect existing timeout and capture behavior from frontend execution services.
- Preserve ref/snapshot dataflow or provide compatibility mapping layer.
- Maintain deterministic error semantics (no generic catch-all output regressions).

### Exit Criteria

- Core browser workflows pass with Browser Use execution.

## Phase 4: Advanced/Compatibility Action Handling

### Goals

Handle actions with weak/no native Browser Use parity via one of:

- compatibility implementation around Browser Use browser session APIs
- retained legacy support shim
- explicit deprecation

### Likely Advanced Set

- `console`, `errors`, `requests`, `trace_start`, `trace_stop`
- `pdf`, `upload`, `dialog`
- `cookies*`, `storage*`
- `set_*` environment emulation actions
- `profiles`, `act`

### Requirements

- Every advanced action decision must be documented in parity ledger.
- No silent removals.

### Exit Criteria

- Advanced action disposition fully implemented and documented.

## Phase 5: Schema and Policy Evolution

### Goals

- Optionally move from monolithic `browser_control(action=...)` toward Browser Use-style action schemas.
- Keep transition safe with compatibility period.

### Tasks

1. If splitting schemas, update:
   - backend remote tool registry
   - sidecar exposed tool set
   - dev tool-selection profiles
   - parser validation allowlists
2. Preserve compatibility aliases while clients migrate.

### Exit Criteria

- Tool schema source and exposure are consistent across backend and sidecar.
- Contract tests updated and passing.

## Phase 6: Tests, Runbooks, and Cutover

### Required Test Surfaces

- Sidecar browser tool tests:
  - `tests/sidecar/tools/test_browser_*`
- Backend browser remote/schema/policy tests:
  - `tests/backend/test_browser_remote_tool.py`
  - `tests/backend/test_remote_tool_contract.py`
  - `tests/backend/test_tool_policy.py`
  - parser validation tests
- Frontend integration touchpoints affected by browser tool behavior/timeout.

### Runbook Updates

- `docs/BROWSER_CONTROL.md`
- `docs/BROWSER_CONTROL_RUN.md`
- `docs/TOOL_SYSTEM.md` (if tool contract changes)

### Exit Criteria

- Browser Use-powered browser control is default path.
- Legacy custom browser execution path removed or clearly flagged as deprecated fallback.

## Phase 7: Cleanup and Hardening

### Tasks

1. Remove obsolete custom browser modules after cutover.
2. Remove dead tests/docs/config for deleted behavior.
3. Add regression tests for previously bug-prone areas:
   - tab switching
   - stale refs/snapshot drift
   - long-page extraction pagination
   - timeout/retry behavior

### Exit Criteria

- No dead code paths for replaced browser-control internals.
- Stable CI for backend + sidecar + frontend tests touched by migration.

## Implementation Guardrails

1. Do not change orchestration ownership:
   - WindieOS controls history, turns, parser, policy.
2. Do not merge migration with unrelated refactors.
3. Keep PRs phase-scoped and reviewable.
4. Every phase must update the parity ledger.
5. If a feature cannot be ported, mark it explicitly and provide mitigation/deprecation path.

## Suggested PR Slicing

1. PR-1: Research artifacts + parity ledger + architecture addendum (no behavior changes).
2. PR-2: Browser Use adapter scaffolding + compatibility wrapper wiring.
3. PR-3+: Core action migration in small batches with tests.
4. PR-N: Advanced action strategy + schema/policy transition.
5. Final PR: cleanup and hardening.

## Definition of Done

Migration is complete only when:

1. WindieOS browser actions execute through Browser Use internals.
2. WindieOS orchestration remains authoritative.
3. Feature parity ledger is complete and all gaps are accounted for.
4. Tests and runbooks reflect new reality.
