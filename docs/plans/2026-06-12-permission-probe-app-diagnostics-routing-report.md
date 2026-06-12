---
summary: "Implementation report for routing idle permission diagnostics out of conversation history and into app diagnostics."
read_when:
  - When resuming the permission probe app-diagnostics routing plan.
  - When auditing whether idle permission probes still mutate conversation history.
title: "Permission Probe App Diagnostics Routing Report"
---

# Permission Probe App Diagnostics Routing Report

Plan: [2026-06-12-permission-probe-app-diagnostics-routing-plan.md](2026-06-12-permission-probe-app-diagnostics-routing-plan.md)

Status: complete.

## Checklist

- [x] Re-read the plan and required orientation docs.
- [x] Record initial live evidence.
- [x] Inspect recent related commits and current code anchors.
- [x] Add `permission.probe` app diagnostics path and sanitizer allowlist.
- [x] Route idle permission traces to app diagnostics.
- [x] Keep explicit `conversationRef` + `turnRef` traces in the conversation ledger.
- [x] Remove the main-process current-conversation fallback for missing turn context.
- [x] Update tests.
- [x] Update docs and changelog.
- [x] Run focused validation.
- [x] Run final design-inspection pass.
- [x] Commit scoped changes.

## Initial Evidence

Captured on 2026-06-12 before code edits.

Latest active local history conversation:

```text
conversation_id                            event_count  turn_count  updated_at
conv_06532d3e-0f83-4156-8ca9-1c706335686a  353          1           2026-06-12T00:52:33.153000+00:00
```

Conversation event counts:

```text
total_events  trace_events  null_turn_permission_probes
353           48            6
```

App diagnostics baseline:

```text
diagnostic_events where path='permission.probe': 0
```

Interpretation: the live app still writes idle permission diagnostics into the
active conversation ledger, and no `permission.probe` rows are currently routed
to the app diagnostics database.

## Worktree State At Start

Unrelated dirty files were present before implementation and must be preserved:

```text
 M packages/windie-sdk-js/src/runtime/WindieClient.ts
 M tests/frontend/WindieSdkClient.test.ts
?? docs/plans/2026-06-12-sdk-local-runtime-first-class-plan.md
?? docs/plans/2026-06-12-sdk-local-runtime-first-class-report.md
```

Plan/report files for this task:

```text
?? docs/plans/2026-06-12-permission-probe-app-diagnostics-routing-plan.md
?? docs/plans/2026-06-12-permission-probe-app-diagnostics-routing-report.md
```

## Recent Commit Context

Related commits inspected:

- `ec46a4eec feat(sdk): add durable path trace events`
- `98d48d312 feat(trace): expand durable runtime paths`
- `bb1662b1a feat(trace): complete feature path diagnostics`
- `7905dc2c4 feat(diagnostics): trace conversation metadata listing`
- `c15f60cc7 fix(storage): unify local data root`
- `3832dd128 fix(frontend-mcp): trace mcp tool execution separately`
- `c886a678c fix(frontend-browser): reuse active local runtime for header`

Conclusion: the bad behavior is not the `windieos` storage-root migration
itself. The issue is the main-process trace handoff allowing missing turn
context to fall back to the active conversation, combined with permission
probes using that handoff for app-owned idle checks.

## Decisions

- Treat `permission.probe` as app diagnostics by default.
- Require both `conversationRef` and `turnRef` for conversation ledger writes.
- Do not synthesize a turn id for permission probes.
- Preserve permission behavior; diagnostics failure must not fail permission
  actions.
- Do not migrate/delete existing local hidden trace rows.

## Validation Log

Commands run:

```text
node --check frontend/src/main/permissions/permission_ipc_runtime.cjs
node --check frontend/src/main/ipc.cjs
node --check frontend/src/main/diagnostics/app_diagnostics_store.cjs
```

Result: passed.

```text
cd frontend && npm run test -- AppDiagnosticsStore PermissionIpcRuntime
```

Result:

```text
PASS ../tests/frontend/AppDiagnosticsStore.test.cjs
PASS ../tests/frontend/PermissionIpcRuntime.test.cjs
Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
```

```text
bin/windie docs list
```

Result: passed; docs navigation validated 82 page references.

```text
git diff --check
```

Result: passed.

Live SQLite proof:

```text
history_before=64
history_after=64
diag_before=0
diag_after=2
```

Latest diagnostic rows:

```text
permission.probe  probe  succeeded  electron-main  {"permissionId":"filesystem_workspace_access","permissionStatus":"needs-action","granted":false,"hasDetails":true,"platform":"darwin","durationMs":14}
permission.probe  probe  started    electron-main  {"permissionId":"filesystem_workspace_access","permissionStatus":null,"granted":false,"hasDetails":false,"platform":"darwin","durationMs":1}
```

Interpretation: invoking the permission IPC runtime with the real app
diagnostics store added sanitized `permission.probe` rows to
`diagnostics.db` and did not increase the null-turn permission trace count in
conversation history.

## Inspection Log

Initial inspection:

- `frontend/src/main/permissions/permission_ipc_runtime.cjs` has one
  `recordPermissionTrace` helper that always uses `emitTraceEvent`.
- `frontend/src/main/ipc.cjs` has `appendMainProcessTraceEvent`, which falls
  back to `currentConversationRef` and allows `turnRef = null`.
- `frontend/src/main/diagnostics/app_diagnostics_store.cjs` already has the
  persistent diagnostics DB and sanitization model but no `permission.probe`
  path/export.
- `tests/frontend/PermissionIpcRuntime.test.cjs` currently expects idle
  permission probes to emit trace events.
- `tests/frontend/AppDiagnosticsStore.test.cjs` covers other app-diagnostics
  paths and needs `permission.probe` coverage.

Final inspection:

- `frontend/src/main/permissions/permission_ipc_runtime.cjs` now routes through
  app diagnostics unless both `conversationRef` and `turnRef` are explicit.
- `frontend/src/main/ipc.cjs` no longer falls back to `currentConversationRef`
  for generic main-process trace writes; missing turn context returns
  `missing_turn_ref`, with `permission.probe` delegated to app diagnostics.
- `frontend/src/main/diagnostics/app_diagnostics_store.cjs` exports
  `PERMISSION_PROBE_DIAGNOSTICS_PATH` and allowlists only sanitized permission
  fields.
- `tests/frontend/PermissionIpcRuntime.test.cjs` proves idle probes use app
  diagnostics, explicit turn context still uses conversation traces, workspace
  activation diagnostics omit filesystem paths, and the harness no longer
  writes the repo permission-state JSON.
- `tests/frontend/AppDiagnosticsStore.test.cjs` proves `permission.probe`
  diagnostics persist and reject workspace paths, selected path lists, prompt
  text, and URLs.
- `docs/debug/runtime_traces.md` now documents `permission.probe` as app
  diagnostics by default with a narrow explicit-turn exception.

Remaining in-scope findings: none.

## Commits

- `e4d46f458 fix(frontend-diagnostics): route idle permission probes to app diagnostics`
- Final report ledger update: this docs-only follow-up commit.
