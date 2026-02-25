---
summary: "Deep reference for `useToolGhostLifecycle`: motion gating, `get-system-state` sampling, fallback target-ratio derivation, readiness flags, and click-timeline hide behavior."
read_when:
  - When changing lifecycle state in `useToolGhostLifecycle` or overlay visibility gating in `ChatBoxResponse`.
  - When debugging wrong ghost start position, missing target movement, or click ghost not hiding on time.
title: "Tool Ghost Lifecycle System-State Sampling, Target Resolution, and Click Hide-Timer Reference"
---

# Tool Ghost Lifecycle System-State Sampling, Target Resolution, and Click Hide-Timer Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/useToolGhostLifecycle.js`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/constants/toolGhostRuntime.ts`
- `tests/frontend/ChatBoxResponse.test.jsx`

## Lifecycle Entry Gate

Lifecycle runs only when both are true:

- `shouldShowToolGhostBase`
- `toolGhostPreview.isMotionAction`

When gate is false, hook resets to neutral defaults:

- start ratio: `{xRatio: 0.5, yRatio: 0.5}`
- target ratio: `null`
- ready: `true`
- hidden: `false`
- viewport: `{width: null, height: null}`

## Motion Lifecycle State Machine

On motion lifecycle start:

1. mark hidden false and ready false
2. reset start/target ratio state
3. seed viewport size from preview target-display dimensions (if finite)
4. request runtime state via `IpcBridge.invoke(GET_SYSTEM_STATE, {fields:["mouse_position","screen_resolution"]})`

Helper parsing contracts:

- `parseMousePosition` accepts `"x,y"` with optional whitespace/decimals/sign
- `parseScreenResolution` accepts `"WIDTHxHEIGHT"` case-insensitive
- invalid values return `null`

## Runtime Start/Target Resolution

Viewport size precedence:

1. `toolGhostPreview.targetDisplayWidth/Height` (if finite > 0)
2. parsed `system_state.screen_resolution`
3. `null`

Start ratio:

- when mouse + viewport are valid: clamp(mouse / viewport) into `[0,1]`
- fallback neutral center `{0.5,0.5}`

Target ratio precedence:

1. resolved target ratio from preview (`hasTarget`)
2. fallback from raw target px (`rawTargetX/rawTargetY`) divided by resolved viewport
3. `null`

## Ready/Hidden Semantics

`beginGhostLifecycle(...)` sets:

- `toolGhostStartRatio`
- `toolGhostResolvedTargetRatio`
- `toolGhostReady = true`

Click-only hide timer:

- enabled only when `toolGhostPreview.isMouseClick`
- hides ghost after `TOOL_GHOST_CLICK_SYNC_DELAY_MS` (`3200` ms)

Non-click motion actions (for example scroll):

- no forced hide timer
- ghost remains visible while overlay phase keeps `showToolGhost` true

## Cancellation and Cleanup

Effect cleanup:

- flips `cancelled` guard to suppress late async writes
- clears pending hide timer

Dependency set includes:

- motion/click/target flags and ratios
- target/raw coordinate fields
- `activeToolCallId`

Implication:

- lifecycle restarts on new tool-call identity even if ratios are unchanged

## ChatBoxResponse Integration Contract

`showToolGhost` condition:

- base gate true and:
  - not click action, or
  - click action with `toolGhostReady && !toolGhostHidden`

Fullscreen overlay sizing mode:

- enabled for motion actions
- uses hook-provided viewport width/height in `set-responsebox-size` full-screen payload

## Test-Backed Matrix

`tests/frontend/ChatBoxResponse.test.jsx` verifies:

- click lifecycle starts from sampled mouse position
- fallback raw coordinate mapping works when `target_display_size` absent
- click ghost hides exactly at `TOOL_GHOST_CLICK_SYNC_DELAY_MS`
- targeted coordinates and target-rect metadata produce expected track classes/vars

## Drift Hotspots

1. Changing parse rules for `mouse_position`/`screen_resolution` can silently force neutral-start fallbacks.
2. Removing raw-target fallback path breaks click placement when preview lacks resolved ratios.
3. Timer duration drift from `TOOL_GHOST_CLICK_SYNC_DELAY_MS` breaks sync with deferred real click execution.

## Related Pages

- [Renderer Tool-Ghost Lifecycle Docs Hub](README.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
- [Tool Ghost Preview Payload Parsing and Target Mapping Reference](../tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
