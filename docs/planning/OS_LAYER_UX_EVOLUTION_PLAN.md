---
summary: "Architecture-aligned plan to evolve WindieOS from chat surfaces into a trusted OS-layer experience (dynamic island, ghost actions, mission dock, trust dial, ambient context)."
read_when:
  - Planning the next UX layer beyond the current chatbox + response overlay.
  - Implementing trust/transparency UX for tool execution.
  - Sequencing OS-layer features without disrupting active development.
---

# WindieOS OS-Layer UX Evolution Plan

## Objective

Implement the five UX directions below using the current Electron + backend + Python sidecar architecture, with additive changes and low regression risk:

1. Shape-shifting Dynamic Island pill.
2. Ghost action previews and target highlights.
3. Background mission dock for long-running tasks.
4. Trust dial + approval friction system.
5. Ambient context indicators.

This plan assumes Stop/cancel semantics are part of the same UX surface.

## Current Execution Snapshot (2026-02-24)

Completed in code:

1. Response pane restyle above chat pill:
   - Single black pane with bright text.
   - Smooth dynamic height transition.
   - Top overflow affordance when scrolled above latest content.
2. Thinking stream presentation shift:
   - Tool-call JSON is no longer rendered in the response pane.
   - During awaiting/think phases, reasoning text is rendered as transparent scrolling text (no separate old thinking pill).
3. Tool-action ghost preview:
   - Fake cursor + click-region ripple + explanation bubble during `tool-call` phase.
4. Overlay phase wiring:
   - Backend `tool-call` events now drive overlay `tool-call` phase.
   - Backend `tool-output` events now return overlay to `awaiting-first-chunk` so typing/thinking resumes cleanly before next assistant chunk.
5. Ambient loop signal:
   - Chat pill now displays ambient glow while loop-active phases run (`awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`).

Still in progress:

1. Ghost preview geometry grounding from backend coordinates (`target_point` / `target_rect`) is not yet wired.
2. Mission dock / trust dial / approval threshold surfaces are not started.
3. Ambient active-window indicator is not started.

## Codebase Reality (Current Baseline)

### Overlay/window model today

- Main dashboard window and two overlay windows are managed in `frontend/src/main/index.cjs`.
- Pill input lives in `frontend/src/renderer/features/chat/components/ChatBox.jsx`.
- Response overlay lives in `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`.
- Overlay phase is driven by `response-overlay-phase` events emitted from `frontend/src/main/ipc.cjs`.

### Event and stream model today

- Stream/tool events arrive in renderer via `from-backend`.
- Event typing and parsing is centralized in `frontend/src/renderer/types/backendEvents.ts`.
- Streaming state tracking lives in `frontend/src/renderer/features/chat/hooks/useChatStream.ts` and `frontend/src/renderer/features/chat/stores/chatStore.ts`.
- Tool execution is front-end sidecar-driven via `frontend/src/renderer/features/chat/hooks/useToolRunner.ts` and `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`.

### Backend metadata and transparency hooks already available

- Backend emits `tool-call`, `tool-output`, `tool-bundle`, `streaming-response`, and `streaming-complete`.
- Tool call metadata already propagates through `backend/src/agent/tools/sending/sender.py` and `backend/src/api/processing/formatters/tool_call.py`.
- Coordinate normalization metadata is already attached during tool preparation in `backend/src/agent/tools/preparation/helpers/preparation_helper.py`.
- Context fields (`turn_ref`, `conversation_ref`) are attached in `backend/src/api/transport/envelope.py`.

### Sidecar and IPC constraints

- Sidecar RPC entrypoint is `frontend/src/main/python/local_backend.py`.
- Electron bridge to sidecar is `frontend/src/main/local_backend_bridge.cjs`.
- Renderer IPC channels are allowlisted in `frontend/src/preload.js`.

### Config constraints

- Frontend only syncs a strict field subset via `frontend/src/renderer/utils/configFilter.js`.
- Backend `update-settings` payload is schema-strict in `backend/src/api/schemas/incoming.py`.
- New UX-only settings must remain local-only unless backend settings schema is extended.

## Design Principles

1. Additive first: no hard rewrites of current chat flow in early phases.
2. Trust over novelty: every autonomous action must be legible before and during execution.
3. Turn-correlation strictness: all UI state must be keyed by `turn_ref`/`request_id`.
4. Stop is always available during active work.
5. Feature flags for staged rollout to avoid blocking current development velocity.

## Phased Delivery Plan

## Phase 1: Dynamic Island Foundation (No Protocol Breaks)

Goal: Make current pill + response behavior feel like one kinetic object without removing existing windows yet.

Target files:

- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/index.cjs`

Implementation:

1. Introduce overlay FSM states in renderer: `idle`, `listening`, `capturing`, `thinking`, `acting`, `complete`, `error`, `stopping`.
2. Drive states from existing signals:
   - stream phases from `streamTracking.phase`
   - wakeword toggles/events
   - screenshot capture custom event `windie:screenshot-capture` from `frontend/src/renderer/infrastructure/services/SystemCapture.ts`
3. Keep current two-window structure initially, but style transitions so the pill and response feel contiguous.
4. Add Stop affordance into this state machine and route to cancel path from stop-button plan.

Acceptance:

- No behavior change for query execution when new visuals are disabled.
- Overlay still respects click-through and focus semantics.

## Phase 2: Ghost Actions + Visual Trust Layer

Goal: Show where and what the agent is about to act on.

Target files:

- `backend/src/agent/tools/preparation/helpers/preparation_helper.py`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/api/processing/formatters/tool_call.py`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/main/index.cjs` (new transparent HUD window optional)
- `frontend/src/preload.js` (new IPC channels if needed)

Implementation:

1. Extend `tool-call` metadata with preview geometry fields when available:
   - `target_point` (x,y)
   - `target_rect` (x,y,width,height) when OCR/prediction can provide region
   - `action_kind` (`click`, `double_click`, `type`, `scroll`, etc.)
2. Render short-lived visual previews:
   - pulse/bounding box before action
   - action trail indicator for pointer-driving actions
3. Degrade gracefully:
   - if no rectangle metadata, show point pulse only.
4. Keep previews tied to `request_id` and clear on completion/cancel.

Acceptance:

- Users can see impending target/action for mouse-driven tool calls.
- Late/out-of-turn previews are dropped.

## Phase 3: Background Mission Dock

Goal: Let users monitor long tasks outside the chat transcript.

Target files:

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts` or new `missionStore.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx` (mini mission chip)

Implementation:

1. Build mission model keyed by `turn_ref`:
   - step created on `tool-call` or `tool-bundle`
   - step completes/fails on corresponding `tool-output`
2. Infer checklist labels from tool name + parameters.
3. Show docked mission widget with statuses:
   - queued, running, done, failed, cancelled
4. Clicking a step jumps to associated transcript/tool output.

Acceptance:

- Long tool sequences are visible as a progress list without blocking next user interaction.

## Phase 4: Trust Dial + Approval Threshold

Goal: User-controlled friction for risky actions.

Target files:

- `backend/src/api/contracts/message_types.py`
- `backend/src/api/schemas/incoming.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/core/container/incoming_routing.py`
- `backend/src/core/container/api_container.py`
- `backend/src/agent/tools/*` orchestration path
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `frontend/src/renderer/features/chat/components/*` approval prompt UI

Protocol additions:

- Outgoing `tool-approval-required`:
  - `request_id`, `turn_ref`, `tool_name`, `risk_level`, `summary`, `preview`
- Incoming `tool-approval-response`:
  - `request_id`, `approved`, `scope` (`once` | `turn` | `workspace`)

Implementation:

1. Add a backend approval gate before dispatching selected tool calls.
2. Classify risk by tool category and parameters.
3. Pause tool dispatch until approval response or timeout.
4. Persist user friction preference locally first (do not send unknown config fields through current `update-settings` path).

Acceptance:

- Read-only actions pass immediately at low threshold.
- High-risk actions require explicit approval prompt and are auditable in transcript.

## Phase 5: Ambient Context Indicators

Goal: Subtly show that WindieOS has current OS context.

Target files:

- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/main/local_backend_bridge.cjs` (if subscription/poll helper added)
- `frontend/src/main/python/core/system_state.py`

Implementation:

1. Surface active app/window indicator in pill/header.
2. Start with low-frequency polling via existing `get-system-state`.
3. Map active window title to icon badge heuristically.
4. Fall back to `user-message-full.metadata.active_window` when live polling unavailable.

Acceptance:

- Context indicator updates while overlay/main view is active without noticeable performance impact.

## Cross-Cutting Dependency: Stop/Cancel

This UX plan should not ship without a validated stop-path contract across frontend, backend, and sidecar.

Required integration points:

1. Mission dock and ghost overlays must immediately clear or mark canceled on `turn-cancelled`.
2. Dynamic island state machine must transition to `stopping` then `idle`.
3. Approval dialogs must close deterministically on cancellation.

## Protocol and Type System Changes (Expected)

Frontend:

- Extend `BackendEventType` in `frontend/src/renderer/types/backendEvents.ts`.
- Add new UI event handlers in `useChatStream` and possibly a dedicated `useAgentUxEvents` hook.

Backend:

- Extend canonical constants and schemas in:
  - `backend/src/api/contracts/message_types.py`
  - `backend/src/api/contracts/registry.py`
  - `backend/src/api/schemas/incoming.py`
  - `backend/src/api/schemas/outgoing.py`
  - `backend/src/core/container/incoming_routing.py`

IPC/Preload:

- Any new renderer/main channels must be allowlisted in `frontend/src/preload.js`.

## Testing Strategy

Frontend:

1. State-machine tests for dynamic island transitions.
2. Mission step lifecycle tests from tool-call/tool-output event sequences.
3. Ghost overlay rendering tests with malformed/missing metadata.
4. Approval prompt flow tests.
5. Cancel/stop interaction tests.

Backend:

1. Schema and route-table alignment tests for new message types.
2. Approval gate behavior tests (approved, denied, timeout).
3. Event payload contract tests for geometry/trust metadata.

Sidecar/Main:

1. IPC contract tests for any new channels.
2. System-state polling/subscription tests for ambient indicators.

## Rollout and Safety

1. Gate each phase behind local feature flags.
2. Default flags to off in production profile until validated.
3. Keep transcript-based fallback UI intact during rollout.
4. Avoid branch-wide refactors; implement per-phase, file-local changes.

## Definition of Done

1. Pill/overlay experience feels like one continuous OS-layer interaction.
2. Tool actions are visually legible before execution.
3. Long tasks are visible as mission progress outside chat log.
4. Risky actions respect user-selected approval friction.
5. Ambient context is visible and stable.
6. Stop/cancel remains immediate and reliable across all new UX surfaces.
