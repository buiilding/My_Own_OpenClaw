---
summary: "Pre-flight plan for routing idle permission diagnostics out of conversation history and into app diagnostics."
read_when:
  - When changing Electron main permission probe tracing, main-process trace handoff, app diagnostics routing, or conversation trace-event ownership.
  - When debugging conversation rows that keep updating while no user turn is active.
title: "Permission Probe App Diagnostics Routing Plan"
---

# Permission Probe App Diagnostics Routing Plan

Status: approved for implementation on 2026-06-12.

Matching report path:

```text
docs/plans/2026-06-12-permission-probe-app-diagnostics-routing-report.md
```

## User Intent

Stop idle Electron main permission/workspace checks from mutating the active
conversation history. Conversation `trace_event` rows should explain work that
happened inside a real user turn. Background app/runtime diagnostics should
survive restart in the app diagnostics database without updating chat recency,
conversation event counts, or replay history.

## Problem Statement

The current main-process trace handoff accepts a trace input without an explicit
conversation/turn context and falls back to the selected active conversation.
That makes idle permission probes look conversation-scoped:

```text
permission probe or workspace activation
-> Electron main trace handoff
-> missing explicit conversationRef/turnRef
-> fallback to currentConversationRef
-> append hidden trace_event to the selected conversation
```

The observed live result was a normal conversation id with completed turns, but
additional `permission.probe` / `workspace_activate` rows kept appending after
the last assistant message. Those rows had no `turn_ref`, updated the
conversation's `updated_at`, and increased its event count even though no user
turn was running.

## Target Architecture

Make diagnostic routing explicit by scope:

```text
if an event has explicit conversationRef and turnRef:
  persist hidden conversation trace_event
else:
  persist app diagnostic event
```

Ownership:

- Electron main owns permission probing, workspace activation, and the first
  routing decision for those local app events.
- SDK conversation storage owns durable turn-scoped `trace_event` rows.
- Electron main app diagnostics owns non-turn app/runtime rows in
  `~/Library/Application Support/windieos/diagnostics/diagnostics.db`.
- Renderer transcript/replay remains a consumer only; it must not compensate for
  misrouted diagnostic rows.

This change should remove the active-conversation fallback for main-process
trace writes. A selected chat is not sufficient write authority for the
conversation ledger. A real turn context is required.

## In Scope

- Add `permission.probe` as an app diagnostics path.
- Allowlist sanitized permission diagnostic data in the app diagnostics store:
  permission id, permission status, granted boolean, details presence, platform,
  workspace-path presence, duration, request id, and short errors.
- Update Electron main permission tracing so idle probes and workspace
  activation checks write app diagnostics by default.
- Preserve the ability to write a conversation `trace_event` when a caller
  explicitly passes both `conversationRef` and `turnRef`.
- Remove or narrow the `currentConversationRef` fallback from
  main-process trace writes so no null-turn row can be silently attached to the
  active conversation.
- Update tests and docs for the new routing rule.
- Validate against live SQLite behavior after implementation.

## Out Of Scope

- Rewriting the whole durable trace system.
- Moving backend stream, provider, tool, screenshot, memory, or other
  turn-scoped traces out of the conversation ledger.
- Changing conversation id format.
- Cleaning existing historical rows already written into local history.
- Adding a new diagnostics database; use the existing app diagnostics store.
- Changing permission semantics, prompts, or workspace access behavior.

## Current Code Anchors

Reread these before implementation or after context compaction:

- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `docs/debug/observability_change_workflow.md`
- `docs/debug/runtime_traces.md`
- `docs/architecture/storage_persistence_change_workflow.md`
- `docs/memory/session_conversation_identity_change_workflow.md`
- `pending/compaction_safe_plan_execution.md`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/diagnostics/app_diagnostics_store.cjs`
- `tests/frontend/PermissionIpcRuntime.test.cjs`
- `tests/frontend/AppDiagnosticsStore.test.cjs`

## Implementation Workflow

1. Create the matching report file and record the initial live evidence:
   conversation id, total event count, null-turn `permission.probe` count,
   current diagnostics database path, and dirty worktree state.
2. Inspect recent commits touching `permission_ipc_runtime.cjs`,
   `ipc.cjs`, `app_diagnostics_store.cjs`, and `runtime_traces.md` to confirm
   whether the current fallback came from the durable trace expansion or storage
   root migration.
3. Add a `PERMISSION_PROBE_DIAGNOSTICS_PATH` export to the app diagnostics
   store and update the data allowlist for sanitized permission fields.
4. Add app-diagnostics store tests proving `permission.probe` rows persist and
   reject workspace paths, selected path lists, prompt text, URLs, and other raw
   local/user data.
5. Change permission IPC tracing to receive both sinks:
   a conversation trace sink for explicit turn context and an app diagnostics
   sink for missing turn context.
6. Update `recordPermissionTrace` to route:
   - explicit `conversationRef` plus `turnRef`: conversation trace sink;
   - no `turnRef`: app diagnostics sink;
   - sink failure: log a sanitized warning and never fail the permission action.
7. Change the main-process trace handoff so missing `turnRef` no longer falls
   back to `currentConversationRef`. Either return
   `{ stored: false, reason: "missing_turn_ref" }` for conversation trace writes
   or delegate to app diagnostics when the path is recognized as app-scoped.
8. Pass trace context only from true turn-scoped callers. Do not synthesize a
   turn id inside Electron main permission code.
9. Update permission IPC tests:
   - idle `run-permission-probe` records app diagnostics, not conversation
     trace events;
   - explicit conversation and turn context records conversation trace events;
   - workspace activation diagnostics are sanitized and path-free.
10. Update runtime trace docs so `permission.probe` is documented as app
    diagnostics by default, with a narrow exception for explicit turn-scoped
    permission checks.
11. Run focused validation and record results in the report.
12. Run a design-inspection pass:
    - search for `currentConversationRef` trace fallbacks;
    - search for `permission.probe` writers;
    - inspect app diagnostics allowlist;
    - inspect display/rehydrate behavior only to confirm no compensating UI
      workaround was added.
13. Repeat implementation slices until inspection finds no remaining in-scope
    path that can append a null-turn permission trace to conversation history.

## Expected New Runtime Path

Idle app check:

```text
run-permission-probe / set-active-workspace
-> permission_ipc_runtime records permission.probe
-> no explicit turnRef
-> app diagnostics store
-> diagnostic_events(path = "permission.probe")
```

Turn-scoped check:

```text
user turn starts
-> caller passes conversationRef and turnRef into permission trace context
-> permission_ipc_runtime records permission.probe
-> SDK conversation store
-> hidden conversation_events(event_type = "trace_event", turn_ref = ...)
```

## Success Criteria

- Idle permission probes do not append rows to `conversation_events`.
- Idle workspace activation checks do not update conversation `updated_at`.
- `permission.probe` app diagnostics are queryable from
  `diagnostic_events`.
- Turn-scoped permission diagnostics can still be written as hidden
  conversation `trace_event` rows when both identifiers are explicit.
- No `permission.probe` row stores selected filesystem paths, workspace paths,
  prompt text, URLs, credentials, provider payloads, screenshots, or file
  contents.
- Existing conversation trace paths remain hidden from display and excluded from
  backend rehydrate.
- Permission actions keep succeeding even if diagnostics persistence fails.

## Validation Commands

Focused tests:

```bash
cd frontend && npm run test -- AppDiagnosticsStore PermissionIpcRuntime
```

Focused docs and formatting:

```bash
bin/windie docs list
git diff --check
```

Live SQLite proof after running the app and triggering a permission probe:

```bash
sqlite3 "$HOME/Library/Application Support/windieos/history/history.db" \
  "select count(*) from conversation_events where event_type='trace_event' and turn_ref is null and event_payload like '%permission.probe%';"

sqlite3 "$HOME/Library/Application Support/windieos/diagnostics/diagnostics.db" \
  "select path, stage, status, runtime, data from diagnostic_events where path='permission.probe' order by timestamp desc limit 10;"
```

The first query should not increase from the pre-fix baseline after idle probes.
The second query should show sanitized `permission.probe` diagnostics.

## Risk And Migration Notes

- Existing misrouted local rows remain in history; no migration is planned
  because they are hidden diagnostic rows and deleting local history rows is
  higher risk than stopping new writes.
- App diagnostics already has a `conversation_ref` column. For idle permission
  diagnostics, storing no conversation reference is preferred. If a future UI
  needs to correlate app checks to a selected workspace or window, add a
  sanitized request/session id instead of mutating chat recency.
- If any current caller genuinely needs permission diagnostics in the
  conversation ledger, it must pass both `conversationRef` and `turnRef`
  explicitly. That requirement is intentional.
- This plan changes observability routing, not permission grant behavior.

## Approval Boundary

Do not implement this plan until the user approves coding against it. After
approval, create and maintain the matching report before the first code edit.
