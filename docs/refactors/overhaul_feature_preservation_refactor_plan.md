---
summary: "Feature-preserving refactor plan for the WindieOS overhaul surface: OS-layer pill, dashboard, multi-chat, replay, memory, voice, tools, providers, permissions, SDK extensibility, and VM runs."
read_when:
  - When planning refactors that must preserve the OS-layer minimal chat pill, dashboard parity, multi-chat, replay/rehydrate, compaction, memory, voice, tools, providers, permissions, SDK extensibility, or VM run control.
  - When deciding whether cleanup is removing duplicate authority or accidentally deleting a product feature.
title: "Overhaul Feature Preservation Refactor Plan"
---

# Overhaul Feature Preservation Refactor Plan

WindieOS should keep its overhaul feature set while deleting duplicated runtime
authority. This plan is grounded in the current code and docs as of this audit.
It does not replace [Runtime Ownership Simplification Plan](runtime_ownership_simplification_plan.md)
or [Remaining Architecture Refactor Plan](remaining_architecture_refactor_plan.md);
it adds the product-feature guardrails those plans need.

## Features That Must Survive

- OS-layer minimal chat pill that participates in the same backend query/tool
  loop as the dashboard while leaving the user's other windows visible.
- Dashboard chat with full transcript, tool logs, settings, memory, model
  controls, screenshots, replay, retry, and edit/resend.
- Shared pill/dashboard runtime: one conversation identity model, one stream
  projection model, one tool-result path, one transcript/replay system.
- Multi-chat through durable `conversation_ref`, dashboard list/search/resume,
  backend rehydrate, and per-conversation active-turn projections.
- Multiple concurrent conversations where backend per-session locking preserves
  one active turn per session while the active-query tracker allows distinct
  conversations up to configured user/global caps.
- History replay, backend rehydrate, and history compaction with replay-safe
  replacement history.
- Persistent sidecar memory: transcript rows, episodic memory, semantic memory,
  titles, search indexes, FAISS/vector retrieval, and semanticization.
- Computer-use, browser-use, filesystem, shell/process, artifact/screenshot,
  OCR/vision grounding, web search, provider routing, voice wakeword, STT, TTS,
  permissions, SDK runtime, plugin/tool/skill/MCP extensibility, and VM run
  control.

## Current Code Signals

- `frontend/src/renderer/features/chat/components/ChatBox.jsx` and
  `frontend/src/renderer/features/chat/components/ChatInterface.jsx` both own
  chat-surface controls such as speech mode, manual compaction, send/stop
  gating, workspace/model-adjacent state, and current-turn presentation wiring.
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts` still
  performs many jobs: conversation/session resolution, workspace binding,
  attachment/file preparation, screenshot artifact capture, optimistic UI write,
  transcript persistence, deferred model sync, response-overlay priming,
  chatbox handoff, query dispatch, and failure row insertion.
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
  now correctly separates replay preparation from final live-turn dispatch, but
  it still duplicates several send-time concepts from `useChatMessageSender`.
- `frontend/src/renderer/features/chat/stores/chatStore.ts` keeps both
  per-conversation workspace state and mirrored top-level active workspace
  fields. That supports the current UI, but it is a drift risk for multi-chat
  parity.
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts` directly owns
  the transcription websocket, reconnect policy, microphone capture, provider
  protocol handling, and text-region callbacks. `DesktopVoiceRuntimeClient`
  only forwards wakeword detection.
- `frontend/src/main/python/memory/local_store.py` is a 2200+ line store class
  that owns database/index initialization, embedding-space alignment, add,
  search, update, delete, stats, chat events, conversation list/search/revision,
  title generation, semantic/episodic list/delete, clear operations,
  semanticization windows, and watermark access.
- `frontend/src/main/ipc.cjs` and `frontend/src/main/local_backend_bridge.cjs`
  are much smaller than before but remain large composition surfaces. The
  existing plans already track IPC and local bridge cleanup; do not re-expand
  them while adding new features.
- `frontend/src/shared/permissions/permission_manifest.json` lists the local
  authority features that must stay explicit: screen capture, input control,
  macOS automation, microphone, workspace access, shell execution, and browser
  automation.

## Refactor Checklist

- [x] Create a shared chat-surface controller for pill and dashboard.

  Issue: The minimal pill and dashboard intentionally share the same runtime,
  but their components still duplicate controls and policy checks. This makes
  it easy for speech mode, compaction, send gating, screenshot defaults, or
  response-overlay behavior to diverge.

  Implement: Extract a shared surface-control hook or runtime adapter that
  returns the commands both surfaces need: send availability, stop availability,
  speech toggle, screenshot toggle, manual compaction command, current-turn
  busy state, and active conversation context. Keep layout and OS-window
  behavior in each surface.

  Preserve: The pill must remain always-on-top, click-through or non-focusable
  during active loops where appropriate, and able to operate while other OS
  windows remain visible. The dashboard must keep full transcript and settings
  controls.

  Success criteria: Changing speech mode, compaction dispatch, send gating, or
  current-turn busy behavior requires one shared runtime change plus surface
  rendering tests, not separate pill and dashboard logic edits.

  Validation: `ChatBoxOverlayMouseIgnore`, `ChatBoxResponse.state`,
  `ChatInterfaceWiring`, `ResponseOverlayViewContract`, and a new shared
  chat-surface controller test.

  Completed: `useChatSurfaceController` now owns the shared surface contract
  for current-turn busy/stop state, speech and query-screenshot toggles, and
  manual compaction dispatch. `ChatBox` and `ChatInterface` keep their separate
  rendering and OS/window behavior but no longer duplicate those runtime
  controls.

- [x] Split renderer send preparation from final live-turn dispatch.

  Issue: `useChatMessageSender.ts` owns too many steps for a hook. It is still
  the place where conversation identity, workspace binding, attachments,
  screenshot artifacts, transcript writes, model sync, chatbox surface handoff,
  and backend send errors meet.

  Implement: Move send preparation into a typed desktop send-preparation
  runtime. The hook should collect UI input and call the runtime. The runtime
  should return a prepared turn with conversation ref, workspace binding,
  transcript write result, attachment context, artifact refs, capture metadata,
  deferred model selection, and final live-turn input.

  Preserve: Composer send, overlay send, first-message screenshot capture,
  readable-file attachment failures, artifact refs, transcript persistence,
  query-time model sync, and response-overlay priming.

  Success criteria: `useChatMessageSender.ts` becomes a thin UI adapter, and
  retry/edit-resend can reuse the same prepared-turn shape without duplicating
  send semantics.

  Validation: `ChatMessageSender`, `DesktopLiveTurnRuntimeClient`,
  `QueryScreenshotPipeline`, `ReadableFileAttachmentContext`,
  `UserTranscriptPersistence`, replay-send tests, and typed query contract
  tests.

  Completed: `desktopChatSendPreparation.ts` now owns composer send
  preparation and returns a `PreparedDesktopChatTurn` for final dispatch. The
  hook remains the React adapter for chat-store actions and playback cleanup,
  while the helper owns conversation/session resolution, workspace binding,
  readable attachment context, optimistic user rows, screenshot artifact
  resolution, transcript-write inputs, deferred model selection, and the final
  live-turn dispatch payload.

- [x] Collapse replay send and normal send onto one prepared-turn contract.

  Issue: The replay convergence work split preparation from dispatch, but
  replay still constructs its own rewrite payload, screenshot payload, model
  selection, workspace path, and failure classification.

  Implement: Let continuity preparation produce the same prepared-turn contract
  as composer preparation, with explicit flags for "transcript already written"
  and "rehydrate already completed". The live-turn runtime should only dispatch
  that contract.

  Preserve: Edit/resend, try-again, replay-safe transcript rewrites, backend
  rehydrate before sampling, and step-specific replay errors.

  Success criteria: Normal sends, retry, and edit/resend call the same final
  dispatch function with the same typed input shape.

  Validation: `ConversationReplayActions`, `DesktopConversationContinuityService`,
  `DesktopLiveTurnRuntimeClient`, backend rehydrate tests, and dashboard replay
  tests.

  Completed: retry and edit/resend replay actions now adapt continuity
  preparation results into the same `PreparedDesktopChatTurn` dispatch helper
  used by composer sends. Replay marks the transcript user projection as
  already prepared, preserving rewrite/rehydrate ownership while sharing the
  final live-turn dispatch shape for model selection, screenshots, workspace
  path, and turn refs.

- [ ] Make multi-chat state authoritative in one session service.

  Issue: The store has per-conversation workspaces and top-level mirrored state.
  That is pragmatic for React rendering but risky for simultaneous chats and
  stale-event filtering if feature code mutates the mirror directly.

  Implement: Keep `chatStore` as a display cache, but make a desktop
  conversation session service the only mutator for active conversation,
  per-conversation current-turn projection, local workspace binding, and
  inference hydration state. Add guard tests that forbid feature code from
  directly mutating active conversation state outside the service and store
  implementation.

  Preserve: Dashboard resume, new chat, chat pill send, stop-query routing by
  conversation, late-event quarantine, and per-conversation current-turn
  projections.

  Success criteria: Switching chats during an active turn cannot move live
  assistant text or tool rows into the wrong thread; multiple active
  conversations remain separately projectable.

  Validation: `ConversationSessionRuntime`, `ChatSessionBootstrap`,
  `DesktopChatStreamIngressRuntime`, `ChatStore`, active-query backend tests,
  and stale-turn frontend tests.

- [ ] Promote voice/STT/TTS to a real desktop voice runtime.

  Issue: Voice dictation currently lives mostly in `useVoiceMode.ts`, while
  wakeword detection and TTS playback sit on different bridges. The docs
  correctly distinguish wakeword, dictation, and TTS, but the renderer code does
  not expose one coherent desktop voice runtime.

  Implement: Add a `DesktopVoiceRuntimeClient` surface for dictation sessions,
  transcription websocket lifecycle, microphone permission/readiness state,
  wakeword-triggered dictation, TTS playback enablement, and stop/new-turn audio
  cleanup. Keep wakeword audio on the Electron/sidecar subprocess channel and
  STT on `/ws/transcription`.

  Preserve: Wakeword, STT dictation, TTS audio chunks, OpenAI/Nova-compatible
  transcription protocol, reconnect behavior, and composer transcription-region
  updates.

  Success criteria: Chat components do not construct transcription websocket
  sessions directly. They subscribe to a voice runtime state and issue voice
  commands.

  Validation: voice hook tests, wakeword bridge tests, backend transcription
  route/service tests, TTS playback cleanup tests, and permission-state tests.

- [ ] Split `LocalMemoryStore` into storage, vector, retrieval, chat-event, and
  title/semanticization services.

  Issue: `LocalMemoryStore` is the single biggest local-authority class and
  spans too many concerns. It is easy to break transcript persistence while
  changing search, or break semanticization while changing chat-event replay.

  Implement: Keep `LocalMemoryStore` as the compatibility facade, but move
  implementation into focused collaborators: database/index bootstrap,
  vector-mapping and embedding-space alignment, memory add/update/delete,
  retrieval/search with transcript pairing, chat-event conversation store,
  conversation metadata/list/search, title generation, and semanticization
  window/watermark services.

  Preserve: SQLite migrations, FAISS corruption recovery, skip-embedding rules,
  episodic/semantic routing, chat_events append order, compacted replay
  replacement, conversation titles, memory deletion cleanup, semanticization,
  and non-fatal remote embedding/semantic failures.

  Success criteria: Each memory subsystem can be tested without constructing
  unrelated title, search, semanticization, and chat-event behavior.

  Validation: `tests/sidecar/test_chat_event_store.py`,
  `test_local_store_delete_cleanup.py`, `test_local_store_search_pairing.py`,
  conversation list/search/title tests, memory operations tests, and
  semanticization tests.

- [ ] Finish the local backend bridge split without changing the wire protocol.

  Issue: The remaining architecture plan already marks this as pending.
  `local_backend_bridge.cjs` still coordinates local backend lifecycle, daemon
  fallback, execute-tool wiring, bridge status, and handler exports.

  Implement: Finish extracting process supervision, JSON-RPC transport,
  sidecar daemon client selection, status broadcasting, and local tool host
  adapter behavior. Keep one RPC mapper registry for field aliases.

  Preserve: Legacy JSON-RPC fallback, daemon `/execute-tool`, sidecar event
  subscriptions, status updates, screenshot artifact bridge integration, and
  extension/plugin tool execution.

  Success criteria: Sidecar startup failures, RPC failures, execute-tool
  failures, and status broadcasts have focused unit tests and do not require a
  full bridge fixture.

  Validation: `LocalBackendBridge.lifecycle`, `LocalBackendBridge.rpc`,
  `LocalBackendRpcTransport`, `LocalBackendStatusBroadcaster`,
  `LocalBackendBridgeExtensionRuntime`, `SidecarDaemonManager`, and sidecar
  daemon tests.

- [ ] Give artifacts and screenshots one desktop capture contract.

  Issue: Query screenshots, clipboard images, tool-output screenshots,
  browser screenshots, and artifact fetches all need durable refs, but their
  capture/upload/normalization code is spread across renderer services, main
  bridge helpers, sidecar tool outputs, and backend artifact routes.

  Implement: Define a desktop artifact contract with one normalized attachment
  shape for query input, replay display, tool output, and backend rehydrate.
  Keep capture owners where they belong: renderer/main for user/query capture,
  sidecar for tool capture, backend for artifact storage and serving.

  Preserve: `screenshot_ref`, `screenshot_url`, multi-screenshot refs,
  replay-safe image display, tool post-action screenshots, browser screenshots,
  and hosted install-auth artifact fetches.

  Success criteria: A screenshot attachment has the same durable identity and
  display metadata whether it came from the composer, a computer tool, browser
  tool, or replayed transcript.

  Validation: artifact uploader tests, screenshot pipeline tests,
  tool screenshot tests, rehydrate payload tests, sidecar screenshot/browser
  tests, and backend artifact route tests.

- [ ] Centralize model/provider selection outside chat presentation.

  Issue: `ChatInterface.jsx` still computes provider/model/reasoning options
  and writes config directly, while Settings also owns model/provider UI. The
  backend owns effective provider policy and the SDK/settings runtime owns
  model updates.

  Implement: Move option derivation and selection commands into a shared model
  selection runtime used by dashboard chat header and settings. Renderer
  components should render options and invoke commands, not decide provider
  fallback rules.

  Preserve: online/local mode, provider selection, reasoning-mode variants,
  model catalog display, query-time model sync, and backend settings updates.

  Success criteria: Adding or removing a provider/model changes one model
  selection runtime and model catalog tests, not chat header and settings logic
  independently.

  Validation: `DesktopSettingsRuntimeClient`, `ModelsSection`,
  `ChatInterfaceHeaderControls`, model option utility tests, provider backend
  tests, and settings sync tests.

- [ ] Keep browser-use as a grouped capability while isolating adapter debt.

  Issue: The single `browser` tool intentionally exposes many sub-actions.
  Refactors must not split it into inconsistent sidecar/backend action sets or
  let Browser Use implementation details leak into backend policy.

  Implement: Keep the shared browser action contract as the one action-surface
  authority, and split adapter concerns into validation, daemon/session
  lifecycle, action dispatch, result normalization, screenshots/files, and
  renderer browser-session controls.

  Preserve: Dedicated Windie browser profile, 30-action generated manifest,
  tab carousel behavior, Browser Use runtime ownership of browser mechanics,
  backend policy gates, and sidecar execution.

  Success criteria: Adding a browser action updates one shared action catalog,
  backend/sidecar parity tests, and adapter handling without touching unrelated
  chat or tool code.

  Validation: backend browser schema tests, sidecar browser parity/adapter
  tests, browser session UI tests, and manifest generation tests.

- [ ] Keep permissions as enforced local authority, not UI state.

  Issue: Permission UI, settings, main-process probes, sidecar tool failures,
  and backend tool visibility all touch capability availability. Refactors can
  accidentally treat a clicked button or config flag as a granted local
  authority.

  Implement: Keep the permission manifest as the display catalog, Electron main
  permission services as probe/request owner, sidecar/platform adapters as
  privileged-operation truth, and backend policy as model-visible narrowing.
  Add a capability status runtime that reports these states without granting
  authority from renderer state alone.

  Preserve: screen capture, input control, macOS automation, microphone,
  workspace file access, shell execution, browser automation, sudo/elevated
  mode, and platform-specific screenshot policies.

  Success criteria: UI can display "configured", "denied", "unavailable", and
  "runtime failed" distinctly, and local tools still fail clearly when OS
  authority is missing.

  Validation: permission manifest/store tests, main permission IPC/service
  tests, onboarding tests, sidecar platform tests, sudo tests, and tool-policy
  tests.

- [ ] Split VM run control into current in-memory runtime and future durable
  store boundary.

  Issue: VM run control is part of the feature set, but docs clearly say it is
  not a durable cron/webhook automation engine. Refactors should clarify this
  instead of making the in-memory service look like a scheduler.

  Implement: Keep the current run-control service as an in-memory control plane
  but define a narrow store interface for run metadata, event append/read,
  worker assignment, and pending controls. Do not implement cron/webhooks as
  part of this cleanup.

  Preserve: create/get/control/stop runs, worker polling, one queued run
  assignment, stream event relay, pause/resume/set-control-mode, stop-all, and
  normal websocket query dispatch through the Electron VM worker.

  Success criteria: Current VM run behavior stays unchanged, but future durable
  run storage has an explicit insertion point and cannot hijack desktop chat.

  Validation: runs route tests, VM run-control service tests, VM worker runtime
  tests, and automation docs listing.

- [ ] Create an overhaul regression matrix that maps each feature to tests.

  Issue: The feature list is now broad enough that code cleanup can pass local
  unit tests while deleting an intended product behavior.

  Implement: Add a docs/test matrix that maps every overhaul feature to the
  smallest focused tests and smoke checks that prove it still exists. Link the
  matrix from this plan and future reports.

  Preserve: All features listed in "Features That Must Survive".

  Success criteria: Every refactor touching chat, memory, tools, voice,
  providers, permissions, SDK, extensions, artifacts, or VM runs can name the
  focused feature-preservation tests it ran.

  Validation: `./bin/docs-list`, focused tests named by the changed feature,
  and `git diff --check`.

## Do Not Lose These Boundaries

- Do not make the minimal chat pill a separate agent runtime.
- Do not let dashboard replay become backend history without rehydrate
  normalization.
- Do not make renderer components execute tools or send backend tool results.
- Do not treat sidecar executable manifests as final provider-visible tool
  policy.
- Do not move local machine authority into the backend.
- Do not make wakeword audio, STT dictation, and TTS playback share one
  transport.
- Do not make VM runs the normal desktop chat transport.
- Do not remove browser, computer, filesystem, shell, memory, voice, provider,
  permission, SDK, extension, or artifact behavior as "cleanup" unless a
  replacement owner and tests land in the same change.

## Baseline Validation Commands

- `./bin/docs-list`
- `git diff --check`
- `cd frontend && npm run test -- ChatBoxOverlayMouseIgnore ChatBoxResponse ChatInterfaceWiring ConversationSessionRuntime DesktopChatStreamIngressRuntime --runInBand`
- `cd frontend && npm run test -- ChatMessageSender ConversationReplayActions DesktopLiveTurnRuntimeClient DesktopSettingsRuntimeClient --runInBand`
- `cd frontend && npm run test -- DesktopMemoryRuntimeClient RendererChatRuntimeBoundary IpcSdkToolRouter WindieSdkConversationRuntime --runInBand`
- `./scripts/python-in-env backend pytest tests/backend/test_session_manager.py tests/backend/test_api_handlers.py tests/backend/test_rehydrate_execution_service.py tests/backend/test_history_compaction_engine.py -q`
- `./scripts/python-in-env sidecar pytest tests/sidecar/test_chat_event_store.py tests/sidecar/test_local_store_delete_cleanup.py tests/sidecar/test_tool_manifest.py -q`
