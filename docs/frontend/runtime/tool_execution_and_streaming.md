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
- `frontend/src/renderer/features/chat/utils/streamPhaseState.js`

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
- `frontend/src/renderer/features/chat/utils/toolRunnerFailureContracts.ts`
- `frontend/src/renderer/features/chat/utils/toolRunnerResultContracts.ts`
- `frontend/src/renderer/features/chat/utils/toolRunnerBackendPayload.ts`
- `frontend/src/renderer/features/chat/utils/toolRunnerTracking.ts`
- `frontend/src/renderer/features/chat/utils/toolRunnerSurfaceExecution.ts`
- `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts`
- `frontend/src/renderer/infrastructure/services/CorrelationId.ts`
- `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts`
- `frontend/src/renderer/infrastructure/services/ToolResultEnvelope.ts`

Responsibilities:

- receives `tool-call` and `tool-bundle` events
- guards against stale-turn execution using `streamTracking.activeTurnRef`
- uses shared terminal phase predicate (`isTerminalStreamPhase`) for stale-turn cleanup/acceptance paths
- tracks correlation IDs to reject late/out-of-turn results via shared `toolRunnerTracking` helpers (track/untrack/acceptance/prune)
- builds and parses tool-result/tool-bundle-result envelopes through shared `ToolResultEnvelope` infrastructure primitives (via `toolRunnerResultContracts` + `toolRunnerBackendPayload`) so hook/runtime failure responses and backend send gating use one typed correlation contract
- resolves correlation IDs via shared normalization helper (`CorrelationId.resolveCorrelationId`) so whitespace-only ids cannot leak into cancellation/result paths
- uses shared `toolCorrelationIds` helpers for tool-call/tool-output/bundle correlation precedence so stream handlers and tool-runner message assembly share one normalization contract
- sends cancellation-failure payloads (`frontend_stale_turn_cancelled`) via shared `toolRunnerFailureContracts` envelopes when tool events arrive for closed turns
- sends surface-preparation failure envelopes from the same contract helper (`frontend_execution_surface_unavailable[:reason]`) so single-tool and bundle failure payloads stay synchronized
- routes bundle and single-tool surface lifecycle sequencing through shared `toolRunnerSurfaceExecution` (`track -> prepare -> execute -> restore`) so failure ordering stays aligned
- delegates all surface preparation/restore transitions to `SurfaceOrchestrator` (single source of truth)
- uses shared computer-use tool catalog (`ToolComputerUseCatalog`) so capture policy and surface mode resolution stay aligned
- interactive computer-use click-through (`set-overlay-ignore-mouse(true)`) is enabled only inside orchestrator-managed execution windows and reference-count restored after completion
- focus verification retries and bounded exhaustion are orchestrator-owned (`maxAttempts`, `waitMs`) and fail closed with explicit terminal reasons
- capture-only computer-use turns (`screenshot`, `switch_tab`, `wait`) use orchestrator capture-visibility transitions (hide-before-capture, show-after, overlap-safe restore)
- applies the same handoff policy to bundles when bundled steps include interactive/capture-only computer-use actions
- forwards execution correlation IDs into auto-capture/screenshot lifecycles so capture transition logs and tool timing logs share deterministic ids (single tool: request id, bundle: deterministic step id)

## Surface Orchestrator

Module:

- `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/logging.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/loggingGate.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/chatPillVisibility.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/context.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/preparation.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/focusPreparation.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/windowVisibility.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/reasons.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/types.ts` (`SURFACE_PHASE` constants)

Responsibilities:

- typed surface transition APIs for tool execution and screenshot capture paths
- centralized mode resolution (`none | interactive | screenshot`) for single tools and bundles
- shared chat-pill visibility collapse/restore helper used by both tool-execution and screenshot-capture lifecycles
- shared transition-context and focus-default resolver helper (`context.ts`) for source/correlation-id/wait-attempt defaults across tool and capture lifecycles
- shared overlay-focus IPC normalization helper (`focusPreparation.ts`) reused by both tool and capture lifecycles so focus verification metadata and failure-reason parsing stay aligned
- capture restore path also resolves source/correlation through the shared context helper so hide/show completion logs keep the same normalized contract as prepare/focus transitions
- shared `ToolSurfacePreparation` builder helper (`preparation.ts`) to keep ready/failure payload shapes stable across tool-lifecycle branches
- shared main-window visibility probe helper (`windowVisibility.ts`) for screenshot-mode collapse decisions
- shared transition/failure reason constants (`reasons.ts`) so logged `reason` fields stay stable across tool/capture paths
- shared `SURFACE_PHASE` constants in `types.ts` to keep transition phase names consistent across all logs/branches
- deterministic transition logs (`correlation_id`, retry attempt, before/after phase, terminal reason)
- explicit dev/prod log gating via `loggingGate.shouldLogSurfaceTransitions()` (production suppresses transition logs unless verbose override is enabled)
- bounded focus-prepare retries and fail-safe cleanup on both success and terminal failure paths

## ToolExecutionService

Module:

- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/ToolResultEnvelope.ts`

Single tool flow:

1. invoke tool via IPC
2. run auto-capture policy (`ToolExecutionCapture`)
3. optional screenshot artifact upload
4. format tool output with system context
5. emit local UI result callbacks
6. send backend `tool-result` payload (with screenshot/system-state metadata when applicable)

Bundle flow:

1. execute bundle through `ToolExecutionBundleRunner`
2. normalize per-step results
3. compute aggregate status (`success`, `partial_failure`, `failure`)
4. optional single post-bundle screenshot capture/upload
5. send `tool-bundle-result`

## Capture Policy

Computer-use tools trigger capture policy checks via `ensureAutoCapture`:

- default wait and screenshot behavior can vary by tool type
- capture path can be skipped when tool already provides screenshot payload
- capture path accepts optional correlation id so orchestrator capture/focus transitions are directly joinable with tool request/bundle-step logs
- resulting screenshot may be uploaded as artifact reference for backend payloads

## Message Formatting and Payload Builders

Supporting modules:

- `MessageFormatter.ts`
- `ToolExecutionPayloads.ts`
- `ArtifactUploader.ts`
- `ToolExecutionInvoker.ts`
- `ToolExecutionLogger.ts`

Responsibilities include:

- shaping `llm_content` payloads
- attaching system-state fields used by backend prompt/runtime normalization
- producing stable bundle/single output payload shapes
- timing + logging instrumentation for tool runtime diagnostics

## Contract with Backend

Outbound payload types from renderer/main:

- `tool-result`
- `tool-bundle-result`

These are consumed by backend handler stack and routed into session tool-result waiting storage for loop continuation.
