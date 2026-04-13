---
summary: "Deep reference for renderer root entrypoint routing by `view` param, per-view app wrappers, and provider/hook enablement differences across main chat vs overlay windows."
read_when:
  - When changing renderer app selection logic in `main.jsx`.
  - When debugging why a window surface has/does not have transcript/tool-runner behavior or why main app is stuck in permission onboarding gate.
title: "Entrypoint View Routing and Provider Stack Reference"
---

# Entrypoint View Routing and Provider Stack Reference

## Canonical Modules

- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/ChatBoxApp.jsx`
- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/app/ChatBoxContextLabelApp.jsx`
- `frontend/src/renderer/components/ErrorBoundary.jsx`
- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/app/providers/AppProvider.jsx`
- `frontend/src/renderer/app/providers/ChatProvider.jsx`

## Root Component Selection

`main.jsx` resolves `window.location.search` `view`:

- `view=chatbox` -> `ChatBoxApp`
- `view=chatbox-response` -> `ChatBoxResponseApp`
- `view=chatbox-context-label` -> `ChatBoxContextLabelApp`
- default/no `view` -> `App`

Dev-only behavior:

- `React.StrictMode` wrapper enabled when `import.meta.env.DEV` is true
- production skips strict mode wrapper

## Provider Baseline per Surface

All surfaces mount `AppProvider`, which means:

- shared config/status contexts
- shared settings sync/model list logic
- shared wakeword suppression inputs

`ChatProvider` is mounted on all surfaces, but flags differ:

- main app (`App.jsx`):
  - `enableToolRunner=true`
  - `enableTranscript=true`
- overlay apps (`ChatBoxApp`, `ChatBoxResponseApp`, `ChatBoxContextLabelApp`):
  - `enableToolRunner=false`
  - `enableTranscript=false`

## Main App Stack

`App.jsx`:

1. `ErrorBoundary`
2. `AppProvider`
3. `ChatProvider` (full chat hooks)
4. `AppContent` (`ChatGptDashboardShell` or onboarding)

`AppContent` behavior:

- does not block startup behind renderer permission onboarding
- always routes to dashboard shell or frontend onboarding slideshow based on VM mode and slideshow completion
- mounts `WakewordController` only for dashboard surfaces
- within shell, opens memory/models/settings as modal panels over chat

## Overlay App Stacks

Shared properties:

- all wrap with `ErrorBoundary` + `AppProvider`
- all use reduced `ChatProvider` flags (`false/false`)

Surface-specific body:

- `ChatBoxApp` -> `ChatBox`
- `ChatBoxResponseApp` -> `ChatBoxResponse`
- `ChatBoxContextLabelApp` -> `ChatBoxContextLabel`

Impact:

- overlay windows still receive streamed state updates via chat store hooks
- they avoid transcript writes and frontend tool execution side effects

## Wakeword Controller Placement

`WakewordController` only exists in default `App` surface.

Behavior:

- subscribes via `useWakewordDetection(wakewordActive, callback)`
- on detection:
  - sends `wakeword-detected` API call
  - invokes `show-chatbox` to foreground overlay

Overlay-only windows do not host this controller, avoiding duplicate detection side effects.

## Drift Hotspots

1. adding new `view` value in main process without matching renderer route
2. enabling `ChatProvider` tool runner in overlay surfaces (can duplicate executions)
3. mounting `WakewordController` in multiple surfaces (duplicate wakeword events)
4. reintroducing permission-gate dependencies in `App.jsx` and blocking normal shell startup
5. changing provider order and breaking context hook assumptions

## Debug Checklist

If overlay surface unexpectedly writes transcripts:

1. verify `ChatProvider(enableTranscript=false)` for that app wrapper
2. verify no secondary chat hook mount outside provider wrapper
3. inspect `main.jsx` route selection for wrong root component

If tool calls execute twice:

1. verify only main `App` surface has `enableToolRunner=true`
2. verify extra renderer window is not loading default `App` route
3. inspect window URL `view` query parameter set by main process
