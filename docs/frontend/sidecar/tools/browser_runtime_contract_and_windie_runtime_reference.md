---
summary: "Deep reference for the local-runtime Browser Use engine adapter: canonical action registry, validation boundary, engine ownership split, and feature-pack readiness contract."
read_when:
  - When changing `frontend/src/main/python/tools/browser/*` runtime dispatch, browser action coverage, or browser tool error mapping.
  - When tightening or extending the canonical `browser` tool contract and needing runtime/schema parity across local runtime and backend.
title: "Browser Runtime Contract and Browser Use Engine Reference"
---

# Browser Runtime Contract and Browser Use Engine Reference

## Purpose

The local-runtime `browser` tool uses a local-runtime Python adapter over the
maintained Browser Use CLI package. Backend/tool contracts own model-facing
policy; the local-runtime adapter owns runtime validation, local tool transport,
browser-local file helpers, and result normalization. Browser Use owns browser
session mechanics.

The runtime boundary is:

- `browser_tool.py`: instantiate canonical args, execute the engine adapter, normalize failures into `ToolResult`
- `windie_shared/browser_contract.py`: authoritative runtime validation for canonical browser payloads
- `browser_use_engine.py`: action mapping, Browser Use CLI invocation, deterministic extraction helpers, browser-local file helpers, and result normalization
- `chrome_launcher.py` / `chrome_detection.py`: dedicated browser Chrome/CDP startup policy

## Canonical Action Registry

The engine adapter declares one explicit supported-action set in
`browser_use_engine.py`.

That registry should stay in parity with:

- the shared canonical browser action contract in `windie_shared/browser_contract.py`
- the backend remote browser tool schema

The parity rule is:

- canonical actions must be implemented end to end
- removed aliases must stay rejected at validation time
- new browser actions should update schema, runtime dispatch, backend remote schema, docs, and tests in the same change

## Ownership Split

Use this split when refactoring:

- `windie_shared/browser_contract.py` owns what arguments are allowed
- `browser_use_engine.py` owns how each canonical action maps to Browser Use CLI behavior or adapter-owned helpers
- Browser Use owns Playwright/browser/session primitives

Avoid adding WindieOS policy to Browser Use internals. Keep WindieOS-specific
normalization and fallback behavior in `browser_use_engine.py`.

## Error Contract

Engine failures should normalize into deterministic sidecar error codes:

- `INVALID_ARGUMENT`
- `BROWSER_NOT_CONNECTED`
- `ACTION_UNSUPPORTED`
- `BROWSER_RUNTIME_ERROR`

The engine adapter should raise `BrowserActionError` for expected browser/tool failures.
`browser_tool.py` is the boundary that maps those failures into serialized local-runtime tool results.

## Feature-Pack Readiness

The browser feature-pack readiness contract should track the Browser Use engine
adapter's actual import needs, not deleted vendored runtime architecture.

Current browser feature-pack markers:

- `playwright`
- `markdownify`

If the runtime starts requiring additional optional modules, update:

- local-runtime Python requirements/runtime requirements
- feature-pack marker detection
- browser tool docs
- focused local-runtime Python tests

## Maintainer Notes

- Do not reintroduce retired `WindieBrowserRuntime` or vendored `browser_use.browser` session files.
- Prefer adding small adapter helpers over growing one monolithic handler.
- Keep engine/schema parity covered by tests so canonical action drift fails loudly.
