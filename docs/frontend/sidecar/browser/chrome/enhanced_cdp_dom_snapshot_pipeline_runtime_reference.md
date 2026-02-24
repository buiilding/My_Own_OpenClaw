---
summary: "Deep reference for enhanced CDP snapshot internals: parallel CDP fetch/retry policy, DOM/AX/style merge heuristics, interactive-node selection, ref attachment, truncation, and detach cleanup behavior."
read_when:
  - When changing `EnhancedCdpDomPipeline` fetch/retry strategy, interactivity heuristics, or ref-attachment behavior.
  - When debugging missing refs, snapshot truncation, CDP timeout failures, or mismatches between DOM/AX visibility decisions.
title: "Enhanced CDP DOM Snapshot Pipeline Runtime Reference"
---

# Enhanced CDP DOM Snapshot Pipeline Runtime Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/enhanced_cdp_pipeline.py`
- `frontend/src/main/python/tools/browser/ref_registry.py`
- `tests/sidecar/tools/test_browser_enhanced_cdp_pipeline.py`

## Pipeline Goal

`EnhancedCdpDomPipeline` builds browser-use-style interactive snapshots with stable-ish refs by combining:

- `DOMSnapshot.captureSnapshot`
- full DOM tree (`DOM.getDocument`)
- AX tree (`Accessibility.getFullAXTree`)
- JS click-listener discovery via command-line API
- per-node style/layout and role/name hints

## Parallel Fetch and Retry Policy

`_run_parallel_with_retry(...)`:

- runs task factories concurrently
- initial timeout: `10s`
- retry timeout: `2s`
- one retry cycle for timed-out/failed tasks
- raises `TimeoutError` only if required tasks still missing

Required tasks for snapshot build:

- `snapshot`
- `dom_tree`
- `device_pixel_ratio`

Optional-but-used when available:

- `ax_tree`
- `js_click_listener_backend_ids`

## Device Pixel Ratio Resolution

`_get_device_pixel_ratio(...)` order:

1. derive DPR from `Page.getLayoutMetrics` (`visualViewport` / `cssVisualViewport` widths)
2. fallback `Runtime.evaluate("window.devicePixelRatio || 1")`
3. final fallback `1.0`

DPR is guarded against non-positive values.

## Snapshot + AX Lookups

`build_snapshot_lookup(...)` maps `backendNodeId -> SnapshotNodeInfo` and carries:

- clickable markers
- bounds (DPR-normalized)
- selected computed styles
- cursor style

`build_ax_lookup(...)` maps `backendNodeId -> {role, name}`.

## JS Listener Signal

`_get_js_click_listener_backend_ids(...)`:

- evaluates DOM-wide `getEventListeners(...)` scan for pointer/click listener families
- resolves matching element object IDs to `backendNodeId` via `DOM.describeNode`
- best-effort releases remote objects (`Runtime.releaseObject`) in `finally`

Failure behavior:

- any command-line API or traversal failure returns empty set (non-fatal)

## DOM Walk and Interactive Node Selection

`build_ai_snapshot(...)`:

- traverses DOM recursively through:
  - `children`
  - `shadowRoots`
  - `contentDocument`
- hard walk cap: `DEFAULT_MAX_NODE_WALK` (`50_000`)

Interactive decision fuses:

- tag/role heuristics
- snapshot clickability/style state
- AX role/name hints
- JS listener presence

Visibility checks include style/layout constraints. Disabled states are filtered.

Label derivation priority (first non-empty):

- `aria-label`, `title`, `name`, `placeholder`, `alt`, `value`
- AX name
- text preview

## Ref Assignment and Attribute Attachment

For each accepted interactive node:

1. build element key via injected `build_element_key(...)`
2. assign ref from `RefRegistry`
3. best-effort attach `data-windie-ref` by backend node id using CDP:
   - `DOM.resolveNode`
   - `Runtime.callFunctionOn`

Attachment failures do not fail snapshot generation.

After emission:

- `ref_registry.finalize_snapshot(seen_refs, url)` prunes stale refs

## Output Assembly

Output includes:

- title + URL header
- tree-like ancestor scaffolding (deduplicated path prefixes)
- browser-use-style lines with `[ref]` or `*[ref]` markers

Character guard:

- when `max_chars > 0` and exceeded, appends `... (truncated)` suffix

Result shape:

- `EnhancedAiSnapshotResult(text, title, url, ref_count)`

## Cleanup Semantics

`build_ai_snapshot(...)` stores CDP session in local variable and, in `finally`:

- calls `cdp.detach()` when available
- suppresses detach errors

## Test-Backed Contracts

`tests/sidecar/tools/test_browser_enhanced_cdp_pipeline.py` covers:

- style/bounds parsing with DPR normalization
- AX lookup mapping by backend node id
- parallel retry recovery for transient task failures
- snapshot serialization emits expected interactive ref lines
- CDP ref-attachment command path (`DOM.resolveNode`, `Runtime.callFunctionOn`) is exercised

## Related Pages

- [Frontend Sidecar Browser Chrome Docs Hub](README.md)
- [Browser Controller Lifecycle, Snapshot, and Action Runtime Reference](browser_controller_lifecycle_snapshot_and_action_runtime_reference.md)
- [Chrome Detection, Launcher, and CDP Session Reference](chrome_detection_launcher_and_cdp_session_reference.md)
