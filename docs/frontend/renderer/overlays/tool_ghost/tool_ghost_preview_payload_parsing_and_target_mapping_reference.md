---
summary: "Deep reference for tool-ghost preview internals: tool payload shape normalization, coordinate-contract target resolution, label selection, and click-animation timing sync."
read_when:
  - When changing `buildToolGhostPreviewFromMessageText` parsing rules or coordinate fallback behavior.
  - When changing response-overlay click ghost lifecycle timing to stay aligned with deferred frontend execution.
title: "Tool Ghost Preview Payload Parsing and Target Mapping Reference"
---

# Tool Ghost Preview Payload Parsing and Target Mapping Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/utils/toolGhostPreview.js`
- `frontend/src/renderer/features/chat/constants/toolGhostRuntime.ts`
- `tests/frontend/ChatBoxResponse.test.jsx`

## Input Payload Contract

`ChatBoxResponse` passes assistant `tool-call` message text into `buildToolGhostPreviewFromMessageText(...)`.

Accepted JSON shapes:

- single call:
- `{ "name": "...", "arguments": {...}, "metadata": {...} }`
- bundle-like call:
- `{ "tools": [ { "name": "...", "args": {...}, "metadata": {...} }, ... ] }`

Unsupported/invalid JSON yields default preview (no target, generic label).

## Entry Normalization Rules

`normalizeToolEntry` applies:

- `name`: trimmed string or empty
- `args`: object from `args` first, then `arguments`, else empty object
- `metadata`: object or empty object

`extractToolEntries` returns:

- one normalized entry for top-level single-call shape
- normalized list for `tools[]`
- empty list for invalid structure

## Label Resolution Priority

`resolveToolLabel(entry)` precedence:

1. `args.explanation` (trimmed, max 120 chars)
2. for `mouse_control`: `"Mouse action"`
3. for tools with numeric `wait_seconds`: `<tool> (wait Ns)`
4. generic named form: `"Running <tool>"`
5. fallback: `"Running tool action"`

## Click Action Detection

`isMouseClickAction(entry)` is true only when:

- `name === "mouse_control"`
- `args.action` (case-insensitive) in:
- `click`
- `double_click`
- `right_click`

This gates click-specific animation/hide timing behavior.

## Target Coordinate Resolution

`resolveToolTargetPoint(entry)` reads coordinate metadata in this order:

1. display/source size from:
- `metadata.coordinate_contract.target_display_size`
- fallback `metadata.coordinate_contract.source_image_size`
2. rectangle from:
- `metadata.target_rect`
- fallback `args.target_rect`
- fallback `metadata.coordinate_contract.target_rect`
3. point from:
- `metadata.coordinate_contract.normalized_coordinates.{x,y}`
- fallback `args.{x,y}`
- fallback rectangle center

If no point is resolved, preview has label-only mode with neutral center target.

When target exists:

- `xRatio/yRatio` are clamped to `[0,1]`
- optional target rect ratios are computed for CSS vars
- target scale derives from rect area ratio (`0.85..2.2` clamp)

## Response Overlay Click Ghost Sync

Timing constant:

- `TOOL_GHOST_CLICK_SYNC_DELAY_MS = 3200` ms
- composed from hold-start `1000`, move `1200`, hold-end `1000`

`ChatBoxResponse` lifecycle for click-like ghost:

1. initialize at neutral center
2. request live mouse position via `get-system-state`
3. map current mouse to start ratio when source display size known
4. animate to target and hide after full 3200 ms timeline

`useToolRunner` defers real click execution by the same duration to keep visual ghost and actual click synchronized.

## CSS Variable Bridge

When target exists, component injects custom properties used by overlay CSS:

- `--ghost-start-offset-x/y`
- `--ghost-end-offset-x/y`
- `--ghost-offset-x/y`
- `--ghost-target-scale`
- optional rect vars:
- `--ghost-rect-left/top/width/height`
- motion duration:
- `--ghost-motion-duration`

These variables drive both cursor movement and optional target rectangle rendering.

## Test-Backed Invariants

`tests/frontend/ChatBoxResponse.test.jsx` verifies:

- tool-call phase shows ghost and hides awaiting indicator
- click-ghost start offsets use live mouse-position fetch
- ghost hides exactly after `TOOL_GHOST_CLICK_SYNC_DELAY_MS`
- coordinate contract metadata drives targeted offsets
- target rect metadata renders rectangle and rect vars

## Drift Hotspots

1. changing payload parse rules without backward compatibility can silently disable ghost previews.
2. changing click-sync duration in one layer (renderer/tool-runner) breaks visual vs real-click alignment.
3. removing coordinate-contract fallbacks can drop target overlays for backend-generated metadata variants.

## Related Pages

- [Renderer Overlay Tool Ghost Docs Hub](README.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
