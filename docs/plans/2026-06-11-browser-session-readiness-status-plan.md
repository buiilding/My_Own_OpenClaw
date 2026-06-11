---
summary: "Plan for fixing the browser header readiness label and startup path after SDK-owned sidecar runtime changes."
read_when:
  - When changing the chat header browser session control, local-backend readiness gating, SDK sidecar wakeup, or browser session diagnostics.
title: "Browser Session Readiness Status Plan"
---

# Browser Session Readiness Status Plan

Status: implemented and validated.

## Problem

The chat header browser control can stay disabled with `Starting browser...`.
That label is inaccurate for the observed state. In the current renderer code,
the label means the local backend/sidecar readiness snapshot is not ready; it
does not prove the dedicated browser is launching.

Recent SDK-owned sidecar runtime work made local runtime startup lazy. The
browser control waits for `localBackendReady === true` before calling the
browser `connect` action. If readiness now depends on a helper call that wakes
the SDK local runtime, the browser control can become a dead end:

1. Renderer waits for local runtime readiness.
2. The browser connect action is suppressed because readiness is false.
3. The SDK local runtime may never be woken by this UI path.
4. The user sees `Starting browser...` indefinitely.

## Intended UX Contract

Use explicit state labels that describe the real boundary:

- `Starting local runtime...`: sidecar/local backend is not ready yet.
- `Connect browser`: local runtime is ready and the dedicated browser is not connected.
- `Connecting browser...`: the user requested browser connection and the browser action is in flight.
- `Browser Tab: <tab>`: the dedicated browser is connected and a tab is selected.
- `Browser unavailable`: local runtime or browser setup failed, with the short error in the button title.

Do not use `Browser ready`; it conflates local runtime readiness with browser
session connection.

## Ownership

- Renderer owns the visible browser session control state and labels.
- Electron main owns local-backend readiness IPC and host-side browser action routing.
- SDK owns local sidecar runtime startup/reuse and RPC/tool execution.
- Python sidecar owns Browser Use execution, browser session mechanics, and browser status payloads.
- App diagnostics own non-turn evidence for browser-control readiness failures.

## Proposed Path

1. Confirm the current deadlock with focused tests around the lazy SDK runtime path:
   - `ChatBrowserSessionControl` should not call browser actions while local runtime is unavailable.
   - A browser-control readiness path should wake or observe the SDK local runtime without requiring an already-ready browser action.
   - `get-local-backend-status` should not stay `ready:false` forever when a valid SDK local runtime provider exists and can start.

2. Fix the readiness boundary instead of only changing text:
   - Prefer a narrow main/SDK readiness wake path that resolves the SDK local runtime and emits a `local-backend-status` update.
   - Avoid adding a renderer-only workaround that bypasses readiness or directly owns sidecar startup.
   - Keep `run-browser-action` as the only renderer browser action channel.

3. Update renderer labels:
   - Replace `Starting browser...` with `Starting local runtime...` for `!localBackendReady`.
   - Keep `Connect browser` for ready-but-disconnected state.
   - Keep `Connecting browser...` for `busyAction === 'connect'`.
   - Surface failure as `Browser unavailable` while preserving the sanitized error in `title`.

4. Add non-turn diagnostics for this path:
   - Add app diagnostic path `browser.session_control` or `local_backend.readiness`.
   - Prefer `browser.session_control` if tracing the renderer control and browser action request lifecycle.
   - Prefer `local_backend.readiness` if the first implementation only traces SDK sidecar wake/status.
   - Do not rely only on existing `browser.runtime` trace rows because those start after a browser tool action executes.

5. Diagnostic stages should be sanitized and boundary-specific:
   - renderer subscription/bootstrap status observed
   - renderer connect click suppressed because local runtime is not ready
   - main `get-local-backend-status` response built
   - SDK local runtime wake start/success/failure
   - main `local-backend-status` ready/error broadcast
   - main `run-browser-action` start/success/failure
   - browser `status` / `get_tabs` result summarized

6. Update docs:
   - `docs/browser/browser_control.md`
   - `docs/frontend/main/local_backend/process_lifecycle_change_workflow.md`
   - `docs/debug/runtime_traces.md`
   - `docs/debug/observability_change_workflow.md` if a new diagnostic path is added
   - `CHANGELOG.md`

## Tests

Focused frontend/main tests:

- `ChatBrowserSessionControl.test.jsx`
  - not-ready label is `Starting local runtime...`
  - ready-but-disconnected label is `Connect browser`
  - connect-in-flight label is `Connecting browser...`
  - failure state shows `Browser unavailable` with short error title

- `BrowserSessionStore.test.js`
  - local-backend readiness updates trigger status sync
  - not-ready state does not issue browser actions
  - stale status responses do not overwrite newer readiness/browser snapshots

- `LocalBackendBridge.lifecycle.test.cjs`
  - valid SDK local runtime provider can be woken for readiness
  - readiness failures publish `ready:false` with a sanitized error
  - provider startup success publishes `ready:true`

- App diagnostics tests if diagnostics are added:
  - diagnostic path accepts only allowlisted keys
  - diagnostics are best-effort and non-fatal
  - no URLs, titles, paths, tokens, browser output, or stack traces are stored

Validation commands:

```bash
bin/windie test frontend -- ChatBrowserSessionControl.test.jsx BrowserSessionStore.test.js LocalBackendBridge.lifecycle.test.cjs AppDiagnosticsStore.test.cjs
bin/windie diagnostics list --path browser.session_control --limit 5 --json
bin/windie docs list
git diff --check
```

Adjust the diagnostics command if the final path is `local_backend.readiness`.

## Security And Persistence Notes

- No migration is needed for renderer state labels.
- If app diagnostics are added, the existing diagnostics SQLite schema can be reused.
- Diagnostic data must omit browser URLs, titles, page text, screenshot data, local paths, user ids, tokens, raw payloads, and stack traces.
- Browser profile isolation must remain unchanged.

## Completion Criteria

- The browser header no longer claims the browser is starting when only local runtime readiness is pending.
- The browser control cannot remain indefinitely stuck because its own path has no way to wake or observe SDK local runtime readiness.
- A failing path leaves enough sanitized evidence to distinguish renderer gating, main readiness status, SDK sidecar startup, sidecar RPC, and browser action failures.
- Focused tests and docs validation pass.
