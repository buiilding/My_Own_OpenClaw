---
summary: "Deep reference for renderer app startup routing in `App.jsx`: VM-mode dashboard bypass, frontend onboarding slideshow persistence gate, provider stack ownership, and wakeword controller mount boundaries."
read_when:
  - When changing renderer app startup flow in `frontend/src/renderer/app/App.jsx`.
  - When debugging why users land in onboarding slideshow vs dashboard shell across VM and non-VM launches.
title: "App Startup VM-Mode and Frontend Onboarding Runtime Reference"
---

# App Startup VM-Mode and Frontend Onboarding Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/infrastructure/runtime/vmMode.js`
- `frontend/src/renderer/features/onboarding/utils/frontendOnboardingStorage.js`
- `frontend/src/renderer/features/onboarding/components/FrontendOnboardingSlideshow.jsx`
- `frontend/src/renderer/infrastructure/shortcuts/agentStopShortcut.js`
- `tests/frontend/AppVmMode.test.jsx`
- `tests/frontend/FrontendOnboardingStorage.test.js`
- `tests/frontend/FrontendOnboardingSlideshow.test.jsx`

## Provider and Root Composition

`App` composes the root runtime in fixed order:

1. `ErrorBoundary`
2. `AppProvider`
3. `ChatProvider`
4. `WakewordController`
5. `AppContent`

`WakewordController` is always mounted in this default surface path.

## Startup Routing in `AppContent`

`AppContent` resolves startup destination with two gates:

1. VM mode gate (`isVmModeEnabled()`)
2. frontend onboarding completion gate (`loadFrontendOnboardingState().completed`)

Routing behavior:

- VM mode enabled:
  - render `ChatGptDashboardShell` immediately
  - pass `vmModeEnabled={true}`
  - bypass frontend onboarding slideshow
- VM mode disabled + onboarding incomplete:
  - render `FrontendOnboardingSlideshow`
  - inject stop-agent shortcut label from `getAgentStopShortcutLabel()`
- VM mode disabled + onboarding complete:
  - render `ChatGptDashboardShell`
  - pass `vmModeEnabled={false}`

## VM Mode Detection Contract

`isVmModeEnabled()` is renderer-URL based:

- reads `window.location.search`
- returns true only when query parameter `vm_mode=1` is present
- fails closed (`false`) on missing window/location or parse exceptions

This is intentionally independent from backend/frontend config state.

## Frontend Onboarding Persistence Contract

Storage key:

- `windieos-frontend-onboarding` (localStorage JSON object)

`loadFrontendOnboardingState()`:

- returns default `{ completed: false, completed_at: null }` when missing/malformed
- only treats `completed === true` as completed
- only accepts string `completed_at`; otherwise `null`

`saveFrontendOnboardingState(state)`:

- writes provided state via shared JSON localStorage helper

Completion path in `AppContent`:

1. create completion payload with current ISO timestamp
2. persist payload
3. set local React state `frontendOnboardingComplete = true`
4. re-render into dashboard shell

## Onboarding Slideshow Runtime Contract

`FrontendOnboardingSlideshow` has two fixed slides:

- permissions/access expectation slide
- stop-agent shortcut slide (platform label)

Navigation behavior:

- `Next` / `Back` controls slide index
- final CTA `Start WindieOS` calls `onComplete`

Stop shortcut label source:

- prop override when provided
- fallback to `getAgentStopShortcutLabel()`

Platform mapping in shortcut helper:

- macOS: `Command + Shift + Esc`
- non-macOS: `Ctrl + Shift + Esc`

## Current Permission-Gate Boundary

Renderer app startup no longer blocks on `PermissionOnboardingWizard` gate in `AppContent`.

Permission status UI remains accessible through settings data-controls surfaces (`PermissionControlCenter`), but it is not the startup routing gate in current `App.jsx`.

## Test-Backed Invariants

`tests/frontend/AppVmMode.test.jsx`:

- VM mode always renders dashboard shell
- VM mode bypasses onboarding slideshow

`tests/frontend/FrontendOnboardingStorage.test.js`:

- empty storage default
- persisted completion state round-trip
- malformed JSON fails closed to default

`tests/frontend/FrontendOnboardingSlideshow.test.jsx`:

- deterministic 2-step progression
- back/next behavior
- completion callback fires once on final CTA

## Drift Hotspots

1. Changing VM-mode detection source (URL query vs config/env) without updating startup docs/tests can break hosted VM launch behavior.
2. Reintroducing permission gating into `AppContent` without updating routing docs can create confusing onboarding regressions.
3. Changing onboarding storage key or payload shape without migration handling can reset completion state unexpectedly.
4. Mounting `WakewordController` conditionally at app root can silently break wakeword readiness assumptions in non-dashboard surfaces.

## Related Docs

- [Renderer Runtime](renderer_runtime.md)
- [Frontend Renderer Provider Docs Hub](providers/README.md)
- [Entrypoint View Routing and Provider Stack Reference](providers/entrypoint_view_routing_and_provider_stack_reference.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
