---
summary: "Deep reference for renderer context-hook boundaries: AppConfig/AppStatus provider guard errors, direct owner exports, and strict in-provider consumption contracts."
read_when:
  - When changing `useAppConfigContext` or `useAppStatusContext` guard behavior.
  - When updating import surfaces for config context hooks across renderer features/tests.
title: "App Config and Status Context Hook Guard Reference"
---

# App Config and Status Context Hook Guard Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppConfigContext.jsx`
- `frontend/src/renderer/app/providers/AppStatusContext.jsx`
- `tests/frontend/AppConfigContext.test.tsx`
- `tests/frontend/AppStatusContext.test.tsx`

## AppConfigContext Hook Guard Contract

`AppConfigContext` is exported directly from its owning provider-context module.
Do not add passive re-export blocks or alternate context barrels.

`useAppConfigContext()`:

- reads from `AppConfigContext` via `useContext`
- throws when context value is falsy with message:
  - `useAppConfigContext must be used within an AppConfigProvider`

This is a fail-fast boundary for all config-consuming renderer surfaces.

## AppStatusContext Hook Guard Contract

`AppStatusContext` is exported directly from its owning provider-context module.
Do not add passive re-export blocks or alternate context barrels.

`useAppStatusContext()`:

- reads from `AppStatusContext` via `useContext`
- throws when context value is falsy with message:
  - `useAppStatusContext must be used within an AppStatusProvider`

This prevents save-status consumers from silently operating with missing status state.

## Test-Backed Matrix

`tests/frontend/AppConfigContext.test.tsx`:

- verifies throw outside provider
- verifies value passthrough inside provider

`tests/frontend/AppStatusContext.test.tsx`:

- verifies throw outside provider
- verifies value passthrough inside provider

`tests/frontend/RendererAppRuntimeBoundary.test.ts`:

- verifies these provider context owner modules do not use passive `export { ... }`
  blocks

## Drift Hotspots

1. Relaxing guard throws to silent fallbacks can hide provider mis-wiring and cause late null dereferences.
2. Changing guard error text breaks tests and diagnostic consistency.
3. Adding hook re-export modules or passive export blocks can recreate duplicate import ownership without adding provider behavior.

## Related Pages

- [Renderer Provider Contexts Docs Hub](README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../app_provider_coordinator_and_save_status_runtime_reference.md)
