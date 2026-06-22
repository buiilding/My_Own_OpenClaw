---
summary: "ADR 006 for the renderer-owned typing and visible turn lifecycle architecture, keeping SDK backend projection separate from local pending send state."
read_when:
  - When changing dashboard, chat pill, response overlay, Stop/busy state, pending-turn handling, SDK current-turn projection, or typing/awaiting UI behavior.
  - When debugging typing flicker, stale busy state, wrong-turn idle clearing, dashboard/pill/overlay projection drift, or SDK idle events overriding a local pending send.
title: "ADR 006: Renderer-Owned Typing State"
---

# ADR 006: Renderer-Owned Typing State

## Status

Accepted and implemented for renderer-owned desktop lifecycle projection as of
2026-06-22. Raw store fields such as `isSending`, `streamTracking`, and
`thinkingStatus` remain only as transport, diagnostic, or rendering/detail data;
dashboard, chat pill, response overlay, Stop/busy, and typing surfaces route
through the renderer visible turn lifecycle owner.

## Context

WindieOS desktop surfaces need to answer one user-visible question:

```text
What should this conversation show for the active turn right now?
```

Today that answer can be inferred from several places:

- renderer `pendingTurn`
- renderer `isSending`
- renderer `streamTracking`
- renderer `thinkingStatus`
- SDK `currentTurnProjection.phase`
- SDK `currentTurnProjection.presentation.typingVisible`
- SDK `currentTurnProjection.presentation.overlayVisible`
- SDK `currentTurnProjection.presentation.overlayIntent`
- SDK display rows and durable message rows
- dashboard-only row suppression such as live progress hiding the awaiting dot

Those inputs are not all equal. Some are raw state, some are derived
presentation, and some are rendering details. When multiple surfaces infer
typing/busy lifecycle independently, the dashboard, chat pill, and response
overlay can drift. A transient SDK idle or visible-but-empty projection can also
override a renderer-local pending send and make typing flicker.

The key lifecycle state that SDK cannot own by itself is `local_pending`: the
renderer accepted a user send and must immediately show typing before the SDK or
backend has emitted an authoritative current-turn state.

## Decision

Use a single renderer app-runtime projection as the source of truth for desktop
typing and visible turn lifecycle.

The SDK continues to own normalized backend event projection:

```text
backend / SDK events -> SDK currentTurnProjection
```

The renderer app-runtime owns desktop-visible turn projection:

```text
renderer pendingTurn + SDK currentTurnProjection -> visible turn lifecycle
```

The lifecycle states are:

| State | Meaning | Surface behavior |
| --- | --- | --- |
| `local_pending` | Renderer accepted user send for turn X; SDK/backend has not emitted authoritative same-turn state yet. | Show typing for X. |
| `awaiting` | Backend accepted turn X; no visible content/progress/error has been emitted yet. | Show typing for X. |
| `active` | Backend emitted visible reasoning, text, tool call, tool output, tool progress, search progress, or error content for X. | Replace typing with visible content/progress. |
| `terminal` | Backend completed, errored, or stopped turn X. | Clear busy/typing; keep terminal content if entries exist. |
| `idle` | No active turn for this conversation. | Show no active typing/progress; must not override `local_pending` for X. |

The core invariant is:

```text
After the renderer accepts user send for turn X, desktop surfaces render
local_pending for X until SDK emits an authoritative same-turn projection that
advances to awaiting, active, or terminal. SDK idle, stale, wrong-turn, or
visible-but-empty projections must not clear local_pending.
```

Dashboard, chat pill, response overlay, Stop/busy controls, and typing indicators
should consume this one renderer app-runtime projection. They should not each
derive lifecycle from lower-level fields.

## Lifecycle Inputs

Authoritative inputs:

- `pendingTurn`: renderer-local accepted send state
- `currentTurnProjection`: SDK projection of backend turn events
- explicit stop/cancel result for the same conversation and turn

Rendering inputs:

- durable display rows
- SDK presentation entries
- optimistic user message row
- message IDs used only to anchor the typing indicator

The rendering inputs may decide where and how to display content. They do not
decide whether the turn lifecycle is `local_pending`, `awaiting`, `active`,
`terminal`, or `idle`.

## Non-Authorities

The following fields may remain as compatibility, diagnostics, or derived UI
details, but they must not independently decide typing lifecycle:

- `isSending`
- `streamTracking.phase`
- `thinkingStatus`
- `presentation.typingVisible`
- `presentation.overlayVisible`
- `presentation.overlayIntent.mode`
- dashboard `hasLiveProgressMessages`
- durable message row shape
- display-row refresh timing

These values should either be derived from the renderer-owned visible turn
lifecycle or used only for rendering details after lifecycle has already been
resolved.

## Alternatives Considered

| Alternative | Reason not chosen now |
| --- | --- |
| Use raw SDK `currentTurnProjection` as the only source | SDK does not own renderer-local send acceptance, so it cannot represent the immediate `local_pending` state without changing SDK ownership. |
| Move `local_pending` into SDK | Cleaner for consumers long term, but it mixes renderer-local send acceptance into the SDK backend-event projection boundary. |
| Let each surface derive typing from existing fields | This is the current failure mode: dashboard, pill, overlay, and message rows can drift and flicker. |
| Use display rows as lifecycle authority | Display rows are rendering data and can refresh independently of turn lifecycle. |

## Consequences

- Add or designate a renderer app-runtime reducer for visible turn lifecycle.
- Route dashboard, chat pill, response overlay, Stop/busy controls, and typing
  indicators through that reducer.
- Align pending-turn clearing and pending-turn supersession behind one predicate
  for "SDK has authoritative same-turn replacement."
- Treat SDK `presentation` fields as derived SDK presentation data, not the
  final desktop lifecycle authority.
- Treat `isSending`, `streamTracking`, and `thinkingStatus` as derived,
  compatibility, diagnostic, or non-core display state.
- Do not allow SDK idle, stale, wrong-turn, or visible-but-empty projections to
  clear renderer `local_pending`.

## Regression Requirements

Core-loop UI bugs in this area should use replayable event tests. At minimum,
the regression pack must protect:

```text
user_send_accepted
pending_turn_created
sdk_current_turn_idle
sdk_current_turn_awaiting
assistant_delta
streaming_complete
```

The assertion is that desktop-visible lifecycle never flashes through `idle`
or clears typing between `local_pending` and authoritative same-turn SDK
handoff.

## Validation And Docs Impact

When implementing or changing this architecture:

- update [Core Loop Regression Pack](../debug/core_loop_regression_pack.md)
- update [User-Facing Regression Pack](../debug/user_facing_regression_pack.md)
- update [SDK Conversation Runtime](../sdk/conversation_runtime.md) when SDK
  projection fields or semantics change
- update dashboard/pill/overlay docs if their surface contracts change
- add focused renderer app-runtime tests for the lifecycle reducer
- run `<windie> test core-loop`

No migration is required for this ADR by itself. Implementation changes should
state whether persisted transcript, event payload, IPC, or SDK compatibility
changes require migration.
