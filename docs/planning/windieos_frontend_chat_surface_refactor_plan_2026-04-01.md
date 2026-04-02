---
summary: "Frontend refactor plan for a simpler WindieOS chat-first dashboard, a parity desktop chat pill, and platform-specific overlay/capture behavior."
read_when:
  - Refactoring dashboard, chat pill, or response overlay UX toward one shared chat mental model.
  - Changing screenshot-capture surface visibility or computer-use handoff behavior across Linux, Windows, and macOS.
  - Unifying composer behavior, attachment handling, and session continuity between dashboard and desktop overlay surfaces.
title: "WindieOS Frontend Chat Surface Refactor Plan (2026-04-01)"
---

# WindieOS Frontend Chat Surface Refactor Plan (2026-04-01)

## Objective

Refactor the WindieOS frontend so the product feels like one clean, standard, chat-first LLM app with one OS-layer extension:

- the dashboard is the primary full chat surface
- the minimal chat pill is the desktop-hosted version of that same chat surface
- the response overlay is a projection of the active turn, not an independent second chat UI

The end state should reduce surface-specific quirks, remove avoidable platform divergence, and make dashboard, pill, and overlay behavior predictable during normal chat, screenshot capture, and computer-use loops.

## Confirmed Product Direction

The intended UX is:

1. Simplify the dashboard toward a standard LLM chat app layout.
2. Make the desktop chat pill behave like the dashboard chat pill/composer, only rendered as a desktop overlay.
3. Keep platform-specific screenshot visibility behavior explicit and minimal:
   - Linux hides WindieOS overlay surfaces for screenshot capture, then restores them after capture.
   - Windows and macOS never do hide/show, disappear/reappear, or capture-time restoration cycles.
4. During computer-use, dashboard ownership is temporary:
   - before screenshot-driven computer-use work, hide the dashboard
   - hand off to the minimal chat pill state
   - keep the agent loop projected from that pill/overlay state until completion

## Core Mental Model

WindieOS should expose two user-facing chat surfaces, but only one interaction model:

- `dashboard chat`: full-size conversation workspace
- `desktop pill`: always-on-top compact workspace on the desktop layer

These are two renderings of the same conversation/runtime state. They must not feel like different products with different composer, attachment, or session behavior.

The response overlay is subordinate to the same turn state:

- before the first visible assistant activity, the system is in an awaiting/typing state
- once text or tool activity begins, the system is in a response/active state
- after the loop ends, the surface returns to normal interactive chat behavior

## Target Dashboard Behavior

The dashboard should move toward a conventional LLM chat application layout:

- left rail for conversation navigation and secondary navigation
- central transcript as the primary surface
- one bottom composer for message entry and attachments
- advanced utilities such as memory, models, usage, and settings moved out of the primary chat flow

The main interaction priority should be:

1. resume or start a conversation
2. read the transcript
3. compose a message
4. inspect secondary controls only when needed

This implies:

- chat is the main product surface, not one panel among many competing panels
- side panels and modals should feel secondary to the transcript/composer workflow
- the dashboard header should become lighter-weight and more utility-oriented
- the empty state should resemble a standard chat-app first-send experience rather than a special dashboard mode

## Target Minimal Chat Pill Behavior

The minimal chat pill should not remain a custom single-line overlay input with separate affordances. It should become the desktop-hosted version of the same chat composer contract used in the dashboard.

Required parity includes:

- multiline text entry
- `Enter` sends
- `Shift+Enter` inserts a newline and increases composer height
- paste images with `Ctrl+V`
- attach non-image files as well as images
- preview attached items before send
- remove attached items before send
- use the same send/session/attachment pipeline as the dashboard
- preserve the same conversation identity as the dashboard

This means the pill is not a special-purpose shortcut input. It is a compact rendering of the normal chat composer and must share the same interaction semantics wherever possible.

## Attachment Parity Contract

Composer parity explicitly includes both image and non-image attachments.

The pill must support:

- pasted clipboard images
- selected image files
- selected readable non-image files
- mixed attachment sets in one outgoing message
- attachment-only sends when no explicit text is present

The attachment contract must match the dashboard path:

- optimistic attachment rendering before send
- identical outgoing payload normalization
- identical hidden readable-file context injection rules
- identical transcript/session association

No pill-only attachment shortcuts or dashboard-only attachment capability should remain after the refactor.

## Response Overlay Role

The response overlay should be treated as a current-turn projection surface, not as a second independent chat app.

Its job is:

- show awaiting/typing state before visible assistant activity
- show active response state once text or tool activity starts
- stay aligned with the active turn until terminal completion
- get out of the way when the turn is over

Important consequence:

- tool activity counts as real response activity
- the overlay must not wait for streamed text only
- once tool/text activity starts, the UI should transition out of the pre-response typing state

## Agent Loop Presentation Contract

During an active loop, the UI should behave like this on Windows and macOS:

1. user sends from dashboard or pill
2. if dashboard initiated the turn and the turn enters computer-use, dashboard hands off to the pill
3. pill remains visible throughout the loop
4. before first visible assistant text/tool activity, pill shows awaiting/typing state
5. on first visible text chunk or tool event, response overlay becomes the active projection surface
6. pill and response overlay remain visible but non-interactive during the active loop
7. after terminal state, both become interactive again

Active-loop phases that should be treated as non-interactive include:

- awaiting first chunk
- streaming
- tool-call
- tool-output
- any equivalent active execution state added later

Terminal states that should restore interactivity include:

- complete
- error
- cancel/stop-complete
- forced disconnect recovery back to idle

## Click-Through and Interactivity Rules

During the active loop:

- chat pill is click-through
- response overlay is click-through
- both are non-focusable/non-interactive

After the active loop:

- chat pill becomes interactive again
- response overlay becomes interactive again when still visible

This design implies stop/cancel must remain available through non-overlay paths while overlays are click-through:

- the dashboard
- the global stop shortcut
- any future dedicated OS-layer stop affordance

The overlay surfaces themselves should not be relied on as the primary stop control during active execution if they are intentionally non-interactive.

## Platform-Specific Screenshot Capture Contract

### Linux

On Linux only, screenshot capture must hide WindieOS overlay surfaces before capture, then restore them after capture.

Required Linux behavior:

- hide the minimal chat pill before screenshot capture
- hide the response overlay before screenshot capture
- wait for compositor settle before capture
- restore the exact previously hidden surface state after capture

Restore must be symmetric and stateful:

- if only the pill was visible before capture, restore only the pill
- if pill and response overlay were visible before capture, restore both
- if no WindieOS surface was visible before capture, restore nothing

This rule applies to all WindieOS-owned screenshot capture that depends on hiding UI from captured frames, not just one send path.

### Windows and macOS

On Windows and macOS:

- do not hide the minimal chat pill for screenshot capture
- do not hide the response overlay for screenshot capture
- do not do capture-time disappear/reappear behavior
- do not do hide/show restoration cycles tied to screenshot capture

These platforms should keep screenshot visibility handling as a no-op unless a future explicit product requirement says otherwise.

## Computer-Use Handoff Contract

When the dashboard is visible and computer-use begins, WindieOS should not try to keep the dashboard as the active user-facing execution surface.

Required handoff:

1. dashboard-originated turn enters computer-use
2. before screenshot-driven capture/execution work, hide the dashboard
3. transition into the minimal chat pill presentation
4. continue the agent loop from the pill/response-overlay surface family

After handoff:

- the pill becomes the active visible WindieOS surface
- the response overlay projects current-turn activity from the pill state
- screenshot capture ownership follows pill rules, not dashboard rules
- the runtime should not bounce back to the dashboard after each capture/tool step

This keeps the runtime model simple:

- dashboard is for planning, reading, and composing
- pill/overlay is for ambient desktop execution projection

## Session Continuity Contract

Dashboard, pill, and response overlay must remain one conversation workspace.

That means:

- opening dashboard from pill continues the same active conversation
- closing dashboard back to pill continues the same active conversation
- starting a new chat in dashboard updates pill ownership to that new conversation
- opening an old conversation in dashboard updates pill ownership to that conversation
- handoff from dashboard to pill during computer-use must not fork or reset the conversation

No new conversation reference should be created as part of surface transitions alone.

## Unstated but Required Implications

The requested behavior implies additional requirements even if they were not explicitly stated in the original request.

### One Canonical Composer Contract

Dashboard and pill cannot keep separate composer implementations with divergent behavior. The refactor should move toward one canonical composer contract with surface-specific styling rather than surface-specific logic.

### One Canonical Attachment Contract

Image and file attachment behavior must be shared across dashboard and pill. If either surface continues to own unique parsing, preview, or payload behavior, drift will return.

### One Canonical Loop-State Projection

Awaiting, active response, terminal, and disconnect-recovery states must be resolved once and projected into:

- dashboard transcript/composer state
- pill state
- response overlay state
- click-through/focusable main-process policy

### Tool Activity Starts the Visible Response Phase

Tool events are not secondary debug details. They are first-class activity and should be allowed to transition the UI from waiting to active-response projection.

### Linux Restore Must Preserve Pre-Capture Surface Shape

Linux restore behavior cannot be a blind "always show pill" or "always show overlay" action. It must restore the actual pre-capture visibility state.

### Dashboard-to-Pill Handoff Must Happen Before Capture

The dashboard should never remain the active visible execution surface during screenshot-driven computer-use capture. Handoff must occur first.

### Stop Must Stay Available Outside Click-Through Overlays

Because the pill and response overlay are intentionally click-through during the loop, reliable cancellation must remain available through the global stop shortcut and dashboard-level controls.

## Non-Goals

This refactor plan does not by itself require:

- redesigning trust dial, mission dock, or approval UX
- introducing a brand-new third surface family
- changing backend conversation semantics
- changing model/provider contracts
- changing screenshot capture implementation on Windows/macOS beyond preserving current no-op visibility behavior

## Implementation Implications

The refactor should bias toward a small number of canonical owners:

- one owner for loop-state projection
- one owner for composer payload/attachment behavior
- one owner for surface handoff and screenshot visibility policy
- one owner for platform-specific capture visibility differences

The current architecture already has pieces of this split, but the behavior still reflects historical surface divergence:

- dashboard composer and minimal pill composer are not yet at parity
- the pill still behaves like a special overlay widget rather than the desktop-hosted chat composer
- dashboard simplification toward a standard LLM app layout is not complete

## Acceptance Criteria

The refactor is complete when all of the following are true:

1. The dashboard presents as a conventional chat-first LLM app with chat as the dominant surface.
2. The minimal pill supports multiline entry, `Shift+Enter`, pasted images, non-image file attachments, previews, and the same send semantics as dashboard chat.
3. Dashboard and pill share the same conversation/session identity at all times.
4. During computer-use, the dashboard hands off to the minimal pill before screenshot-driven capture/execution.
5. On Linux, screenshot capture hides pill and response overlay, waits for settle, and restores the exact previous overlay state after capture.
6. On Windows and macOS, screenshot capture performs no overlay hide/show or disappear/reappear cycle.
7. On Windows and macOS, the pill stays visible through the active loop.
8. The pill shows awaiting/typing state before first visible assistant activity.
9. The response overlay takes over visible response projection once text or tool activity begins.
10. During active loop phases, pill and response overlay are click-through/non-focusable.
11. After loop completion/error/cancel/recovery, pill and response overlay become interactive again.
12. Tool activity is treated as response activity for surface transitions.

## Relationship to Existing Plans

This document is narrower and more execution-oriented than [os_layer_ux_evolution_plan.md](os_layer_ux_evolution_plan.md).

`os_layer_ux_evolution_plan.md` describes the broader future OS-layer direction.

This plan defines the immediate chat-surface simplification and parity work needed before more ambitious OS-layer UX ideas can land cleanly.
