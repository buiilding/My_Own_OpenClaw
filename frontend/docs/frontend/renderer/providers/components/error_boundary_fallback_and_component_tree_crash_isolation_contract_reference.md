---
summary: "Deep reference for renderer ErrorBoundary behavior: derived-error state transition, fallback rendering payload, and componentDidCatch console logging semantics."
read_when:
  - When changing `ErrorBoundary` lifecycle methods or fallback UI shape.
  - When debugging uncaught render-tree exceptions in App/minimal-pill/response/context overlay renderer roots.
title: "Error Boundary Fallback and Component-Tree Crash Isolation Contract Reference"
---

# Error Boundary Fallback and Component-Tree Crash Isolation Contract Reference

## Canonical Modules

- `frontend/src/renderer/components/ErrorBoundary.jsx`
- `frontend/src/renderer/styles/ErrorBoundary.css`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/MinimalChatPillApp.jsx`
- `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`

## Class Lifecycle Contract

`ErrorBoundary` is a class component (not hook-based) with two error lifecycle hooks:

- `static getDerivedStateFromError(error)` -> sets `{ hasError: true, error }`
- `componentDidCatch(error, errorInfo)` -> logs to console

Initial state:

- `hasError: false`
- `error: null`

## Fallback Rendering Contract

When `hasError` is true, boundary renders fallback block:

- wrapper `.error-boundary`
- heading `Something went wrong.`
- `<details>` with `error.toString()` and stack trace when available

When no error exists, boundary returns `this.props.children` unchanged.

## Logging Contract

`componentDidCatch` emits:

- `console.error('Uncaught error in React component tree:', error, errorInfo)`

No external reporting service integration is wired in this module today.

## Prop Contract

`children` is required (`PropTypes.node.isRequired`).

Boundary expects to wrap complete app surfaces, not leaf nodes.

## Runtime Placement

Provider stack docs place this boundary around all renderer root surfaces:

- default app
- minimal chat pill overlay app
- response overlay app

This gives one crash containment boundary per window surface.

## Drift Hotspots

1. Converting to function component without equivalent error boundary behavior breaks crash containment.
2. Removing stack/details payload can hinder local crash triage.
3. Moving boundary inside provider trees narrows containment scope and can leave top-level crashes uncaught.

## Related Pages

- [Renderer Provider Components Docs Hub](README.md)
- [Entrypoint View Routing and Provider Stack Reference](../entrypoint_view_routing_and_provider_stack_reference.md)
