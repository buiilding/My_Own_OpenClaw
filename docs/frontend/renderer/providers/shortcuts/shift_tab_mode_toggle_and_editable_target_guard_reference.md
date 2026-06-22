---
summary: "Deep reference for AppProvider global Shift+Tab handling: listener lifetime, editable-target guard checks, and interaction_mode toggle payload semantics."
read_when:
  - When changing `AppContextCoordinator` keydown logic or editable-target detection.
  - When debugging unexpected interaction-mode flips while typing in inputs/text editors.
title: "Shift+Tab Mode Toggle and Editable Target Guard Reference"
---

# Shift+Tab Mode Toggle and Editable Target Guard Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopAppProviderRuntime.js`
- `tests/frontend/AppProvider.test.tsx`
- `tests/frontend/DesktopAppProviderRuntime.test.js`

## Listener Ownership and Lifetime

`AppContextCoordinator` owns the shortcut policy and installs one global
keydown subscription through `DesktopAppProviderRuntime`.

Lifetime behavior:

- listener is installed once on mount
- listener is removed once on unmount
- rerenders do not rebind listener

The callback reads current config/update handlers through refs (`configRef`, `updateConfigRef`) so logic stays current without effect re-subscription churn.

## Shortcut Match Contract

Toggle only runs when all conditions hold:

- `event.key === "Tab"`
- `event.shiftKey === true`
- `altKey`, `ctrlKey`, `metaKey` are all false
- `event.repeat === false`
- `updateConfigRef.current` is a function
- event target is not editable (`isEditableShortcutTarget(...) === false`)

When matched:

1. `event.preventDefault()`
2. read current mode from `config.interaction_mode` (default `agent`)
3. compute next mode: `chat -> agent`, `agent -> chat`
4. call `updateConfig` with full merged config object including new `interaction_mode`

## Editable-Target Guard Contract

`DesktopAppProviderRuntime.isEditableShortcutTarget(target)` returns true for:

- elements inside selector:
- `input`
- `textarea`
- `select`
- `[contenteditable=""]`
- `[contenteditable="true"]`
- `[role="textbox"]`
- elements with `HTMLElement.isContentEditable === true`

This prevents mode toggles while user is typing in rich/text input contexts.

## Callback Registration Side-Path

In the same coordinator component, `registerSaveStatusCallback(statusContext.setSaving)` is wired when available.

This binding is independent from shortcut handling but shares the same coordinator boundary.

## Test-Backed Invariants

`tests/frontend/AppProvider.test.tsx` verifies:

- save-status callback registration to status provider
- Shift+Tab toggles from `chat` to `agent` and back
- non-Shift+Tab keydown is ignored
- editable-target events do not toggle mode
- null/invalid `updateConfig` path exits safely without throw
- missing `registerSaveStatusCallback` path exits safely without throw
- listener is not rebound on rerender

## Drift Hotspots

1. expanding shortcut matching without editable guard can steal keyboard behavior from text inputs.
2. switching to closure-captured config/update values can introduce stale toggle behavior after rerenders.
3. emitting partial config payloads instead of merged config can accidentally drop other renderer-managed settings.

## Related Pages

- [Renderer Provider Shortcut Docs Hub](README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../app_provider_coordinator_and_save_status_runtime_reference.md)
- [Entrypoint View Routing and Provider Stack Reference](../entrypoint_view_routing_and_provider_stack_reference.md)
