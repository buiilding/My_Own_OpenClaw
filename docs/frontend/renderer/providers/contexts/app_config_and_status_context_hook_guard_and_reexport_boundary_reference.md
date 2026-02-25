---
summary: "Deep reference for renderer context-hook boundaries: AppConfig/AppStatus provider guard errors, strict in-provider consumption contract, and AppContextHooks compatibility re-export semantics."
read_when:
  - When changing `useAppConfigContext` or `useAppStatusContext` guard behavior.
  - When updating import surfaces for config context hooks across renderer features/tests.
title: "App Config and Status Context Hook Guard and Re-Export Boundary Reference"
---

# App Config and Status Context Hook Guard and Re-Export Boundary Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppConfigContext.jsx`
- `frontend/src/renderer/app/providers/AppStatusContext.jsx`
- `frontend/src/renderer/app/providers/AppContextHooks.js`
- `tests/frontend/AppConfigContext.test.tsx`
- `tests/frontend/AppStatusContext.test.tsx`

## AppConfigContext Hook Guard Contract

`useAppConfigContext()`:

- reads from `AppConfigContext` via `useContext`
- throws when context value is falsy with message:
  - `useAppConfigContext must be used within an AppConfigProvider`

This is a fail-fast boundary for all config-consuming renderer surfaces.

## AppStatusContext Hook Guard Contract

`useAppStatusContext()`:

- reads from `AppStatusContext` via `useContext`
- throws when context value is falsy with message:
  - `useAppStatusContext must be used within an AppStatusProvider`

This prevents save-status consumers from silently operating with missing status state.

## Re-Export Compatibility Boundary (`AppContextHooks.js`)

`AppContextHooks.js` currently re-exports only:

- `useAppConfigContext`

Contract intent:

- stable import path used by multiple renderer feature modules/tests
- thin compatibility layer over `AppConfigContext` implementation
- no extra runtime logic or provider wiring

Practical implication:

- changing/removing this re-export path requires repo-wide import updates and can break mocked-path tests.

## Test-Backed Matrix

`tests/frontend/AppConfigContext.test.tsx`:

- verifies throw outside provider
- verifies value passthrough inside provider

`tests/frontend/AppStatusContext.test.tsx`:

- verifies throw outside provider
- verifies value passthrough inside provider

Indirect path coverage:

- many renderer tests mock `AppContextHooks` import path; this locks path compatibility at integration level.

## Drift Hotspots

1. Relaxing guard throws to silent fallbacks can hide provider mis-wiring and cause late null dereferences.
2. Changing guard error text breaks tests and diagnostic consistency.
3. Renaming/removing `AppContextHooks` exports without synchronized import migration breaks feature-level test mocks.

## Related Pages

- [Renderer Provider Contexts Docs Hub](README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../app_provider_coordinator_and_save_status_runtime_reference.md)
