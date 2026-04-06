---
summary: "Detailed renderer streaming and tool-execution runtime: event handling, correlation guards, bundle flow, capture policy, and backend result handoff."
read_when:
  - When changing tool-call event handling or bundle execution semantics.
  - When debugging stale-turn tool outputs, streaming phase transitions, or missing captures.
title: "Tool Execution and Streaming"
---

# Tool Execution and Streaming

## Stream Event Ingestion (`useChatStream`)

Module:

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/state/streamPhaseState.js`

Responsibilities:

- subscribes to backend event channel
- rejects events for inactive conversation references
- tracks stream lifecycle per turn (`awaiting-first-chunk`, `streaming`, tool phases, `complete`, `error`)
- centralizes stream/overlay phase predicates (`active`, `terminal`, awaiting/clear) so UI and guard logic share one contract
- updates chat message rows incrementally for chunk/tool/transparency events
- records assistant/tool transcript events with model context metadata

Handled backend event families:

- LLM thought events
- streaming text chunks + completion
- tool-call/tool-bundle/tool-output events
- system prompt/tool schemas/user full/assistant full transparency events
- token count updates
- structured errors

## Tool Runner (`useToolRunner`)

Module:

- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerFailureContracts.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerResultContracts.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerBackendPayload.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerTracking.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerSurfaceExecution.ts`
- `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts`
- `frontend/src/renderer/infrastructure/services/CorrelationId.ts`
- `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts`
- `frontend/src/renderer/infrastructure/services/ToolResultEnvelope.ts`

Responsibilities:

- receives `tool-call` and `tool-bundle` events
- guards against stale-turn execution using `streamTracking.activeTurnRef`
- uses shared terminal phase predicate (`isTerminalStreamPhase`) for stale-turn cleanup/acceptance paths
- tracks correlation IDs to reject late/out-of-turn results via shared `toolRunnerTracking` helpers (track/untrack/acceptance/prune)
- drops late single-tool and bundle callbacks/backend payload sends when the active turn reaches terminal/stop-complete phases, preventing post-stop race writes
- builds and parses tool-result/tool-bundle-result envelopes through shared `ToolResultEnvelope` infrastructure primitives (via `toolRunnerResultContracts` + `toolRunnerBackendPayload`) so hook/runtime failure responses and backend send gating use one typed correlation contract
- resolves correlation IDs via shared normalization helper (`CorrelationId.resolveCorrelationId`) so whitespace-only ids cannot leak into cancellation/result paths
- uses shared `toolCorrelationIds` helpers for tool-call/tool-output/bundle correlation precedence so stream handlers and tool-runner message assembly share one normalization contract
- sends cancellation-failure payloads (`frontend_stale_turn_cancelled`) via shared `toolRunnerFailureContracts` envelopes when tool events arrive for closed turns
- sends surface-preparation failure envelopes from the same contract helper (`frontend_execution_surface_unavailable[:reason]`) so single-tool and bundle failure payloads stay synchronized
- routes bundle and single-tool surface lifecycle sequencing through shared `toolRunnerSurfaceExecution` (`track -> prepare -> execute -> restore`) so failure ordering stays aligned
- delegates all surface preparation/restore transitions to `SurfaceOrchestrator` (single source of truth)
- uses shared computer-use tool catalog (`ToolComputerUseCatalog`) so capture policy and surface mode resolution stay aligned
- catalog contract keeps renderer classification concrete:
  - interactive: `mouse_control`, `keyboard_control`, `scroll_control`, `click`, `type`, `scroll`
  - capture-only: `screenshot`, `switch_window`, `wait`
  - excludes unified `computer_use` wrapper from renderer-side mode/capture checks
- interactive computer-use execution no longer toggles overlay interactivity directly from the renderer; shared overlay phase in main process owns loop-wide click-through + `focusable=false`
- focus verification retries were removed from renderer-side tool execution prep; orchestrator prep is policy-only and no longer performs external-window restore attempts
- capture-only computer-use turns (`screenshot`, `switch_window`, `wait`) use orchestrator capture-visibility transitions (hide-before-capture, show-after, overlap-safe restore)
- when a computer-use tool starts while the dashboard is visible, renderer tool prep now hands execution ownership to the minimal chat pill first; the dashboard is hidden, the pill/response overlay surface is restored, and the rest of the tool turn runs exactly under the existing pill contract instead of keeping a dashboard-owned capture path
- applies the same handoff policy to bundles when bundled steps include interactive/capture-only computer-use actions
- forwards execution correlation IDs into auto-capture/screenshot lifecycles so capture transition logs and tool timing logs share deterministic ids (single tool: request id, bundle: deterministic step id)

## Surface Orchestrator

Module:

- `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/logging.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/loggingGate.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/surfaceVisibility.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/platform/surfaceVisibility/*`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/context.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/preparation.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/windowVisibility.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/reasons.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/types.ts` (`SURFACE_PHASE` constants)
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayLayoutMode.js`

Responsibilities:

- typed surface transition APIs for tool execution and screenshot capture paths
- centralized mode resolution (`none | interactive | screenshot`) for single tools and bundles
- shared active-surface collapse/restore helper used by both tool-execution and screenshot-capture lifecycles
- screenshot prep hides whichever WindieOS surface currently owns the capture when that surface participates in the active capture-collapse path (`chatbox`, `main-window`, or none); on current runtime this means Linux overlay capture and dashboard suppression paths, while macOS/Windows overlay windows stay visible and use phase-driven content protection instead of entering a capture-time hide/show cycle
- dashboard-originated computer-use execution no longer stays dashboard-owned after the first tool step; once handoff occurs, screenshot prep/restore always targets the pill surface (`chatbox`) and later tool/output waiting states keep using the pill response overlay/typing-indicator contract
- platform capture prep still routes through `platform/surfaceVisibility/*`; Linux owns the chat-pill hide/restore path with compositor settle, while Windows/macOS use a true no-op runtime and rely on phase-driven overlay content protection instead of capture-time hide/show behavior
- intentional post-tool waits are now owned by shared renderer capture policy (`ToolExecutionCapture` / `SystemStateCapture`) instead of platform surface-visibility runtimes, so the same delay contract applies on Windows, macOS, and Linux before screenshot/system-state capture
- automatic screenshot monitor selection is main-owned: renderer screenshot calls stay display-agnostic, while Electron main resolves the visible sender window's display first and falls back to the active query-origin display affinity for hidden-dashboard tool turns
- monitor-scoped screenshot args now include both target monitor bounds and full virtual desktop bounds; Windows/Linux sidecar capture may crop a single monitor out of an all-displays image, while macOS uses direct bounded capture to avoid Retina scaling drift
- manual chat-pill drag position is main-owned and reused by overlay helper reposition passes so screenshot/show/hide lifecycles cannot snap the pill back to its default centered location
- shared transition-context resolver helper (`context.ts`) for source/correlation-id normalization across tool and capture lifecycles
- capture focus prep now resolves as a no-op lifecycle marker; frontend no longer asks main process to restore/verify an external window before screenshot capture
- main-process `platform/screenshot_window_visibility/*` runtimes are now no-op for all OSes; Linux capture hide/show is owned entirely by the renderer orchestrator so screenshot execution has one collapse/restore path
- capture restore path also resolves source/correlation through the shared context helper so hide/show completion logs keep the same normalized contract as prepare/focus transitions
- shared `ToolSurfacePreparation` builder helper (`preparation.ts`) keeps the tool-lifecycle payload minimal (`canExecute`, `failureReason`, `surfaceToken`, `mode`, `correlationId`)
- shared main-window visibility probe helper (`windowVisibility.ts`) for screenshot-mode collapse decisions
- shared transition/failure reason constants (`reasons.ts`) so logged `reason` fields stay stable across tool/capture paths
- shared `SURFACE_PHASE` constants in `types.ts` to keep transition phase names consistent across all logs/branches
- response overlay layout mode helper centralizes `hidden/response/awaiting-typing` mode resolution so typing/awaiting frame sizing remains deterministic across tool/capture visibility cycles (`awaiting-typing` uses fixed `24px` frame height, `response` uses fixed `236px`)
- deterministic transition logs (`correlation_id`, retry attempt, before/after phase, terminal reason)
- explicit env-gated log policy via `loggingGate.shouldLogSurfaceTransitions()` (`production` and `test` suppress transition logs unless verbose override is enabled)
- fail-safe cleanup on both success and terminal failure paths; Linux chat-pill restore remains overlap-safe

## ToolExecutionService

Module:

- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/ToolResultEnvelope.ts`

Single tool flow:

1. invoke tool via IPC
2. run auto-capture policy (`ToolExecutionCapture`)
3. normalize screenshot attachments through `ScreenshotAttachmentPipeline`
4. retain inline screenshot as local/backend fallback when upload is unavailable
5. format tool output with system context
6. emit local UI result callbacks
7. send backend `tool-result` payload (with `screenshot_ref` when upload succeeds, otherwise inline `screenshot`, plus system-state metadata when applicable)

Bundle flow:

1. execute bundle through `ToolExecutionBundleRunner`
2. normalize per-step results
3. compute aggregate status (`success`, `partial_failure`, `failure`)
4. optional single post-bundle screenshot capture/upload
5. send `tool-bundle-result`

## Capture Policy

Computer-use tools trigger capture policy checks via `ensureAutoCapture`:

- default wait and screenshot behavior can vary by tool type
- the tool/runtime now applies one shared post-action delay before capture, then captures screenshot and system state through the same post-tool pipeline
- capture path can be skipped when tool already provides screenshot payload
- bundle execution captures at most once after the full bundle completes; explicit per-tool wait budgets are accumulated into that final post-bundle capture
- capture path accepts optional correlation id so orchestrator capture/focus transitions are directly joinable with tool request/bundle-step logs
- resulting screenshot may be uploaded as artifact reference for backend payloads

## Message Formatting and Payload Builders

Supporting modules:

- `MessageFormatter.ts`
- `toolExecution/BundleExecutionModel.ts`
- `ToolExecutionPayloads.ts`
- `ToolExecutionBackendPayload.ts`
- `ScreenshotAttachmentPipeline.ts`
- `screenshotMessageState.js`
- `SystemStateCapture.ts`
- `ArtifactUploader.ts`
- `ToolExecutionInvoker.ts`
- `ToolExecutionLogger.ts`

Responsibilities include:

- shaping `llm_content` payloads
- defining one canonical bundled-step UI/runtime shape in `BundleExecutionModel.ts` (`BundledToolResult`, bundle status, failure summary)
- attaching system-state fields used by backend prompt/runtime normalization
- producing stable single-tool payload shapes in `ToolExecutionPayloads.ts` while bundle UI/runtime modeling stays out of that payload-only module
- normalizing screenshot attachment state through `screenshotMessageState.js` so tool-runner rows, streamed tool-output rows, screenshot capture, and artifact-ref/url fallback all share the same inline-vs-remote attachment rules
- timing + logging instrumentation for tool runtime diagnostics
- screenshot timing diagnostics now split capture preparation into aggregate `prep` plus `hide IPC` and compositor `settle` substeps so screenshot latency can be attributed without guessing between the intentional wait, active-surface hide, and screenshot-tool runtime

## Contract with Backend

Outbound payload types from renderer/main:

- `tool-result`
- `tool-bundle-result`

These are consumed by backend handler stack and routed into session tool-result waiting storage for loop continuation.

## Related Docs

- [Tool Computer-Use Catalog, Surface Mode, and Capture Policy Reference](../renderer/infrastructure/tool_computer_use_catalog_surface_mode_and_capture_policy_reference.md)
