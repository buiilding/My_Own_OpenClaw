---
summary: "Deep reference for the Windie-owned sidecar browser runtime: canonical action registry, validation boundary, controller/runtime ownership split, and feature-pack readiness contract."
read_when:
  - When changing `frontend/src/main/python/tools/browser/*` runtime dispatch, browser action coverage, or browser tool error mapping.
  - When tightening or extending the canonical `browser` tool contract and needing runtime/schema parity across sidecar and backend.
title: "Browser Runtime Contract And Windie Runtime Reference"
---

# Browser Runtime Contract And Windie Runtime Reference

## Purpose

The sidecar `browser` tool is now a Windie-owned runtime, not a vendored Browser Use wrapper.

The runtime boundary is:

- `browser_tool.py`: instantiate canonical args, execute runtime, normalize failures into `ToolResult`
- `schemas.py`: authoritative runtime validation for canonical browser payloads
- `windie_runtime.py`: action dispatch and behavior grouped by browser domain
- `controller.py`: browser/session/page primitives and Playwright-facing operations
- `content_extraction.py` / `file_store.py`: browser-specific helpers that do not belong in the generic controller

## Canonical Action Registry

The runtime declares one explicit supported-action set in `windie_runtime.py`.

That registry should stay in parity with:

- the sidecar canonical browser action contract in `schemas.py`
- the backend remote browser tool schema

The parity rule is:

- canonical actions must be implemented end to end
- removed aliases must stay rejected at validation time
- new browser actions should update schema, runtime dispatch, backend remote schema, docs, and tests in the same change

## Ownership Split

Use this split when refactoring:

- `schemas.py` owns what arguments are allowed
- `windie_runtime.py` owns what each canonical action means
- `controller.py` owns Playwright/browser/session primitives

Avoid pushing policy back into the controller when the behavior is really tool-level orchestration.
Avoid pushing browser/session primitives up into the runtime when they should remain reusable controller methods.

## Error Contract

Runtime failures should normalize into deterministic sidecar error codes:

- `INVALID_ARGUMENT`
- `BROWSER_NOT_CONNECTED`
- `ACTION_UNSUPPORTED`
- `BROWSER_RUNTIME_ERROR`

The runtime should raise `BrowserActionError` for expected browser/tool failures.
`browser_tool.py` is the boundary that maps those failures into serialized sidecar tool results.

## Feature-Pack Readiness

The browser feature-pack readiness contract should track the Windie-owned runtime’s actual import needs, not deleted vendor architecture.

Current browser feature-pack markers:

- `playwright`
- `markdownify`

If the runtime starts requiring additional optional modules, update:

- sidecar requirements/runtime requirements
- feature-pack marker detection
- browser tool docs
- focused sidecar tests

## Maintainer Notes

- Do not reintroduce Browser Use/OpenClaw compatibility aliases.
- Prefer adding small runtime helpers over growing one monolithic handler.
- Keep runtime/schema parity covered by tests so canonical action drift fails loudly.
