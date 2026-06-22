---
summary: "Deep reference for renderer app startup routing in `App.jsx`: VM-mode dashboard bypass, permission-gated onboarding slideshow routing, provider stack ownership, and wakeword controller mount boundaries."
read_when:
  - When changing renderer app startup flow in `frontend/src/renderer/app/App.jsx`.
  - When debugging why users land in onboarding slideshow vs dashboard shell across VM and non-VM launches.
title: "App Startup VM-Mode and Permission Onboarding Runtime Reference"
---

# App Startup VM-Mode and Permission Onboarding Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopStartupRuntimeClient.ts`
- `frontend/src/renderer/infrastructure/runtime/vmMode.js`
- `frontend/src/renderer/features/permissions/stores/permissionStore.js`
- `frontend/src/renderer/features/onboarding/components/DesktopOnboardingSlideshow.jsx`
- `frontend/src/renderer/features/onboarding/components/PermissionOnboardingSlide.jsx`
- `frontend/src/renderer/features/onboarding/components/StopShortcutOnboardingSlide.jsx`
- `frontend/src/renderer/features/onboarding/hooks/useOnboardingPermissionActions.js`
- `frontend/src/renderer/app/runtime/desktopOnboardingSlideRuntime.js`
- `frontend/src/renderer/app/runtime/desktopShortcutRuntimeClient.ts`
- `frontend/src/renderer/infrastructure/shortcuts/agentStopShortcut.js`
- `tests/frontend/AppVmMode.test.jsx`
- `tests/frontend/AppPermissionGate.test.jsx`
- `tests/frontend/DesktopOnboardingSlideshow.test.jsx`
- `tests/frontend/onboardingSlides.test.js`

## Provider and Root Composition

`App` composes the root runtime in fixed order:

1. `ErrorBoundary`
2. `AppProvider`
3. `ChatProvider`
4. `AppContent`

`WakewordController` is mounted by `AppContent` only for dashboard surfaces.
The onboarding surface does not mount wakeword at all, so first-run startup
cannot request microphone capture before the user reaches the microphone grant
step.

## Startup Routing in `AppContent`

`AppContent` resolves startup destination through
`DesktopStartupRuntimeClient.selectStartupSurface(...)`, which centralizes the
two gates:

1. VM mode gate (`DesktopStartupRuntimeClient.isVmModeEnabled()`)
2. permission onboarding gate (`permissionStore.needsOnboarding`)

Routing behavior:

- VM mode enabled:
  - mount `WakewordController`
  - render `DashboardShell` immediately
  - pass `vmModeEnabled={true}`
  - bypass desktop onboarding slideshow
  - request a focused main-window startup restore through
    `DesktopWindowRuntimeClient.showMainWindowWithValues(...)`
- VM mode disabled + onboarding incomplete:
  - do not mount `WakewordController`
  - render `DesktopOnboardingSlideshow`
  - inject stop-agent shortcut label from
    `DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutLabel(config?.global_agent_stop_shortcut)`
  - request a focused onboarding main-window restore through
    `DesktopWindowRuntimeClient.showMainWindowWithValues(...)`; the runtime
    client assembles the host-shaped `show-main-window` options
  - onboarding never requests maximize/fullscreen and its window chrome suppresses the maximize control so permission prompts are not blocked behind a fullscreen frameless shell
- VM mode disabled + onboarding complete:
  - mount `WakewordController`
  - render `DashboardShell`
  - pass `vmModeEnabled={false}`
  - request a focused startup chatbox restore through
    `DesktopWindowRuntimeClient.showChatboxWithValues(...)` so cold start lands
    on the minimal chat pill unless Electron main has persisted user-hidden
    chat-pill intent

Pre-bootstrap startup behavior:

- when permission bootstrap has not finished yet,
  `DesktopStartupRuntimeClient.selectStartupSurface(...)` uses the persisted
  onboarding completion bit from `permissionStore.onboardingState`
- this avoids a first-frame onboarding flash for users who already completed onboarding on the current install
- after bootstrap resolves, `needsOnboarding` becomes authoritative again so manifest-version changes can still route users back into onboarding

## VM Mode Detection Contract

`DesktopStartupRuntimeClient` owns renderer startup query adapters:

- `isVmModeEnabled()` is renderer-URL based through
  `infrastructure/runtime/vmMode.js`
- `selectStartupSurface()` resolves VM/dashboard/onboarding startup surface
  selection used by `App.jsx`
- `getRendererEntrypointView()` resolves the `view` route used by `main.jsx`
- `getRendererRootElement()` resolves the React mount target used by
  `main.jsx`
- `shouldSuppressWakewordOnStartup()` starts wakeword suppressed on secondary
  renderer views and active on the main dashboard view

Startup adapter behavior:

- returns true only when query parameter `vm_mode=1` is present
- supported `view` values are `minimal-chat-pill`,
  `minimal-response-overlay`, and `tool-ghost-debug`
- missing or unsupported `view` values resolve to the main app route
- fails closed (`false`) on missing window/location or parse exceptions
- root target lookup reads the `root` element through the startup runtime
  document adapter rather than directly in `main.jsx`

This is intentionally independent from backend and renderer config state.

## Permission Onboarding Persistence Contract

Startup completion is now sourced from `permissionStore` local persistence:

- storage key: `windieos-permission-onboarding`
- persisted fields: `manifest_version`, `completed`, `completed_at`
- retired `desktop-agent-permission-onboarding` state is ignored instead of
  migrated, so old namespace completion can reset to onboarding for the current
  manifest
- `completeOnboarding()` only requires a manifest version and stores completion even if some permissions are still missing
- when completion succeeds, `permissionStore.needsOnboarding` flips false and `AppContent` re-renders into the dashboard shell

## Onboarding Slideshow Runtime Contract

`DesktopOnboardingSlideshow` is now a dynamic wizard:

- one permission slide per manifest permission on the current platform
- one final stop-agent shortcut slide (platform label)

Implementation split:

- `AppContent` owns startup-surface IPC handoff (`show-main-window` for onboarding/VM, `show-chatbox` for normal desktop startup)
- `DesktopOnboardingSlideshow` owns shell routing and footer controls only
- `DesktopOnboardingSlideRuntime.buildOnboardingSlideState(...)` is the pure
  app-runtime slide-index/slide-kind model
- `PermissionOnboardingSlide` renders the active permission card only
- `StopShortcutOnboardingSlide` renders the keybind-only final slide
- `useOnboardingPermissionActions()` owns the simple `Grant -> Waiting... -> probe` loop for settings-backed OS permissions plus post-grant permission effects

Viewport/layout behavior:

- onboarding uses the full renderer window
- permission setup shows one permission card per slide so fit does not depend on total permission count
- widths are driven by a small set of onboarding CSS tokens (`shell`, `stage`, `copy`, `card`, `feedback`) instead of repeated inline caps
- footer actions remain outside the scroll region so `Next`, `Back`, and the skin-provided start CTA stay reachable under constrained viewport heights

Navigation behavior:

- `Next` / `Back` controls slide index
- permission slides advance through the current manifest in order
- the final skin-provided start CTA calls `permissionStore.completeOnboarding()`
- after completion, `AppContent` re-resolves startup surface and hands visibility to the minimal chat pill instead of leaving the dashboard window open
- startup-surface handoff is a generic lifecycle restore, not a wakeword/user
  summon; Electron main may suppress it when the user previously closed the
  minimal chat pill or when the same renderer startup-surface handoff is
  replayed after the initial startup decision
- onboarding completion uses `DesktopWindowRuntimeClient.showChatboxWithValues(...)`
  with the `onboarding-complete` reason so the first-run wizard can still
  intentionally land on the minimal chat pill
- the final start CTA stays enabled once permission status has loaded, even if some permissions are still missing
- the final slide warns when permissions remain missing and points the user to Settings for follow-up
- while onboarding is active, closing the main window hides onboarding without restoring the minimal chat pill; reopening the app restores onboarding until the wizard is completed
- onboarding is treated as its own primary surface in the main process, separate from both dashboard and minimal chat pill state

Stop shortcut label source:

- prop override when provided
- fallback to `DesktopShortcutRuntimeClient.getAgentStopShortcutLabel()`
- label reflects the saved renderer config value when `global_agent_stop_shortcut` is present
- slide renders the shortcut as separate keycaps split on `+` so longer labels like `Command + Shift + Esc` can stay on one line instead of clipping inside one fixed-width pill

Platform mapping in shortcut helper:

- default macOS: `Command + Shift + Esc`
- default Windows: `Ctrl + Alt + .`
- default Linux: `Ctrl + Shift + Esc`
- each platform exposes a small catalog of supported alternatives in Settings > General

## Current Permission-Gate Boundary

Renderer app startup blocks only until onboarding has been completed for the current manifest in non-VM mode.

The same permission store also powers focused settings checks such as Browser automation status so onboarding and post-onboarding probes stay on one state model.

## Test-Backed Invariants

`tests/frontend/AppVmMode.test.jsx`:

- VM mode always renders dashboard shell
- VM mode bypasses onboarding slideshow

`tests/frontend/AppPermissionGate.test.jsx`:

- non-VM mode renders onboarding while `needsOnboarding` is true
- non-VM mode renders dashboard after permission onboarding completes while
  requesting focused chatbox restore through `DesktopWindowRuntimeClient`
- non-VM mode does not flash onboarding during pre-bootstrap startup when persisted onboarding completion is already true
- onboarding completion transition moves the visible surface from onboarding/main-window to the chat pill

`tests/frontend/startupSurface.test.js`:

- startup selector sends VM launches straight to dashboard through
  `DesktopStartupRuntimeClient.selectStartupSurface(...)`
- pre-bootstrap routing uses persisted onboarding completion
- post-bootstrap routing uses the manifest-aware permission gate

`tests/frontend/DesktopOnboardingSlideshow.test.jsx`:

- deterministic permission-by-permission progression based on manifest length
- back/next behavior
- completion callback fires once on final CTA
- actions remain outside the scroll region on permission slides so footer controls stay reachable under constrained viewport heights

`tests/frontend/onboardingSlides.test.js`:

- slide-state derivation clamps out-of-range indices and preserves permission-vs-stop-slide semantics

## Drift Hotspots

1. Changing VM-mode detection source (URL query vs config/env) without updating startup docs/tests can break hosted VM launch behavior.
2. Reintroducing permission gating into `AppContent` without updating routing docs can create confusing onboarding regressions.
3. Changing onboarding storage key or payload shape without migration handling can reset completion state unexpectedly.
4. Re-mounting `WakewordController` on onboarding surfaces will reintroduce pre-onboarding microphone prompts on cold start.
5. Changing the global shortcut catalog without updating onboarding/settings copy can make the first-run keybind guidance drift from the actual registered accelerator.
6. Reintroducing mixed grid/wizard permission CSS selectors can silently left-align the single-card wizard even when the React tree is correct.

## Related Docs

- [Renderer Runtime](renderer_runtime.md)
- [Frontend Renderer Provider Docs Hub](providers/README.md)
- [Entrypoint View Routing and Provider Stack Reference](providers/entrypoint_view_routing_and_provider_stack_reference.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
