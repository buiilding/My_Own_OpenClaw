---
summary: "Deep reference for tool-ghost track style contract: ratio->CSS variable mapping, movement/click animation class semantics, ripple/rect behavior, and motion-threshold gating."
read_when:
  - When changing `buildToolGhostTrackStyle` or `hasToolGhostMotion` in `chatBoxResponseUtils.js`.
  - When changing ghost animation keyframes/classes in `ChatBoxResponseOverlay.css`.
title: "Tool Ghost Track Style Variable and CSS Animation Contract Reference"
---

# Tool Ghost Track Style Variable and CSS Animation Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/chatBoxResponseUtils.js`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`
- `tests/frontend/ChatBoxResponse.test.jsx`

## Style Variable Builder Contract

`buildToolGhostTrackStyle(toolGhostPreview, startRatio, targetRatio)` emits:

- `--ghost-start-left`
- `--ghost-start-top`
- `--ghost-end-left`
- `--ghost-end-top`
- `--ghost-ripple-left`
- `--ghost-ripple-top`
- `--ghost-target-scale`
- `--ghost-motion-duration`

Optional rectangle vars (only when `hasRect` and ratio fields are finite):

- `--ghost-rect-left`
- `--ghost-rect-top`
- `--ghost-rect-width`
- `--ghost-rect-height`

Ratio normalization:

- all ratio->percent values clamp to `[0,1]`

Duration selection:

- click action => `TOOL_GHOST_CLICK_SYNC_DELAY_MS` (`3200ms`)
- non-click motion => `500ms`

## Motion Path Threshold Contract

`hasToolGhostMotion(...)` returns true only when:

- target ratio exists
- absolute delta on x or y is greater than `RATIO_EPSILON` (`0.001`)

Effect:

- prevents noisy/near-identical ratios from activating motion class/keyframes

## ChatBoxResponse Class Mapping

Track classes:

- `is-targeted`: effective target exists
- `has-rect`: preview has rect ratios
- `is-click-animating`: click timeline branch
- `is-moving`: motion action plus `hasToolGhostMotion(...)`

Target ripple rendering:

- rendered only when target exists and `showsTargetRipple` true
- `is-click-timeline` class enables click-specific ripple keyframe

Label anchor:

- positioned at `--ghost-end-left` / `--ghost-end-top` offset region

## CSS Animation Contract

Primary keyframes:

- `chatboxToolGhostMove`:
  - start at `--ghost-start-left/top`
  - end at `--ghost-end-left/top`
- `chatboxToolGhostClickTimeline`:
  - hold start through 31.25%
  - move by 68.75%
  - hold target through 100%
- `chatboxToolGhostTargetRippleClick`:
  - hidden until 68.75%
  - visible burst near target-hold stage

Static positioning behavior:

- targeted non-moving non-click tracks place cursor directly at end coordinates

## Test-Backed Signals

`tests/frontend/ChatBoxResponse.test.jsx` asserts:

- click branch sets `is-click-animating`
- start and end variables diverge when sampled mouse differs from target
- unresolved target-display fallback still maps raw coordinates into non-default end variables
- rect metadata sets `has-rect` and rect CSS variables
- target ripple appears and uses click timeline class for click actions

## Drift Hotspots

1. Renaming CSS custom properties in JS or CSS without parity update breaks ghost rendering silently.
2. Changing `RATIO_EPSILON` can suppress legitimate movement or trigger jitter animations.
3. Duration/keyframe ratio drift from `TOOL_GHOST_CLICK_SYNC_DELAY_MS` breaks visual sync with delayed tool execution.

## Related Pages

- [Renderer Tool-Ghost Lifecycle Docs Hub](README.md)
- [Tool Ghost Lifecycle System-State Sampling, Target Resolution, and Click Hide-Timer Reference](tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../../response_overlay_phase_and_tool_ghost_runtime_reference.md)
