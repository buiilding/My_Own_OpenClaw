---
summary: "Realtime ledger for the 2026-06-15 broad compatibility, legacy, old, and unused code deletion goal."
read_when:
  - When continuing or reviewing the 2026-06-15 codebase compatibility deletion goal.
  - When checking which cleanup slices were implemented, validated, committed, or intentionally deferred.
title: "Codebase Compatibility Deletion Report"
---

# Codebase Compatibility Deletion Report

Plan: [Codebase Compatibility Deletion Plan](2026-06-15-codebase-compatibility-deletion-plan.md)

Date: 2026-06-15

## Baseline

- Branch: `main`.
- Goal: remove compatibility, legacy, old, and unused code across the codebase.
- Existing active goal was already present for this thread.
- Prior cleanup context read:
  - `docs/development/agent_runtime_ownership_and_change_routing.md`
  - `pending/compaction_safe_plan_execution.md`
  - `docs/refactors/remaining_architecture_refactor_plan.md`
  - `docs/refactors/remaining_architecture_refactor_realtime_report.md`
  - `docs/plans/2026-06-14-25-commit-cleanup-campaign-plan.md`
  - `docs/plans/2026-06-14-25-commit-cleanup-campaign-report.md`
- `bin/windie docs list` passed during orientation.
- `git status --short` returned clean during orientation.

## Candidate Ledger

| ID | Owner | Suspected stale path | Evidence | Concept | Status |
| --- | --- | --- | --- | --- | --- |
| CD-001 | Frontend logging | Duplicate `frontend` branch in `resolveLayerLogFile(...)` | `envKeyForLayer('frontend')` already resolves `WINDIE_FRONTEND_LOG_FILE`, making the later `legacyConfigured` branch unreachable | Delete the duplicate branch; keep the current layer-owned env override | implemented |
| CD-002 | Backend API events | Live `trace_event` stream event spelling in VM run control and transcription gateway | Outgoing trace event schema and `StreamingEventType.TRACE_EVENT` use `trace-event`; production grep found only these underscore emitters | Emit canonical `trace-event`, update focused tests, remove the underscore trace alias, and fix the transcription route dependency needed to validate the websocket path | implemented |
| CD-003 | Backend container | Handler registry source compatibility breadcrumb | `api_container.py` only retained a commented manual registration example for tests migrating away from manual registration; active docs now describe declarative bindings | Delete the stale comment so the current registry path is the only in-code guidance | implemented |
| CD-004 | Backend session stream | Raw dict `llm-thought` event in no-model-selected branch | `AgentSession.process_query` otherwise yields typed stream events; `ResponseFormatter` ignores dict events and formatter specs are typed/canonical | Replace raw dict with `ThinkingEvent` and tighten the return annotation | implemented |
| CD-005 | Backend stream event enum | Alias enum members `THINKING` and `CHUNK` | Repo search showed no production callers; the only test use should assert `STREAMING_RESPONSE`; legacy dict strings are still bounded to query extraction normalization | Remove enum aliases and update docs/tests to name canonical stream event members | implemented |
| CD-006 | Backend stream event serialization | Pydantic v1-style `.dict()` fallback in event value normalization | Current backend schemas are Pydantic v2 models with `model_dump()`; recursive schema serialization tests cover `model_dump()` payloads | Remove `.dict()` fallback and document supported payload object shapes | implemented |
| CD-007 | Backend prompts | Preserved deprecated/legacy system prompt snapshots | `PromptManager` only default-loads `system_prompt.txt`; repo search showed snapshot references only in docs/tests preserving old prompt text | Delete snapshot files and remove docs/tests that treat old prompt text as active package content | implemented |
| CD-008 | Backend stream event extraction | Core legacy stream-event alias table plus query extraction alias acceptance | Validation exposed that query extraction still imported the alias helper and accepted `chunk`/`assistant_message_full` spellings after CD-005 removed enum aliases | Delete the shared alias helper, make query extraction trim-only, and require canonical stream event literals | implemented |
| CD-009 | SDK/backend contract tests | `test_sdk_runtime_backend_compatibility.py` and `compat` fixture IDs for current SDK/backend payload validation | File inspection showed the test validates current SDK-emitted payloads against backend ingress schemas, not backward compatibility behavior | Rename the test and synthetic IDs to `contract`, and update active docs that route this validation command | implemented |
| CD-010 | Backend prompt construction | `PromptConstructor.build_prompt(...)` tuple-returning compatibility wrapper | Production grep showed only SDK prompt preview still used the tuple wrapper; tests could assert directly through `ProviderPrompt` | Move callers to `build_provider_prompt(...)`, delete the wrapper, and update prompt docs/tests to use the typed provider prompt contract | implemented |
| CD-011 | Frontend settings docs | Legacy settings display/config compatibility entrypoint page | Repo search showed only docs hubs linked to the redirect-style page, while current detailed settings docs live under `settings/sections` and `settings/config` | Delete the compatibility entrypoint and route docs hubs to the current settings docs directly | implemented |
| CD-012 | Backend API completion docs | Query execution helper doc filename/title still described compatibility event extraction | CD-008 made stream event extraction canonical-only; current helper doc now describes supported dict/object extraction and field resolution, not compatibility aliasing | Rename the doc and links to the current event-extraction contract terminology | implemented |
| CD-013 | Backend API package-split docs | Artifacts, embeddings, semantic memory, and websocket package-split reference filenames still carried compatibility/monkeypatch wording | The docs content already describes current package route seams and owner modules; the stale compatibility wording existed in filenames and link labels only | Rename the docs to current package-split/export contract names and update internal docs links | implemented |
| CD-014 | Backend vision InternVL provider | InternVL class-level compatibility wrappers around helper-module runtime functions | `internvl.py` kept forwarding methods only to bind model/tokenizer state, while tests monkeypatched those wrappers instead of the helper state-machine contracts | Delete the forwarding methods, call helper functions directly from prediction paths, and update tests/docs to target `internvl_runtime_helpers.py` | implemented |
| CD-015 | Browser tool docs | Browser schema/runtime docs still used compatibility filenames and labels after alias rejection became the active contract | Code/docs inspection showed `navigate` is canonical and browser removed-alias fields/actions are rejected by shared schema validation | Rename browser docs and links to current schema/runtime names, and describe browser-internal URL handling without compatibility-shim language | implemented |
| CD-016 | Backend rehydrate linkage | Synthetic tool-call ids, synthetic tool-call rows for orphan outputs, and synthetic missing tool-output rows | Current SDK transcript projection carries structured tool payloads and tool-call ids; the repair path kept incomplete or old transcript shapes alive | Rename the linkage helper away from repair terminology, require real tool-call ids and matched outputs, and fail rehydrate on incomplete linkage | implemented |
| CD-017 | Windie CLI docs command | `bin/windie docs open <topic>` compatibility alias | Current docs routing uses `docs search <query>` and shorthand `docs <query>`; only the command matrix and CLI help still advertised the old alias | Delete the alias branch and remove it from the first-class CLI command docs/help | implemented |
| CD-018 | Troubleshooting docs | Missing screenshot artifact section still referred to a "fallback fix" in rehydrate execution | Current behavior is a documented text-only continuation path for missing artifacts, not an old fix users need to hunt for | Replace stale fallback-fix wording with current rehydrate artifact-handling language | implemented |
| CD-019 | Backend tool-result router | Invalid `system_state_internal` payloads fell back to older `system_state` data | Current backend-owned runtime state uses `system_state_internal` as the explicit authoritative field when present; repairing invalid internal state from the older public result field preserved a duplicate source of truth | Treat `system_state_internal` as authoritative when present and ignore invalid internal state instead of falling back to `system_state` | implemented |
| CD-020 | Backend prompt construction | `PromptConstructor.format_user_message_content(...)` still built a raw `<user_query>` fallback from `query` when prepared `message_content` was missing | Query ingress already normalizes missing payload content into a plain user-query wrapper; retaining the same fallback in prompt construction kept duplicate model-visible content assembly alive | Remove the constructor fallback and `query` parameter, require prepared `message_content`, and make query input typing reflect that content is always prepared before prompt construction | implemented |
| CD-021 | Backend session initialization | `session.initializer` eagerly imported `AgentExecutor`, creating an execution/session import cycle during direct executor tests | The initializer only needs `AgentExecutor` inside `init_executor(...)`; module-level import couples session package import to execution graph assembly | Move the import inside `init_executor(...)` so session initialization stays lazy at the execution boundary | implemented |
| CD-022 | Renderer dashboard/transcript utilities | `episodicMemoryUtils.js` and `storedTranscriptChatMessageState.js` preserved unused transcript-memory parsing and rehydrate mapping helpers, including `User:`/`Assistant:` display splitting | Production callers now open conversations through SDK `chat_events`, SDK display projection, and the desktop continuity service; search found these exports were referenced only by their tests and stale docs | Delete the unused helpers and tests, and point docs at SDK projection/command-runtime owners | implemented |
| CD-023 | Frontend main shell harness | `frontend/src/main/app/test_shell.cjs` and `npm run test:shell` preserved a manual Chrome/shell smoke harness whose npm entry pointed at a non-existent path | Knip reported the harness as an unused file; docs said it was manual and stale, while current shell/process behavior is covered by sidecar and bridge tests | Delete the broken harness, remove the npm script, and route docs to current sidecar shell validation instead of the harness page | implemented |
| CD-024 | Renderer transcript projection | `desktopTranscriptProjectionRuntimeClient.ts`, `transcriptRecordWrite.ts`, `transcriptEntryPersistence.ts`, `infrastructure/transcript/pending/*`, and their pending/entry type exports preserved a renderer-owned queue/write path | Knip reported the projection runtime and entry persistence as unused files; source search found the writer/queues referenced only by their tests and stale docs, while current display/replay uses SDK `chat_events`, `DesktopConversationContinuityService`, `DesktopConversationLibraryClient`, `desktopConversationStore.ts`, and `sdkDisplayChatMessageProjection.ts` | Delete the orphan runtime, pending queues, type exports, tests, and queue docs; update current docs to route transcript/replay work to SDK continuity/store/display projection owners | implemented |
| CD-025 | Renderer desktop conversation store | Store-side transcript projection append/rewrite helpers, projection conversion types, and stored-transcript bridge utilities survived after deleting the renderer projection writer | Repo search showed `appendTranscriptProjectionEntry`, `rewriteTranscriptProjection`, projection conversion types, `CHAT_EVENT_RECORD_KIND`, `storedTranscriptSdkProjection.ts`, and `storedTranscriptMemoryState.js` were referenced only by tests and the store module itself | Delete the store-side projection helper exports, conversion functions, stored-transcript bridge utilities, dead constant, and tests that covered only that deleted surface | implemented |
| CD-026 | Renderer current-turn presentation | `chatBoxResponseState.js` and `messagePresentationPipeline.js` still exposed `buildCurrentTurnResponseOverlayEntries(...)` scanner helpers after response overlay rendering moved to direct SDK/current-turn presentation messages; deleting the scanner also orphaned `toolExplanationMessages.js` | Knip reported the wrapper and then the pipeline export unused; production overlay code now filters current-turn projection/presentation entries directly, while the scanner and explanation helper were covered only by stale tests/docs | Delete the wrapper, the unused pipeline scanner, the orphaned explanation helper, and scanner-only test assertions; keep current-turn projection and live-progress detection on their active paths | implemented |
| CD-027 | Renderer loop UI state | `streamPhaseState.js` still exported active-loop, terminal, first-chunk, and stop-control predicates after loop UI state kept only the overlay-awaiting predicate | Knip reported the unused predicate exports, and repo search showed only their own test imported them; production imports only `isOverlayAwaitingReplyPhase(...)` from this module | Delete the unused predicates and their tests; keep the awaiting-reply predicate used by `chatLoopUiState.js` | implemented |
| CD-028 | Renderer module export surface | `useMainWindowControls.js`, `useMessageListAutoScroll.js`, and `toolSchemaPropType.js` still carried default exports while all consumers use named imports | Knip reported the default exports unused, and repo search showed no default-import consumers | Delete the unused default exports and keep the named exports that production imports | implemented |
| CD-029 | Renderer selector and trace helpers | `selectChatBoxState(...)`, `logRendererStreamTrace(...)`, debug trace predicates, and `CHAT_PILL_SURFACE_REASON` remained exported after their production consumers moved to current live-turn/view-model paths or internal calls | Knip reported the exports unused; repo search showed `selectChatBoxState(...)` and `logRendererStreamTrace(...)` had no production consumers, while the remaining trace predicates/constants are internal implementation details | Delete the dead selector and stream trace function; make the still-used trace predicates and chat-pill reason constant private to their modules | implemented |
| CD-030 | Renderer message screenshot helpers | `resolveMessageScreenshotSrcList(...)` and `resolveMessageScreenshotSrc(...)` stayed exported after screenshot rendering moved to attachment normalization plus async artifact resolution | Knip reported both exports unused; repo search showed they were imported only by tests, while production uses `resolveMessageScreenshotAttachments(...)`, `resolveStaticScreenshotAttachmentSrc(...)`, and screenshot predicates | Delete the test-only source helpers and the dedicated first-source test; move useful assertions onto production-used attachment/static resolver APIs | implemented |
| CD-031 | Renderer resolved screenshot cache | `clearResolvedArtifactImageCache(...)` exported a cache reset solely for tests while production screenshot artifact resolution should own its cache internally | Knip reported the export unused; repo search showed only `MessageContent.test.jsx` imported it, and the tests already use unique artifact refs for cache-sensitive cases | Delete the test-only cache reset export and let tests exercise artifact resolution through normal component rendering | implemented |
| CD-032 | Renderer response-overlay phase payload parser | `responseOverlayPhasePayload.js` preserved a renderer parser for generic overlay phase IPC payloads, plus parser-only metadata/normalizer exports in `responseOverlayPhaseContract.js`, after React chat surfaces stopped subscribing to phase IPC for runtime state | Knip reported the parser and parser-dependent exports unused; repo search showed the parser file was imported only by its own test, while docs still incorrectly called it canonical | Delete the orphan parser, parser-only contract exports, and parser-only tests; update overlay docs to route phase payload validation to Electron main phase state/events and shared phase-contract parity | implemented |
| CD-033 | Renderer manual compaction helper | `waitForNextPaint(...)` stayed exported from `manualCompactionRuntime.js` even though only `runManualCompaction(...)` is imported by production and tests | Knip reported the helper export unused; repo search showed it is called only inside the manual compaction runtime, while docs still describe the paint wait as current runtime behavior | Make the helper private while preserving the pre-compaction paint wait inside `runManualCompaction(...)` | implemented |
| CD-034 | Renderer transcript payload helpers | `transcriptMessagePayload.js` preserved role/type/rehydrate helpers that no production code imported after transcript replay/display moved to SDK-backed renderer transcript infrastructure; its only live production export was `normalizeProvider(...)` for chat model options, and deleting it orphaned `rehydrateMessageState.js` plus `structuredToolPayload.js` | Knip reported the transcript helpers unused; repo search showed the rehydrate helpers were test/docs-only, while `normalizeProvider(...)` belongs with chat model option grouping/filtering | Move provider normalization into `chatModelOptions.js`; delete the stale transcript payload module, orphaned rehydrate/structured payload helpers, tests, and deep docs page; update docs to route transcript work to renderer transcript infrastructure | implemented |
| CD-035 | Renderer rehydrate payload helper file | `rehydratePayload.js` no longer built backend rehydrate payloads after SDK `buildRehydrateSnapshot(...)` and `ConversationContinuityService` became the active replay/rehydrate owner; production imported it only for a generic string normalizer used by tool-call display state | Knip reported every rehydrate helper export unused; repo search showed the helper file was kept alive only by `toolCallMessageState.js` importing `normalizeOptionalString(...)`, while its tests/docs still described it as the rehydrate payload builder | Move the string normalizer into `toolCallMessageState.js`; delete the obsolete helper file and test; update transcript/replay docs to route rehydrate payload construction to SDK projections and backend rehydrate services | implemented |
| CD-036 | Renderer transparency normalization helper | `transparencyNormalization.ts` stayed as a test-only renderer contract after transcript replay/rehydrate moved to chat-stream transparency capture, SDK projections, and backend rehydrate transparency resolution | Knip reported `normalizeTransparencyData(...)` unused; repo search showed only its test and stale deep docs referenced the module, with no production imports | Delete the orphan helper, test, and contract page; update transcript/incoming-text docs to route transparency behavior to active chat-stream, SDK projection, and backend rehydrate surfaces | implemented |
| CD-037 | Renderer tool-call metadata helper export | `normalizeToolCallDisplayMetadata(...)` was exported from `toolCallMessageState.js` even though tool-call metadata shaping is only used inside the same module by tool-call and bundle message builders | Knip reported the export unused; repo search showed no imports outside `toolCallMessageState.js`, while production consumes the higher-level message-state builders | Make the metadata normalizer private and keep existing tool-call/bundle message-state behavior unchanged | implemented |
| CD-038 | Renderer tool-schema shape helper exports | `isSupportedToolSchema(...)`, `normalizeToolSchema(...)`, and `isSupportedToolSchemaList(...)` were exported from `toolSchemaShape.ts` even though renderer production code imports only `normalizeToolSchemaList(...)` | Knip reported the helper exports unused; repo search showed the predicates/single-item normalizer are called only inside `toolSchemaShape.ts`, while chat-stream and message transparency consumers use the list normalizer | Make the predicate and single-schema helpers private, leaving `normalizeToolSchemaList(...)` as the module's public production API | implemented |
| CD-039 | Renderer screenshot message helper exports | `looksLikeInlineImageData(...)`, `parseInlineScreenshotPayload(...)`, and `resolveStoredTranscriptScreenshotValue(...)` remained exported from `screenshotMessageState.js` after screenshot rendering/replay moved to attachment-state APIs | Knip reported the exports unused; repo search showed inline parsing helpers are used only internally and `resolveStoredTranscriptScreenshotValue(...)` was imported only by its own test | Make inline parsing helpers private; delete the obsolete stored-transcript screenshot value helper and move the useful artifact-url assertion onto `resolveReplayScreenshotState(...)` | implemented |
| CD-040 | Renderer SDK display chat projection | `buildChatMessagesFromDisplayConversation(...)` was exported from the renderer projection module even though production imports only `buildChatMessagesFromSdkDisplayRows(...)` | Knip reported the display-conversation projector export unused; repo search showed the export was imported only by `SdkDisplayChatMessageProjection.test.ts`, while dashboard and chat runtime consumers project SDK display rows directly | Delete the public display-conversation projector surface, keep a private single-message projector inside the row path, and retarget tests to the active SDK display-row API | implemented |
| CD-041 | Renderer chat-stream tool formatting helpers | `formatToolCallPayload(...)`, `formatToolBundlePayload(...)`, `formatToolOutputText(...)`, and `resolveModelFacingToolCall(...)` remained exported from `chatStreamFormatting.ts` after tool display moved to transcript message-state builders; deleting them exposed `buildNormalizedToolCall(...)` as an internal-only normalizer | Knip reported the helper exports unused; repo search showed only `ChatStreamFormatting.test.ts` and stale docs referenced them, while production imports only `buildThinkingStatus(...)` from the module and uses the higher-level message-state builders for tool rows | Delete the unused tool-formatting exports and tests, make `buildNormalizedToolCall(...)` private, and update docs to route tool-call/bundle/output display to the active message-state projection builders | implemented |
| CD-042 | Renderer chat-stream screenshot attachment wrapper | `buildScreenshotAttachments(...)` was exported from `chatStreamEventUtils.ts` even though production imports only the single `buildScreenshotAttachment(...)` helper from that module | Knip reported the list-wrapper export unused; repo search showed it was imported only by `ChatStreamEventUtils.test.ts`, while list attachment normalization is owned by `screenshotMessageState` | Delete the unused wrapper export and wrapper-only test while keeping the active single-attachment helper | implemented |
| CD-043 | Renderer chat-stream streaming message helpers | `resolveStreamingResponseAction(...)` and `findStreamingCompleteAssistantMessage(...)` remained exported from `chatStreamMessageUpdates.ts` after assistant text append/new behavior moved to SDK current-turn projection and active stream handlers | Knip reported both exports unused; repo search showed only `ChatStreamMessageUpdates.test.ts` and stale docs referenced them, while production imports the selector and payload update builders from the module | Delete the unused helper exports and helper-only tests; update docs to route assistant text projection debugging to SDK current-turn projection and live stream handlers | implemented |
| CD-044 | Renderer chat-stream thinking status normalizer | `normalizePersistedThinkingStatus(...)` and `COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS` remained exported from `chatStreamThinkingStatus.ts` after reasoning text moved to SDK current-turn projection | Knip reported both exports unused; repo search showed they were imported only by `ChatStreamThinkingStatusUtils.test.ts` and stale docs, while production imports only the live thinking/compaction status constants | Delete the unused normalizer, the obsolete no-changes status, and the helper-only test; update docs to route final reasoning text to SDK current-turn projection | implemented |
| CD-045 | Renderer chat-stream transparency helper module | `chatStreamTransparency.ts` and `buildAssistantTranscriptTransparency(...)` remained after transcript transparency replay moved to SDK projections and backend rehydrate transparency resolution | Knip reported the export unused; repo search showed the module was imported only by `ChatStreamTransparency.test.ts`, while remaining docs still routed transparency debugging through the orphan renderer helper | Delete the orphan helper module and test; update docs to route transparency replay issues to SDK projection and backend rehydrate transparency owners | `d445d30e2` |
| CD-046 | Renderer transcript transparency type alias | `TranscriptTransparencyData` remained exported from renderer transcript `types.ts` after the renderer transparency helper was deleted and transparency replay moved to SDK/backend owners | Knip reported the type export unused; repo search showed no code imports and only stale transcript docs referenced the contract | Delete the stale type alias and its unused `ToolSchema` import; update transcript docs to keep `SessionInfo` as the active renderer transcript type contract | `1fd49e2a1` |
| CD-047 | Transcript session options type export | `desktopTranscriptSessionRuntime.ts` re-exported `TranscriptSessionResolveOptions` from the infrastructure transcript runtime, and the infrastructure runtime exported the same options type even though it is used only inside that module | Knip reported the facade type export unused, then exposed the underlying infrastructure type export as unused after the facade re-export was removed; repo search showed no imports of either exported type | Remove the unused type import/re-export from the desktop facade and make the infrastructure options type private to the runtime implementation | `dd2f4d593` |
| CD-048 | Stream tracking reducer state type export | `desktopChatStreamTrackingRuntime.ts` exported a local `StreamTracking` reducer state type even though the chat store owns the public stream-tracking state interface and callers import only event/options/phase types from the reducer module | Knip reported the reducer `StreamTracking` export unused; repo search showed no imports from the reducer module, while tests and store consumers use `features/chat/stores/chatStore` for the public shape | Make the reducer's local state type private while preserving the exported tracking event/options/phase types used by stream handlers | `12341f690` |
| CD-049 | Desktop voice transcription gateway event type export | `desktopVoiceRuntimeClient.ts` exported `DesktopTranscriptionGatewayEvent` even though the union is only used as the return type for the module's own gateway message normalizer | Knip reported the event union export unused; repo search showed no external imports while voice UI callers consume the `DesktopVoiceRuntimeClient` methods directly | Make the gateway event union private to the desktop voice runtime client and preserve normalized gateway message behavior | `aa74f8074` |
| CD-050 | Conversation session snapshot type export | `conversationSessionRuntime.ts` exported `MainSessionSnapshot` even though callers use the runtime functions and do not import the snapshot type directly | Knip reported the snapshot type export unused; repo search showed the type is referenced only inside `conversationSessionRuntime.ts` while tests import runtime functions/constants | Make `MainSessionSnapshot` private to the conversation session runtime while preserving the public runtime functions and `EMPTY_MAIN_SESSION_SNAPSHOT` value | `0d18f130f` |
| CD-051 | Response overlay dismissal input type export | `chatStore.ts` exported `ResponseOverlayDismissalInput` even though dismissal callers pass plain object literals to the store methods and dismissal-key helper without importing the interface | Knip reported the interface export unused; repo search showed it is referenced only inside the chat store module while response overlay callers consume store methods | Make the dismissal input interface private to the chat store while preserving the public dismissal methods and key builder | `7aaec4655` |
| CD-052 | Prepared desktop chat turn type export | `desktopChatSendPreparation.ts` exported `PreparedDesktopChatTurn` even though the shape is only used by prepare/build/dispatch functions inside the same module | Knip reported the type export unused; repo search showed callers import functions from the module and docs reference the concept, but no code imports the type | Make the prepared turn shape private to the send-preparation module while preserving the exported preparation and dispatch functions | `0663f822c` |
| CD-053 | Tool-output transcript model context re-export | `toolOutputMessages.ts` re-exported `TranscriptModelContext` even though the canonical type remains owned by `transcriptModelContext.ts` and chat-stream consumers use `chatStreamTypes.ts` | Knip reported the re-export unused; repo search showed no imports from `toolOutputMessages.ts` while the module still uses the type internally | Delete the unused type re-export and preserve the internal type import for tool-output envelope construction | `caa8819bd` |
| CD-054 | Renderer infrastructure API barrel | `frontend/src/renderer/infrastructure/api/index.ts` re-exported the SDK client surface, but production and real tests import `windieSdkClient.ts` directly | Knip reported every barrel value/type export unused; import search showed only `WindieSdkClientExports.test.ts` imported the barrel, and active docs still described the barrel as stable | Delete the unused barrel and barrel-only test; update active SDK/API docs to route TypeScript client work to `windieSdkClient.ts` | `4b92d39d8` |
| CD-055 | Final renderer infrastructure helper type exports | `MessageFormatter.ts` exported `BundledToolResult` and `ScreenshotAttachmentPipeline.ts` exported `ScreenshotAttachment` even though both shapes are only used by their own service function signatures | Knip reported both as the final unused exported types; repo search showed no external imports of either type while callers consume service functions directly | Make both helper shapes private to their service modules and preserve formatter/screenshot pipeline behavior | `e04bfc335` |
| CD-056 | Renderer formatter and screenshot pipeline modules | `MessageFormatter.ts`, `ScreenshotAttachmentPipeline.ts`, `CapturePayloadUtils.ts`, screenshot-only surface lifecycle APIs, and their tests remained after renderer sends stopped capturing/uploading query screenshots and SDK/main took over screenshot resource resolution | Knip reported the formatter and screenshot pipeline functions as unused; repo search showed production kept only stale type imports, docs, and tests; removing the modules exposed `CapturePayloadUtils.ts`, screenshot lifecycle exports, and screenshot-only timing/reason helpers as unused fallout | Delete the dead renderer formatter/screenshot pipeline modules and tests; inline the remaining query capture metadata/system-state shapes into active owners; update docs to route query screenshot capture and materialization through SDK/main | `3dbfaff7b` |
| CD-057 | Electron app-menu helper exports | `app_menu_runtime.cjs` exported the workspace permission id, menu-template builder, path segment helper, and workspace permission request helper even though production imports only the app-menu installer and workspace selection extractor | Knip reported those four helper exports unused; repo search showed only tests imported the menu-template builder directly while the other helpers were internal implementation details | Remove the test-only/internal helper exports and assert menu template behavior through `installApplicationMenu(...)` instead | `fcb9a79f0` |
| CD-058 | Electron repo-instruction message/helper exports | `repo_instruction_runtime.cjs` exported the old AGENTS.md message wrapper/resolver, prompt-layer builder, and workspace normalizer even though production imports only `resolveWorkspaceRepoInstructionPromptLayers(...)` | Knip reported those four helper exports unused; repo search showed only tests imported the old message path while production sends `agent_definition.agents_md` prompt layers through Electron main | Delete the legacy message wrapper/resolver, keep builders and normalizer private, and update docs/tests to the prompt-layer owner | `e934747cd` |
| CD-059 | Electron runtime-path Python executable export | `runtime_paths.cjs` exported `resolvePythonExecutablePath(...)` even though production callers import only `resolveSidecarLaunchTarget(...)` and executable selection is an implementation detail of that launch-target resolver | Knip reported the lower-level export unused; repo search showed no external imports and runtime-path tests already cover executable resolution through sidecar launch targets | Remove the lower-level export and update runtime-path docs to describe Python executable lookup as internal launch-target behavior | `906522e8e` |
| CD-060 | Electron live-surface trace helper exports | `live_surface_trace_runtime.cjs` exported the env-gate predicate and renderer payload normalizer even though production imports only trace logging, renderer forwarding, and summarizer APIs | Knip reported those two helper exports unused; repo search showed only the unit test imported them directly while production exercises them internally through `logLiveSurfaceTrace(...)` and `handleRendererLiveSurfaceTrace(...)` | Remove the helper exports and retarget tests to the production trace APIs | `62a69489a` |
| CD-061 | Electron app diagnostics generic helper exports | `app_diagnostics_runtime.cjs` exported `appendAppRuntimeDiagnostic(...)` and `compactData(...)` even though production callers import the path-specific diagnostic appenders | Knip reported both helper exports unused; repo search showed the generic appender and compaction helper are only used inside the diagnostics runtime implementation | Remove the generic helper exports and leave only path-specific diagnostic appenders public | `4fae12f53` |
| CD-062 | Electron app diagnostics store internal exports | `app_diagnostics_store.cjs` exported internal path-definition/schema/sanitizer helpers and test-only MCP/conversation path constants alongside the real store/CLI APIs | Knip reported twelve store exports unused from the frontend package view; repo search showed five are used by the root `bin/windie diagnostics` command, while seven were internal or test-only | Remove only the internal/test-only store exports and preserve the CLI-facing diagnostics query/list/inspect/database exports | `a8f5eae63` |
| CD-063 | Electron MCP control helper exports | `mcp_control.cjs` exported config-normalization, config-mutation, enablement-diagnostics, and cache-clearing helpers even though production imports only the high-level MCP list/spec/refresh/update operations plus the config key | Knip reported those five helper exports unused; repo search showed only tests imported the config mutator directly to build enabled config fixtures | Remove helper exports, keep the helpers private, and make tests use literal config state while validating the production MCP control APIs | `cbb64120a` |
| CD-064 | Electron MCP runtime execution registry | `mcp_runtime.cjs` still exported and implemented the old Electron-side MCP execution registry, `executeMcpTool(...)`, discovered-tool lookup, and MCP result serialization/image promotion helpers after production MCP execution moved to the sidecar local runtime | Knip reported the execution helpers unused; the sidecar-owned MCP report says Electron main no longer calls `executeMcpTool` for production local tool execution, and repo search found no production consumers | Delete the retired Electron direct-execution path and keep `mcp_runtime.cjs` scoped to manifest discovery/projection fallback plus cache/tool-name helpers used by MCP control and handshake | `156d42ebb` |
| CD-065 | Electron client tool manifest helper export | `tool_manifest.cjs` exported `buildBuiltinClientToolManifest(...)` even though the generated built-in manifest loader is used only inside the client manifest merger and public callers use `buildClientToolManifest(...)` or tool-name lists | Knip reported the helper export unused; repo search showed no production, test, docs, or script imports outside the module itself, while handshake and MCP projection consumers use the higher-level manifest APIs | Remove the lower-level helper export and keep built-in manifest filtering private to the manifest merger | `6da1f3164` |
| CD-066 | Electron artifact fetch helper exports | `ipc_artifact_fetch.cjs` exported URL construction and artifact-id inference helpers even though production imports only `fetchArtifactImage(...)` for protected artifact image reads | Knip reported both helper exports unused; repo search showed only the helper-only artifact fetch test imported them directly, while `ipc.cjs` and artifact handlers call the high-level fetch function | Remove the helper exports, keep URL construction and ID inference private, and cover both behaviors through the public artifact fetch path | `aa7973141` |
| CD-067 | Electron assistant backend trace helper path | `ipc_assistant_trace.cjs` still exported a standalone `[AssistantTrace][backend]` helper path plus direct summary/predicate helpers even though production uses `createElectronMainTraceLogger(...)` for backend event diagnostics | Knip reported the helper exports unused; repo search showed only `AssistantTrace.test.cjs` imported them directly, while `ipc.cjs` imports only the Electron main and current-turn trace logger factories | Delete the unused standalone assistant-backend trace path and keep settings summary private under the active Electron main trace logger | `c8ebcfd31` |
| CD-068 | Electron backend event channel helper exports | `ipc_backend_event_channels.cjs` exported the backend-event channel map and channel resolver even though production imports only `broadcastTypedBackendEvent(...)` | Knip reported both exports unused; repo search showed only the channel unit test imported the helper resolver directly, while `ipc_runtime_helpers.cjs` uses the broadcaster | Remove the helper exports, keep channel routing private, and assert routing through the production broadcaster | `f4c491106` |
| CD-069 | Electron backend payload allowlist export | `ipc_backend_payload_contract.cjs` exported `BACKEND_PAYLOAD_KEYS_BY_TYPE` even though production imports only `filterBackendPayload(...)` for outbound websocket payload normalization | Knip reported the allowlist export unused; repo search showed only a frontend/backend contract test imported it directly, while production payload normalization uses the filter API | Remove the allowlist export, keep the allowlist private, and assert backend contract parity by filtering synthetic payloads through `filterBackendPayload(...)` | `cc8dc6925` |
| CD-070 | Electron IPC channel registry constant exports | `ipc_channel_registry_runtime.cjs` exported the shared IPC channel registry and preload argument prefix even though production imports only `buildPreloadIpcChannelsArgument(...)` | Knip reported both constant exports unused; repo search showed main window runtimes use only the argument builder and preload owns its own local prefix parser | Remove the constant exports and keep the registry/prefix private to the preload channel argument builder | `a5deefb3a` |
| CD-071 | Electron clipboard image helper exports | `ipc_clipboard_image.cjs` exported image size-limit constants and the trusted artifact URL validator even though production imports only `copyImageToClipboard(...)` and `registerClipboardImageHandler(...)` | Knip reported all three exports unused; repo search showed tests already cover validator behavior through the high-level copy path and no external caller imports the helpers | Remove the helper exports and keep size limits plus remote URL validation private to the clipboard image copy implementation | `8bf31abb6` |
| CD-072 | Electron conversation-event broadcast wrapper | `ipc_conversation_event_broadcast.cjs` exported `broadcastConversationEvent(...)` even though production imports only `buildConversationEventFromBackendEvent(...)` and active callers own renderer broadcasting themselves | Knip reported the wrapper export unused; repo search found no production, test, docs, or script call sites outside the module definition | Delete the wrapper export and keep backend-to-conversation event normalization as the module's public API | `0567dd6ca` |
| CD-073 | Electron renderer diagnostics helper exports | `ipc_diagnostics_runtime.cjs` exported frontend interaction summary, normalization, and message-text gating helpers even though production imports only `handleRendererLog(...)` | Knip reported all three helper exports unused; repo search showed only the diagnostics unit test imported them directly while runtime callers route through `handleRendererLog(...)` | Remove the helper exports, keep diagnostics normalization private, and assert summary/redaction behavior through the public renderer-log handler | `b1dd73c80` |
| CD-074 | Electron image context menu helper exports | `ipc_image_context_menu.cjs` exported `buildImageContextMenu(...)` and `showImageContextMenu(...)` even though production imports only `registerImageContextMenuHandler(...)` for the `show-image-context-menu` IPC channel | Knip reported both helper exports unused; repo search showed only the context-menu unit test imported them directly while the app registers the IPC handler | Remove the helper exports, keep menu construction/private popup execution inside the handler module, and assert copy/error behavior through the registered IPC handler | `372f368b6` |
| CD-075 | Electron install-auth helper exports | `ipc_install_auth_state.cjs` exported install-auth path hardening, payload normalization, and POSIX-mode gating helpers even though production imports only persistence, registration, path, and backend validation APIs | Knip reported all three helper exports unused; repo search showed only the install-auth test imported the mode predicate directly while normalization and hardening are exercised through load/save/validate flows | Remove the helper exports, keep token normalization and file-mode hardening private, and assert persisted token behavior through the public install-auth APIs | `89cf80745` |
| CD-076 | Electron query payload helper exports | `ipc_query_runtime.cjs` exported the backend query payload key allowlist and query-message-id normalizer even though production imports the public query payload builders and renderer/automated query preparers | Knip reported both helper exports unused; repo search showed only the query unit test imported the allowlist directly while message-id normalization is exercised through `prepareRendererQueryPayload(...)` | Remove the helper exports, keep the allowlist and id normalizer private, and assert backend query contract filtering through `buildBackendQueryPayload(...)` | `e7cc3d4f2` |
| CD-077 | Electron runtime helper user/payload exports | `ipc_runtime_helpers.cjs` still exported `generateUserId(...)` and `normalizeBackendPayload(...)` after install auth and SDK managed agent sessions became the active identity/websocket payload owners | Knip reported both exports unused; repo search found no production imports, and the only direct payload-normalizer use was a websocket contract test that should exercise the SDK managed agent session default filter instead | Delete the stale helper functions and retarget contract tests/docs to the SDK managed agent session plus current Electron direct-payload filters | `f739e3df3` |
| CD-078 | Electron settings sync helper exports | `ipc_settings_sync_runtime.cjs` exported `buildBackendSettingsPayload(...)` and `createSettingsSyncRuntime(...)` even though production imports only `createIpcSettingsSyncRuntime(...)` | Knip reported both exports unused; repo search found `buildBackendSettingsPayload(...)` only inside the same module plus tests, and `createSettingsSyncRuntime(...)` only in the helper-specific test | Remove the helper exports and wrapper, keep backend settings filtering private inside `sendSettingsUpdate(...)`, and assert filtering through the production runtime factory | `11d7649a1` |
| CD-079 | Electron tool-surface lifecycle helper export | `tool_surface_lifecycle.cjs` exported `normalizeToolName(...)` even though production imports only `createElectronToolSurfaceLifecycle(...)` to install the SDK local-tool lifecycle hook | Knip reported the export unused; repo search found no external imports, and same-module use only normalizes local tool names before choosing pointer/screenshot leases | Remove the helper export and keep tool-name normalization private to the lifecycle hook implementation | `0edefaf36` |
| CD-080 | Electron global stop shortcut helper exports | `agent_stop_shortcut_runtime.cjs` exported `ACTIVE_AGENT_LOOP_STOP_PHASES`, `getSupportedGlobalAgentStopShortcuts(...)`, and `normalizeGlobalAgentStopAccelerator(...)` even though production imports only the runtime initializer, phase predicate, and public accelerator resolver | Knip reported all three exports unused; repo search showed only `AgentStopShortcutRuntime.test.cjs` imported the catalog and normalizer helpers directly while production observes shortcut options through runtime status | Remove the helper exports, keep phase/catalog/accelerator normalization private, and assert shortcut catalog/normalization through public runtime status and resolver APIs | `9bcb5c08c` |

## Commit Ledger

- `dd62d7502 refactor(codebase): remove trace event and logging compatibility`
  completed CD-001 and CD-002.
- `24559adb9 refactor(backend): remove handler registry compatibility breadcrumb`
  completed CD-003.
- `ecbbe83fe refactor(backend): use typed no-model stream event`
  completed CD-004.
- `8f07ec5d1 refactor(backend): remove stream event enum aliases`
  completed CD-005.
- `0d916bc1d refactor(backend): remove event dict serialization fallback`
  completed CD-006.
- `e3d35ca71 refactor(backend): remove legacy prompt snapshots`
  completed CD-007.
- `97e3c2566 refactor(backend): require canonical stream event extraction`
  completed CD-008.
- `db53ef63f test(backend): rename sdk backend contract test`
  completed CD-009.
- `85bc9f55e refactor(backend): remove prompt tuple wrapper`
  completed CD-010.
- `5bd62aad3 docs(frontend): remove legacy settings entrypoint`
  completed CD-011.
- `ddd1d3059 docs(backend-api): rename query event extraction reference`
  completed CD-012.
- `5563e3db2 docs(backend-api): rename package split references`
  completed CD-013.
- `f6cc05187 refactor(backend-vision): remove internvl helper wrappers`
  completed CD-014.
- `55edbd4e7 docs(browser): rename canonical schema references`
  completed CD-015.
- `8f84ceae6 refactor(backend): require strict rehydrate tool linkage`
  completed CD-016.
- `16dac8ab4 refactor(cli): remove docs open alias`
  completed CD-017.
- `ded61fcf7 docs(troubleshooting): update rehydrate artifact guidance`
  completed CD-018.
- `cfdec4b17 refactor(backend): stop repairing invalid tool result state`
  completed CD-019.
- `9e55637d6 refactor(backend): require prepared prompt content`
  completed CD-020 and CD-021.
- `1a2bd4726 refactor(frontend): remove unused transcript memory helpers`
  completed CD-022.
- `c35bc0000 refactor(frontend): remove broken shell smoke harness`
  completed CD-023.
- `b1fa3d4d6 refactor(frontend): remove orphan transcript projection writer`
  completed CD-024.
- `c145c0afc refactor(frontend): remove transcript projection store helpers`
  completed CD-025.
- `4040e429e refactor(frontend): remove response overlay scanner helpers`
  completed CD-026.
- `266017d03 refactor(frontend): remove unused stream phase predicates`
  completed CD-027.
- `2960e0378 refactor(frontend): remove unused renderer default exports`
  completed CD-028.
- `20b3adce1 refactor(frontend): remove renderer selector trace exports`
  completed CD-029.
- `34e4a309c refactor(frontend): remove unused screenshot source helpers`
  completed CD-030.
- `7f4ad40e5 refactor(frontend): keep screenshot cache internal`
  completed CD-031.
- `9bc4b70d8 refactor(frontend): remove overlay phase payload parser`
  completed CD-032.
- `961ca09e9 refactor(frontend): keep compaction paint helper private`
  completed CD-033.
- `bc4f62813 refactor(frontend): remove transcript payload helpers`
  completed CD-034.
- `38ced9039 refactor(frontend): remove renderer rehydrate payload helper`
  completed CD-035.
- `b36ad10c0 refactor(frontend): remove transparency normalizer helper`
  completed CD-036.
- `5dd7c6351 refactor(frontend): keep tool call metadata helper private`
  completed CD-037.
- `5aef56987 refactor(frontend): keep tool schema helpers private`
  completed CD-038.
- `71986997e refactor(frontend): keep screenshot parsing helpers private`
  completed CD-039.
- `90738eeb3 refactor(frontend): remove display conversation projector export`
  completed CD-040.
- `110aa1df7 refactor(frontend): remove chat stream tool formatting exports`
  completed CD-041.
- `6e74fe8c8 refactor(frontend): remove screenshot list wrapper export`
  completed CD-042.
- `3a2af2087 refactor(frontend): remove stream message helper exports`
  completed CD-043.
- `6349b8f2d refactor(frontend): remove thinking status normalizer export`
  completed CD-044.
- `d445d30e2 refactor(frontend): remove chat stream transparency helper`
  completed CD-045.
- `1fd49e2a1 refactor(frontend): remove transcript transparency type`
  completed CD-046.
- `dd2f4d593 refactor(frontend): remove transcript session type exports`
  completed CD-047.
- `12341f690 refactor(frontend): keep stream tracking shape private`
  completed CD-048.
- `aa74f8074 refactor(frontend): keep voice gateway event type private`
  completed CD-049.
- `0d18f130f refactor(frontend): keep session snapshot type private`
  completed CD-050.
- `7aaec4655 refactor(frontend): keep overlay dismissal input private`
  completed CD-051.
- `0663f822c refactor(frontend): keep prepared chat turn type private`
  completed CD-052.
- `caa8819bd refactor(frontend): remove tool output context re-export`
  completed CD-053.
- `4b92d39d8 refactor(frontend): remove unused renderer api barrel`
  completed CD-054.
- `e04bfc335 refactor(frontend): keep final helper types private`
  completed CD-055.
- `3dbfaff7b refactor(frontend): delete renderer screenshot formatter path`
  completed CD-056.
- `fcb9a79f0 refactor(frontend): keep app menu helpers private`
  completed CD-057.
- `e934747cd refactor(frontend): keep repo instruction helpers private`
  completed CD-058.
- `906522e8e refactor(frontend): keep python path helper private`
  completed CD-059.
- `62a69489a refactor(frontend): keep live surface trace helpers private`
  completed CD-060.
- `4fae12f53 refactor(frontend): keep app diagnostic helpers private`
  completed CD-061.
- `a8f5eae63 refactor(frontend): keep diagnostics store internals private`
  completed CD-062.
- `cbb64120a refactor(frontend): keep mcp control helpers private`
  completed CD-063.
- `156d42ebb refactor(frontend): delete retired mcp execution path`
  completed CD-064.
- `6da1f3164 refactor(frontend): keep builtin manifest builder private`
  completed CD-065.
- `aa7973141 refactor(frontend): keep artifact fetch helpers private`
  completed CD-066.
- `c8ebcfd31 refactor(frontend): delete standalone assistant trace path`
  completed CD-067.
- `f4c491106 refactor(frontend): keep backend event channels private`
  completed CD-068.
- `cc8dc6925 refactor(frontend): keep backend payload allowlist private`
  completed CD-069.
- `a5deefb3a refactor(frontend): keep ipc channel registry constants private`
  completed CD-070.
- `8bf31abb6 refactor(frontend): keep clipboard image helpers private`
  completed CD-071.
- `0567dd6ca refactor(frontend): delete unused conversation broadcast wrapper`
  completed CD-072.
- `b1dd73c80 refactor(frontend): keep renderer diagnostics helpers private`
  completed CD-073.
- `372f368b6 refactor(frontend): keep image context menu helpers private`
  completed CD-074.
- `89cf80745 refactor(frontend): keep install auth helpers private`
  completed CD-075.
- `e7cc3d4f2 refactor(frontend): keep query payload helpers private`
  completed CD-076.
- `f739e3df3 refactor(frontend): delete stale runtime helper exports`
  completed CD-077.
- `11d7649a1 refactor(frontend): keep settings sync helpers private`
  completed CD-078.
- `0edefaf36 refactor(frontend): keep tool surface normalizer private`
  completed CD-079.
- `9bcb5c08c refactor(frontend): keep stop shortcut helpers private`
  completed CD-080.

## Validation Log

- `bin/windie docs list`: passed during orientation.

CD-001 validation:

- `bin/windie test frontend -- LayerLogSink ElectronLauncher WindieCli`: passed,
  4 suites and 44 tests.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-003 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_api_container_source.py -q`:
  passed, 12 tests.
- targeted `rg "Source compatibility breadcrumb|manual registration" backend/src/core/container/api_container.py`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-002 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_run_control_routes.py::test_list_run_events_filters_by_after_seq tests/backend/test_transcription_gateway.py -q`:
  passed, 5 tests.
- `./scripts/python-in-env backend pytest tests/backend/test_query_event_extraction.py tests/backend/test_formatter_specs_contract.py -q`:
  passed, 12 tests.
- targeted `rg "trace_event"` in touched production surfaces: no underscore
  event-type literals remain, only helper/test variable names.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-004 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_session_client_manifest_trace.py tests/backend/test_response_formatter.py -q`:
  passed, 14 tests.
- targeted `rg "yield \\{" backend/src/agent/session/session.py`: no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-005 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_formatter_specs_contract.py tests/backend/test_query_event_extraction.py tests/backend/test_events.py -q`:
  passed, 44 tests.
- targeted `rg "StreamingEventType\\.(THINKING|CHUNK)|^\\s+(THINKING|CHUNK)\\s*=" backend/src tests/backend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-006 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_events.py tests/backend/test_response_formatter.py -q`:
  passed, 40 tests.
- targeted `rg "legacy_dict|\\.dict\\(\\)" backend/src/core/events/streaming_events.py tests/backend/test_events.py docs/backend/contracts/events/streaming_event_dataclass_and_enum_semantics_reference.md`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-007 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_prompt_manager.py -q`:
  passed, 16 tests.
- targeted `rg "system_prompt_deprecated_2026_06_10|system_prompt_legacy" backend/src tests/backend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-008 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_query_event_extraction.py tests/backend/test_query_execution_service_helpers.py tests/backend/test_formatter_specs_contract.py tests/backend/test_api_contract_registry.py tests/backend/test_events.py tests/backend/test_formatters.py -q`:
  passed, 124 tests.
- targeted `rg 'normalize_streaming_event_type|LEGACY_STREAMING_EVENT_TYPE_ALIASES|"type": "chunk"|"type": "assistant_message_full"|assistant_message_full' backend/src tests/backend docs/backend/contracts/events docs/backend/api/processing docs/backend/api/services docs/backend/api/handlers`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-009 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_sdk_runtime_backend_contract.py -q`:
  passed, 6 tests.
- targeted `rg -n "test_sdk_runtime_backend_compatibility|SDK/backend compatibility|sdk-backend-compat|sdk-compat|conv-sdk-backend-compat|req-sdk-compat|bundle-sdk-compat|rev-compat|turn-compat|call-sdk-compat" tests/backend docs packages backend/src frontend/src --glob '!**/node_modules/**' --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-010 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_prompt_constructor_utils.py tests/backend/test_client_tool_manifest.py tests/backend/test_sdk_routes.py -q`:
  passed, 102 tests.
- targeted `rg -n "PromptConstructor\\.build_prompt|constructor\\.build_prompt|def build_prompt\\(|tuple-returning compatibility|Compatibility wrapper for callers" backend/src tests/backend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no compatibility-wrapper matches; remaining `build_prompt_messages` references are separate current helpers.
- `./scripts/python-in-env backend python -m black --check backend/src/api/routes/sdk/service.py backend/src/llm/prompts/prompt_constructor.py tests/backend/test_client_tool_manifest.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_sdk_routes.py`:
  passed.
- `./scripts/python-in-env backend python -m isort --check-only backend/src/api/routes/sdk/service.py backend/src/llm/prompts/prompt_constructor.py tests/backend/test_client_tool_manifest.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_sdk_routes.py`:
  passed.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-011 validation:

- targeted `rg -n "settings_section_display_selection_and_config_toggle_reference|Settings Section Display Selection and Config Toggle Reference|Legacy entrypoint page kept for compatibility|This page is retained as a compatibility entrypoint" docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-012 validation:

- targeted `rg -n "query_execution_helper_contracts_and_compatibility_event_extraction_reference|Query Execution Helper Contracts and Compatibility Event Extraction|compatibility event extraction|chunk/content extraction compatibility" docs backend/src tests --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-013 validation:

- targeted `rg -n "artifacts_route_package_split_and_compatibility_export_contract_reference|embeddings_route_package_split_and_compatibility_export_contract_reference|semantic_route_package_split_and_compatibility_export_contract_reference|websocket_route_package_router_split_and_monkeypatch_compat_reference|Embeddings Route Package Split and Compatibility Export Contract Reference" docs backend/src tests --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-014 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_vision_provider_loader.py tests/backend/test_vision_response_logging.py -q`:
  passed, 25 tests.
- `./scripts/python-in-env backend python -m black --check backend/src/services/vision/providers/internvl.py tests/backend/test_vision_provider_loader.py`:
  passed.
- `./scripts/python-in-env backend python -m isort --check-only backend/src/services/vision/providers/internvl.py tests/backend/test_vision_provider_loader.py`:
  passed.
- targeted `rg -n "def (_run_chat_with_fallbacks|_run_chat_generation|_run_generate_fallback|_run_generate_fallback_with_chat_error|_disable_flash_attention_runtime|_resolve_model_dtype|_prepare_question|_log_failure_context)|self\\.(_run_chat_with_fallbacks|_run_chat_generation|_run_generate_fallback|_run_generate_fallback_with_chat_error|_disable_flash_attention_runtime|_resolve_model_dtype|_prepare_question|_log_failure_context)|(_is_cuda_kernel_image_error|_is_meta_tensor_loading_error|_build_instruction_log_metadata)\\(|as (_is_cuda_kernel_image_error|_is_meta_tensor_loading_error|_build_instruction_log_metadata)|class methods as compatibility wrappers" backend/src tests docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no deleted wrapper symbols or compatibility-wrapper docs remain.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-015 validation:

- targeted `rg -n 'browser_remote_schema_surface_and_compatibility_contract_reference|browser_control_unified_schema_and_compatibility_field_matrix_reference|browser_action_compatibility_and_runtime_reference|Browser Remote Schema Surface and Compatibility Contract|Browser Control Unified Schema and Compatibility Field Matrix|Browser Action Compatibility and Runtime|Backend Browser Remote Schema Surface \\+ Compatibility|Backend Browser Control Unified Schema \\+ Compatibility|Sidecar Browser Action Compatibility|compatibility shims such as `navigate`' docs backend/src tests frontend/src --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-016 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_rehydrate_execution_service.py tests/backend/test_rehydrate_tool_call_normalization.py tests/backend/test_rehydrate_tool_linkage.py tests/backend/test_rehydrate_transparency_resolution.py -q`:
  passed, 39 tests.
- `./scripts/python-in-env backend python -m black --check backend/src/api/services/rehydrate_execution.py backend/src/api/services/rehydrate_entry_normalization.py backend/src/api/services/rehydrate_tool_linkage.py tests/backend/test_rehydrate_execution_service.py tests/backend/test_rehydrate_tool_linkage.py`:
  passed.
- `./scripts/python-in-env backend python -m isort --check-only backend/src/api/services/rehydrate_execution.py backend/src/api/services/rehydrate_entry_normalization.py backend/src/api/services/rehydrate_tool_linkage.py tests/backend/test_rehydrate_execution_service.py tests/backend/test_rehydrate_tool_linkage.py`:
  passed.
- targeted `rg -n "rehydrate_tool_linkage_repair|tool_linkage_repair|linkage repair|Linkage Repair|missing during rehydrate|inject synthetic|synthesizes missing|rehydrate_tool_call_[0-9]|fallback call id|synthetic assistant tool-call|synthesizes fallback call ids|synthesizes missing IDs" backend/src tests docs frontend/src --glob '!docs/plans/**'`:
  no rehydrate repair matches remain; remaining provider docs describe unrelated provider-specific tool-call id aggregation.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-017 validation:

- `bin/windie --help`: passed and no longer lists `windie docs open <topic>`.
- `bin/windie docs search command matrix`: passed.
- `bin/windie docs command matrix`: passed.
- targeted `rg -n "docs open|windie docs open|Usage: windie docs .*open" scripts docs/cli docs/development docs/getting-started --glob '!docs/plans/**'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-018 validation:

- targeted `rg -n "fallback fix" docs/getting-started/troubleshooting.md`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-019 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_tool_result_router.py tests/backend/test_tool_result_handler.py -q`:
  passed, 25 tests.
- `./scripts/python-in-env backend python -m black --check backend/src/agent/tools/waiting/router.py tests/backend/test_tool_result_router.py`:
  passed.
- `./scripts/python-in-env backend python -m isort --check-only backend/src/agent/tools/waiting/router.py tests/backend/test_tool_result_router.py`:
  passed.
- targeted `rg -n "falls_back_to_legacy_system_state|legacy_state|falls back to legacy system_state|fall back from invalid.*system_state_internal" backend/src tests/backend docs/backend --glob '!docs/plans/**'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-020 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_prompt_constructor_utils.py tests/backend/test_agent_executor_completion_side_effects.py tests/backend/test_query_execution_inputs.py -q`:
  passed, 33 tests.
- `./scripts/python-in-env backend python -m black --check backend/src/llm/prompts/prompt_constructor.py backend/src/agent/execution/executor.py backend/src/api/services/query_execution_support/query_execution_inputs.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_agent_executor_completion_side_effects.py`:
  passed.
- `./scripts/python-in-env backend python -m isort --check-only backend/src/llm/prompts/prompt_constructor.py backend/src/agent/execution/executor.py backend/src/api/services/query_execution_support/query_execution_inputs.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_agent_executor_completion_side_effects.py`:
  passed.
- targeted `rg -n "No message content provided|legacy clients|Fallback formatting when message_content|format_user_message_content\\(message_content, query|query=\\\"hello\\\"" backend/src tests/backend docs/backend docs/architecture --glob '!docs/plans/**'`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-021 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_agent_executor_completion_side_effects.py -q`:
  passed.
- `./scripts/python-in-env backend python -c "import backend.src.agent.session.session; from backend.src.agent.execution.executor import AgentExecutor; print(AgentExecutor.__name__)"`:
  passed and printed `AgentExecutor`.
- `./scripts/python-in-env backend python -m black --check backend/src/agent/session/initializer.py`:
  passed.
- `./scripts/python-in-env backend python -m isort --check-only backend/src/agent/session/initializer.py`:
  passed.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-022 validation:

- targeted `rg -n "episodicMemoryUtils|parseMemoriesToMessages|toRehydrateMessagePayload|storedTranscriptChatMessageState|buildStoredTranscriptChatMessages|EpisodicMemoryUtils|StoredTranscriptChatMessageState" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**'`:
  no matches.
- `bin/windie test frontend -- MemorySection ChatGptDashboardShell`: passed,
  3 suites and 42 tests. React act warnings were emitted by existing dashboard
  test async state updates.
- `bin/windie test frontend -- SdkDisplayChatMessageProjection ConversationContinuityService DesktopConversationContinuityService`:
  passed, 3 suites and 20 tests.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-023 validation:

- `./scripts/python-in-env sidecar pytest tests/sidecar/test_shell_process_tool.py tests/sidecar/test_shell_process_registry.py tests/sidecar/test_shell_output_formatting.py -q`:
  passed, 46 tests.
- targeted `rg -n "test_shell\\.cjs|test:shell|shell_tool_chrome_command_test_harness" frontend/package.json frontend/src docs tests --glob '!frontend/node_modules/**' --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no matches.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  unused-file/dependency/export findings, but the unused-file list dropped from
  3 to 2 and no longer includes `src/main/app/test_shell.cjs`.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-024 validation:

- targeted `rg -n "DesktopTranscriptProjectionRuntimeClient|desktopTranscriptProjectionRuntimeClient|transcriptEntryPersistence|transcriptRecordWrite|pendingTranscriptMessages|pendingUserQueue|pendingAssistantQueue|pendingToolQueue|transcriptPendingFlush|TranscriptPending|TranscriptRecordWrite|transcript_writer_queue_flush|pending_transcript_queue|pending_transcript_messages|renderer/transcript/queue|PendingUserMessage|PendingToolMessage|PendingAssistantMessage|transcript_entry_and_pending_message|export type TranscriptEntry|export type TranscriptStructuredToolPayload" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!docs/plans/**'`:
  no matches.
- `bin/windie test frontend -- DesktopConversationContinuityService DesktopConversationStore SdkDisplayChatMessageProjection TranscriptStorage TranscriptSessionState RendererChatRuntimeBoundary ModularRefactorCompletionBoundary TranscriptTransparencyNormalization`:
  passed, 10 suites and 88 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  unused dependency/export/type findings, but it no longer reports unused files
  for `desktopTranscriptProjectionRuntimeClient.ts` or
  `transcriptEntryPersistence.ts`, and the transcript pending/entry type exports
  removed in this slice no longer appear in the unused exported type list.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-025 validation:

- targeted `rg -n "CHAT_EVENT_RECORD_KIND|TranscriptProjectionRewriteEntry|TranscriptProjectionAppendEntry|buildRehydrateSnapshotFromTranscriptProjection|appendTranscriptProjectionEntry|rewriteTranscriptProjection|transcript_projection_rewrite|projectionEntryToConversationEvent|eventTypeFromProjectionEntry|storedTranscriptSdkProjection|buildStoredTranscriptRehydrateMessages|buildConversationEventsFromStoredTranscript|storedTranscriptMemoryState|resolveStoredTranscriptMemoryState|resolveStoredTranscriptScreenshotAttachment|StoredTranscriptMemoryState" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!docs/plans/**'`:
  no matches.
- `bin/windie test frontend -- DesktopConversationStore DesktopConversationContinuityService SdkDisplayChatMessageProjection RendererChatRuntimeBoundary ModularRefactorCompletionBoundary`:
  passed, 5 suites and 56 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  unused dependency/export/type findings, but it no longer reports
  `storedTranscriptSdkProjection.ts` as an unused file and no longer lists the
  CD-025 projection helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-026 validation:

- targeted `rg -n "toolExplanationMessages|collectToolExplanationTexts|readExplanationFromArguments|buildCurrentTurnResponseOverlayEntries" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no production or test matches; remaining hits are historical plan/report
  references only.
- `bin/windie test frontend -- ChatBoxResponseState MessagePresentationPipeline`:
  passed, 2 suites and 18 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but the CD-026 unused file and scanner
  exports no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-027 validation:

- targeted `rg -n "isLoopActivePhase|isTerminalStreamPhase|isAwaitingFirstChunkPhase|isStopControlAvailablePhase|ACTIVE_LOOP_PHASES|TERMINAL_STREAM_PHASES" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches.
- `bin/windie test frontend -- StreamPhaseState ChatLoopUiState`: passed,
  3 suites and 15 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 231 to
  227 and the CD-027 stream phase predicate exports no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-028 validation:

- targeted `rg -n "export default useMainWindowControls|export default useMessageListAutoScroll|export default toolSchemaPropType|import useMainWindowControls|import useMessageListAutoScroll|import toolSchemaPropType" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches.
- `bin/windie test frontend -- ChatInterfaceWiring MessageList FrontendOnboardingSlideshow`:
  passed, 7 suites and 107 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 227 to
  224 and the CD-028 default exports no longer appear.
- `git diff --check`: passed.

CD-029 validation:

- targeted `rg -n "selectChatBoxState|logRendererStreamTrace|isVoiceDebugTraceEnabled|export function getRendererSearch|export function isRendererStreamTraceEnabled|export function isRendererLiveSurfaceTraceEnabled|export function getRendererTraceView|export function summarizeWorkspaceForTrace|export const CHAT_PILL_SURFACE_REASON" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no production or test matches for deleted public surfaces; remaining
  `selectChatBoxState` hits are historical plan/report notes, and
  `isVoiceDebugTraceEnabled` is now private to `voiceDebugTrace.ts`.
- `bin/windie test frontend -- ChatSelectors ChatPillSessionFlow ChatStreamDebugTrace MinimalChatPill ResponseOverlayWindowSync Voice`:
  passed, 9 suites and 60 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 224 to
  215 and the CD-029 selector/trace exports no longer appear.
- `npm run typecheck` in `frontend`: still exits 2 because of existing
  unrelated stop-payload type errors in `desktopBackendTransport.ts` and
  `WindieAgent.ts`; no CD-029 file is reported.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this slice deletes dead renderer selector and trace public surfaces
  while preserving the active production trace entrypoints.

CD-030 validation:

- targeted `rg -n "resolveMessageScreenshotSrc|resolveMessageScreenshotSrcList" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no production or test matches; remaining hits are this cleanup report entry.
- `bin/windie test frontend -- MessageScreenshots MessageContent UseResolvedMessageScreenshots`:
  passed, 3 suites and 22 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 215 to
  213 and the CD-030 screenshot source helpers no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; the active message screenshot path still normalizes attachments and
  resolves static/async artifact images through production-used APIs.

CD-031 validation:

- targeted `rg -n "clearResolvedArtifactImageCache" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no production or test matches; remaining hit is this cleanup report entry.
- `bin/windie test frontend -- MessageContent MessageScreenshots`: passed,
  3 suites and 22 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 213 to
  212 and the CD-031 cache reset export no longer appears.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes a test-only renderer export and leaves artifact-image
  cache lifetime internal to the hook module.

CD-032 validation:

- targeted `rg -n "responseOverlayPhasePayload\\.js|parseResponseOverlayPhasePayload|tests/frontend/ResponseOverlayPhasePayload|cd frontend && npm run test -- ResponseOverlayPhasePayload|RESPONSE_OVERLAY_METADATA_KEYS as rendererMetadataKeys|isResponseOverlayPhase|normalizeResponseOverlayString|normalizeResponseOverlayNumber" frontend/src/renderer tests/frontend docs/frontend docs/plans/2026-06-15-codebase-compatibility-deletion-report.md --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no production, test, or current-doc matches; remaining hit is this cleanup
  report entry.
- `bin/windie test frontend -- OverlayPhaseContractParity ResponseOverlayPhaseContract IpcOverlayPhaseContract IpcOverlayPhaseState IpcOverlayPhaseEvents ResponseOverlayLayoutMode OverlayFrameSize ChatBoxResponse`:
  passed, 10 suites and 66 tests. Existing renderer live-surface trace logs
  were emitted by the `ChatBoxResponse` suite.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 212 to
  211 and the CD-032 parser/normalizer exports no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes a renderer-only parser and leaves native phase payload
  validation with Electron main/shared phase contracts.

CD-033 validation:

- targeted `rg -n "export function waitForNextPaint|waitForNextPaint" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no exported helper remains; remaining source hit is the private helper plus
  its internal call, and docs still describe the current paint-wait behavior.
- `bin/windie test frontend -- ManualCompactionRuntime ChatSurfaceController RendererChatRuntimeBoundary`:
  passed, 3 suites and 44 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 211 to
  210 and the CD-033 helper export no longer appears.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes an unused renderer export and preserves the
  pre-compaction paint delay inside the active command path.

CD-034 validation:

- targeted `rg -n "transcript_message_payload_role_type_and_rehydrate_shape_reference|transcriptMessagePayload|TranscriptMessagePayload|resolveTranscriptRole|resolveTranscriptMessageType|toRehydratePayload|rehydrateMessageState|structuredToolPayload|buildRehydrateMessagePayload|buildStoredTranscriptToolMessageState|normalizeStructuredToolPayload" docs frontend/src tests/frontend --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md'`:
  no production, test, or current-doc matches remain.
- `bin/windie test frontend -- ChatModelOptions ModularRefactorCompletionBoundary DesktopConversationStore SdkDisplayChatMessageProjection RehydratePayload ToolCallMessageState ToolOutputMessageState`:
  passed, 7 suites and 38 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 210 to
  207 and the CD-034 deleted helper files/symbols no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes dead renderer transcript helper modules after active
  transcript replay/display moved to SDK-backed transcript infrastructure, while
  provider normalization remains in the chat model option path.

CD-035 validation:

- targeted `rg -n "rehydratePayload\\.js|RehydratePayload\\.test|resolveRehydrateContent|buildRehydrateToolCall|parseToolCallPayload|normalizeTranscriptTransparency|buildTranscriptTransparencyFromChatMessage|from './rehydratePayload'|from \"./rehydratePayload\"" docs frontend/src tests/frontend packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no stale helper-file, deleted-test, deleted-export, or import matches remain.
- `bin/windie test frontend -- ToolCallMessageState WindieSdkConversationRuntime ConversationContinuityService ConversationReplayToolMessages MessageScreenshots`:
  passed, 6 suites and 161 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 207 to
  202 and the CD-035 deleted helper file/symbols no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; backend rehydrate payload construction already lives in SDK
  conversation projections and backend rehydrate services, and this slice only
  removes a stale renderer helper/test plus misleading docs.

CD-036 validation:

- targeted `rg -n "transcript_transparency_normalization_and_snapshot_pruning_contract_reference|Transcript Transparency Normalization|transparencyNormalization|TranscriptTransparencyNormalization|normalizeTransparencyData" docs frontend/src tests/frontend packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no stale helper-file, deleted-test, deleted-doc, or deleted-export matches
  remain.
- `bin/windie test frontend -- IncomingTextNormalization TranscriptSessionSyncPayload ChatStreamTransparency WindieSdkConversationRuntime ModularRefactorCompletionBoundary`:
  passed, 5 suites and 150 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 202 to
  201 and the CD-036 deleted helper file/symbols no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this deletes only a renderer helper and docs page with no production
  imports, while active transparency capture/projection remains covered by
  chat-stream, SDK projection, and backend rehydrate tests.

CD-037 validation:

- targeted `rg -n "export function normalizeToolCallDisplayMetadata|import .*normalizeToolCallDisplayMetadata|normalizeToolCallDisplayMetadata" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no exported helper or import matches remain; the only hits are the private
  helper and its internal call sites in `toolCallMessageState.js`.
- `bin/windie test frontend -- ToolCallMessageState ChatStreamFormatting ChatBoxResponseState MessagePresentationPipeline`:
  passed, 4 suites and 36 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 201 to
  200 and the CD-037 helper export no longer appears.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused renderer export while preserving the
  active tool-call and bundle message-state behavior.

CD-038 validation:

- targeted `rg -n "export function isSupportedToolSchema|export function normalizeToolSchema|export function isSupportedToolSchemaList|import .*isSupportedToolSchema|import .*normalizeToolSchema|import .*isSupportedToolSchemaList|isSupportedToolSchema|normalizeToolSchema\\(|isSupportedToolSchemaList" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no exported helper or import matches remain; the only predicate/single-schema
  hits are private helpers inside `toolSchemaShape.ts`, while production
  consumers import `normalizeToolSchemaList(...)`.
- `bin/windie test frontend -- ChatStreamTransparency ChatStreamThinkingStatus MessageTransparency WindieSdkConversationRuntime`:
  passed, 8 suites and 216 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 200 to
  197 and the CD-038 helper exports no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only unused renderer helper exports while preserving
  the public list-normalization API used by chat stream and message
  transparency code.

CD-039 validation:

- targeted `rg -n "export function looksLikeInlineImageData|export function parseInlineScreenshotPayload|export function resolveStoredTranscriptScreenshotValue|import .*parseInlineScreenshotPayload|import .*resolveStoredTranscriptScreenshotValue|looksLikeInlineImageData|parseInlineScreenshotPayload|resolveStoredTranscriptScreenshotValue" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no exported helper or import matches remain; the only inline-parser hits are
  private helpers and internal calls in `screenshotMessageState.js`.
- `bin/windie test frontend -- ScreenshotMessageState MessageScreenshots SdkDisplayChatMessageProjection ToolOutputMessageState MessageContent UseResolvedMessageScreenshots`:
  passed, 6 suites and 37 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 197 to
  194 and the CD-039 helper exports no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only unused renderer screenshot helper exports, while
  active screenshot replay, attachment-state, and artifact-ref behavior stays on
  the production resolver APIs.

CD-040 validation:

- targeted `rg -n "buildChatMessagesFromDisplayConversation" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no production or test references remain.
- `bin/windie test frontend -- SdkDisplayChatMessageProjection DesktopConversationStore DesktopConversationContinuityService WindieSdkConversationRuntime`:
  passed, 4 suites and 149 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 194 to
  193 and the CD-040 projector export no longer appears.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused renderer export and leaves the active
  SDK display-row projection path used by dashboard and chat runtime consumers.

CD-041 validation:

- targeted `rg -n "formatToolCallPayload|formatToolBundlePayload|formatToolOutputText|\\bresolveModelFacingToolCall\\b|export function buildNormalizedToolCall|import .*buildNormalizedToolCall" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no renderer helper export, import, test, or docs references remain.
- `bin/windie test frontend -- ChatStreamFormatting ToolCallMessageState ToolOutputMessageState ChatStreamTransparency MessagePresentationPipeline`:
  passed, 5 suites and 25 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 193 to
  189 after removing the four chat-stream formatting exports and making the
  follow-on tool-call normalizer private.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this deletes only unused renderer helper exports while keeping
  active tool-call, tool-bundle, and tool-output message projection in the
  transcript message-state builders.

CD-042 validation:

- targeted `rg -n "buildScreenshotAttachments" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no renderer helper export, import, test, or docs references remain.
- `bin/windie test frontend -- ChatStreamEventUtils ChatBoxResponseState ScreenshotMessageState MessageScreenshots`:
  passed, 4 suites and 25 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 189 to
  188 and the CD-042 wrapper export no longer appears.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this deletes only an unused renderer wrapper export while preserving
  active single screenshot attachment projection and shared list normalization.

CD-043 validation:

- targeted `rg -n "findStreamingCompleteAssistantMessage|resolveStreamingResponseAction" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no renderer helper export, import, test, or docs references remain.
- `bin/windie test frontend -- ChatStreamMessageUpdates StreamMessageUpdaters ChatStreamThinkingStatus ChatStreamTransparency`:
  passed, 6 suites and 79 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 188 to
  186 and the CD-043 helper exports no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this deletes only unused renderer helper exports while preserving
  active selector and payload-update helpers plus SDK-owned assistant text
  projection.

CD-044 validation:

- targeted `rg -n "COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS|normalizePersistedThinkingStatus|ChatStreamThinkingStatusUtils" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no renderer helper export, import, test, or docs references remain.
- `bin/windie test frontend -- ChatStreamCompactionHandlers ManualCompactionRuntime ChatStreamThinkingStatus ChatStreamMessageUpdates`:
  passed, 6 suites and 77 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings, but unused export count dropped from 186 to
  184 and the CD-044 helper exports no longer appear.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only unused renderer helper exports and helper-only
  tests while preserving live thinking and compaction status constants.

CD-045 validation:

- targeted `rg -n "chatStreamTransparency|ChatStreamTransparency|buildAssistantTranscriptTransparency" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- ChatStreamMessageUpdates MessageTransparency WindieSdkConversationRuntime`:
  passed; 4 suites and 145 tests.
- `./scripts/python-in-env backend pytest tests/backend/test_rehydrate_transparency_resolution.py -q`:
  passed; 5 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exports dropped from 184 to 183 after
  deleting the orphan transparency helper export and file.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an orphan renderer helper module and test while
  preserving SDK display projection and backend rehydrate transparency owners.

CD-046 validation:

- targeted `rg -n "TranscriptTransparencyData|transcript transparency type|transparency payload contracts|renderer-captured transparency" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- TranscriptSessionState TranscriptStorage TranscriptSessionSyncPayload SdkDisplayChatMessageProjection`:
  passed; 6 suites and 35 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 59 to 58
  after deleting `TranscriptTransparencyData`.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused renderer type alias while preserving the
  active `SessionInfo` session identity contract.

CD-047 validation:

- targeted `rg -n "export type TranscriptSessionResolveOptions|export \\{ TranscriptSessionResolveOptions \\}|import .*TranscriptSessionResolveOptions" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- TranscriptSessionState TranscriptStorage TranscriptSessionSyncPayload ChatSessionBootstrap NewChatSession ResetActiveChatSession`:
  passed; 8 suites and 35 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 58 to 57
  after removing the transcript session options exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only unused TypeScript type exports and preserves
  transcript session runtime behavior.

CD-048 validation:

- targeted `rg -n "import type \\{[^}]*StreamTracking[^}]*\\} from ['\\\"].*desktopChatStreamTrackingRuntime|export type StreamTracking =" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- DesktopChatStreamTrackingRuntime ChatStore ChatWorkspaceState ChatStreamThinkingStatus`:
  passed; 7 suites and 92 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 57 to 56
  after making the reducer `StreamTracking` shape private.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused TypeScript type export and preserves
  stream tracking reducer behavior.

CD-049 validation:

- targeted `rg -n "export type DesktopTranscriptionGatewayEvent|import type \\{[^}]*DesktopTranscriptionGatewayEvent" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- DesktopVoiceRuntimeClient VoiceMode WakewordController RendererApiClientBoundary`:
  passed; 3 suites and 19 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 56 to 55
  after making the gateway event union private.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused TypeScript type export and preserves
  voice gateway normalization behavior.

CD-050 validation:

- targeted `rg -n "export type MainSessionSnapshot|import type \\{[^}]*MainSessionSnapshot" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- ConversationSessionRuntime ChatSessionBootstrap ChatMessageSender ConversationReplayActions`:
  passed; 6 suites and 72 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 55 to 54
  after making `MainSessionSnapshot` private.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused TypeScript type export and preserves
  conversation session runtime behavior.

CD-051 validation:

- targeted `rg -n "export interface ResponseOverlayDismissalInput|import type \\{[^}]*ResponseOverlayDismissalInput" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- ChatStore ResponseOverlayViewModel ChatBoxOverlayMouseIgnore ChatInterfaceWiring`:
  passed; 4 suites and 111 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 54 to 53
  after making `ResponseOverlayDismissalInput` private.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused TypeScript interface export and
  preserves response overlay dismissal behavior.

CD-052 validation:

- targeted `rg -n "export type PreparedDesktopChatTurn|import type \\{[^}]*PreparedDesktopChatTurn" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- ChatMessageSender ChatMessageSenderPayloads ChatMessageSenderUtils ConversationReplayActions RendererChatRuntimeBoundary`:
  passed; 5 suites and 76 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 53 to 52
  after making `PreparedDesktopChatTurn` private.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused TypeScript type export and preserves
  desktop chat send preparation and dispatch behavior.

CD-053 validation:

- targeted `rg -n "from ['\\\"].*toolOutputMessages['\\\"].*TranscriptModelContext|export type \\{ TranscriptModelContext \\}" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- ToolOutputChatMessageState MessageTransparency ChatStreamMessageUpdates ChatStreamThinkingStatus`:
  passed; 6 suites and 81 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export/type findings; unused exported types dropped from 52 to 51
  after removing the `TranscriptModelContext` re-export.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused TypeScript type re-export and preserves
  tool-output envelope construction.

CD-054 validation:

- targeted `rg -n "from ['\\\"][^'\\\"]*infrastructure/api(?:/index)?['\\\"]|import\\(['\\\"][^'\\\"]*infrastructure/api(?:/index)?['\\\"]\\)|infrastructure/api/index|WindieSdkClientExports|Renderer API barrel|stable app API barrel" frontend/src tests/frontend docs packages --glob '!docs/plans/**' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside historical plan reports and this report.
- `bin/windie test frontend -- WindieSdkClient WindieSdkFileConversationStore WindieSdkConversationRuntime WindieSdkManagedBackendSession RendererApiClientBoundary`:
  passed; 5 suites and 221 tests.
- Attempted broader `bin/windie test frontend -- WindieSdkClient WindieSdkFileConversationStore WindieSdkConversationRuntime WindieSdkMockBackendE2E WindieSdkManagedBackendSession RendererApiClientBoundary`:
  sandbox run failed because `WindieSdkMockBackendE2E` could not bind
  `127.0.0.1` (`listen EPERM`); approved unsandboxed rerun got past bind but
  failed in `WindieSdkMockBackendE2E` on existing local-runtime fixture setup:
  `WindieClient memory requires a local runtime with RPC support.` The direct
  client/barrel boundary suite above passed.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 183 to 176 and unused
  exported types dropped from 51 to 2 after deleting the renderer API barrel.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only an unused renderer TypeScript barrel and updates
  active docs to the direct `windieSdkClient.ts` owner.

CD-055 validation:

- targeted `rg -n "export interface BundledToolResult|export type ScreenshotAttachment|import type \\{[^}]*(BundledToolResult|ScreenshotAttachment)" frontend/src tests/frontend docs packages --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/release/**' --glob '!frontend/dist/**' --glob '!frontend/python-runtime/**'`:
  no matches outside this report.
- `bin/windie test frontend -- MessageFormatter ScreenshotAttachmentPipeline ChatMessageSender ArtifactUploader QueryScreenshotPipeline`:
  passed; 6 suites and 64 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; the unused exported types section is gone after
  making `BundledToolResult` and `ScreenshotAttachment` private.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only unused TypeScript type exports and preserves
  formatter/screenshot service behavior.

CD-056 validation:

- targeted `rg -n "MessageFormatter|ScreenshotAttachmentPipeline|captureScreenshotAttachment|formatToolOutputMessage|formatBundledToolOutputMessage|CapturePayloadUtils|prepareScreenshotCaptureVisibility|restoreScreenshotCaptureVisibility|CaptureVisibilityPreparation|logScreenshotCaptureTiming|SurfaceOrchestratorCaptureLifecycle|activeScreenshotCapture|pendingScreenshotCapture" frontend/src tests docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!CHANGELOG.md'`:
  no matches outside this report.
- `bin/windie test frontend -- ChatMessageSender SystemStateCapture ArtifactUploader QueryScreenshotPipeline WindieSdkConversationRuntime LocalBackendBridgeExtensionRuntime LocalBackendBridgeWindowVisibility SurfaceOrchestratorSurfaceVisibility SurfaceOrchestratorReasons ToolExecutionLogger`:
  passed; 11 suites and 186 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 176 to 167, and the
  transient unused file/type findings exposed by the deletion were removed.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required. Renderer query sends already submit SDK resources; this deletion
  removes the unused pre-SDK renderer screenshot/formatter path and updates
  docs to the SDK/main screenshot materialization owner.

CD-057 validation:

- targeted `rg -n "WORKSPACE_ACCESS_PERMISSION_ID|buildApplicationMenuTemplate|getLastPathSegment|requestWorkspaceFolderSelection|app_menu_runtime" frontend/src tests docs --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only internal implementation references remain for the private helpers; tests
  import the production `installApplicationMenu` and `extractWorkspaceSelection`
  exports.
- `bin/windie test frontend -- AppMenuRuntime`: passed; 1 suite and 3 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 167 to 163.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this narrows a CommonJS test-only export surface while preserving
  the Electron app menu installer behavior.

CD-058 validation:

- `bin/windie test frontend -- RepoInstructionRuntime IpcMainBridge.query`:
  passed; 2 suites and 24 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 163 to 159 after
  deleting the repo-instruction message/helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; this removes only unused Electron main CommonJS exports and the
  obsolete AGENTS.md user-message wrapper while preserving the active
  `agents_md` prompt-layer path.

CD-059 validation:

- targeted `rg -n "resolvePythonExecutablePath" frontend/src tests/frontend docs --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain.
- `bin/windie test frontend -- RuntimePaths`: passed; 1 suite and 7 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 159 to 158 after
  removing the runtime-path helper export.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; sidecar and wakeword launches still use
  `resolveSidecarLaunchTarget(...)`.

CD-060 validation:

- targeted `rg -n "isLiveSurfaceTraceEnabled|normalizeRendererLiveSurfaceTracePayload" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain.
- `bin/windie test frontend -- LiveSurfaceTraceRuntime`: passed; 1 suite and
  7 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 158 to 156 after
  removing the live-surface trace helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; trace logging and renderer trace forwarding continue through the
  same production APIs.

CD-061 validation:

- targeted `rg -n "appendAppRuntimeDiagnostic|compactData" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain.
- `bin/windie test frontend -- IpcDiagnosticsRuntime AssistantTrace MainProcessLifecycleRuntime SurfaceRuntime WakewordBridge LocalBackendBridge.lifecycle SdkLiveTurnSurfaceController`:
  passed; 9 suites and 98 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 156 to 154 after
  removing the generic diagnostics helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; diagnostics continue through the same path-specific appenders.

CD-062 validation:

- targeted `rg -n "CONVERSATION_METADATA_LIST_DIAGNOSTICS_PATH|DIAGNOSTIC_PATH_DEFINITIONS|MCP_EXECUTION_DIAGNOSTICS_PATH|MCP_REGISTRATION_DIAGNOSTICS_PATH|ensureDiagnosticsSchema|sanitizeData|sanitizeError" frontend/src tests/frontend docs scripts --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references, test-local MCP path literals, and
  sidecar-owned Python diagnostic path constants remain.
- `bin/windie test frontend -- AppDiagnosticsStore McpControl`: passed; 2
  suites and 20 tests.
- `bin/windie diagnostics paths --json`: passed and listed the registered
  diagnostics path definitions through the root CLI entrypoint.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 154 to 147 after
  removing the internal/test-only diagnostics-store exports. The remaining
  diagnostics store exports in Knip are kept because `scripts/windie/commands.cjs`
  imports them for `bin/windie diagnostics`.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; the SQLite schema and CLI query/list/inspect APIs are unchanged.

CD-063 validation:

- targeted `rg -n "clearMcpControlState|createMcpEnablementDiagnostics|getEnabledMcpServersFromConfig|normalizeEnabledMcpServers|setMcpServerEnabledInConfig" frontend/src tests/frontend docs scripts --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain.
- `bin/windie test frontend -- McpControl IpcMainBridge.query`: passed; 2
  suites and 28 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 147 to 142 after
  removing MCP control helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required; MCP list/spec/refresh/update public APIs and persisted config shape
  are unchanged.

CD-064 validation:

- targeted `rg -n "executeMcpTool|hasDiscoveredMcpTool|stripMcpImageDataForOutput|serializeMcpResultForOutput|extractMcpImageContent|McpStdioClient" frontend/src tests/frontend docs --glob '!docs/plans/2026-06-15-codebase-compatibility-deletion-report.md' --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  no live production/test references remain for the deleted execution helpers;
  `McpStdioClient` remains private inside `mcp_runtime.cjs` for manifest
  discovery fallback and in the Python sidecar as the actual MCP execution
  owner.
- `bin/windie test frontend -- McpRuntime McpControl AgentCapabilityHandshake LocalBackendBridgeExtensionRuntime`:
  passed; 4 suites and 28 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 142 to 131 after
  deleting the retired MCP execution exports and result helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no storage, transport, or persisted-data migration is
  required. This removes the retired Electron direct MCP execution surface;
  sidecar-owned MCP `/execute-tool` execution and raw MCP result preservation
  remain the active runtime contract.

CD-065 validation:

- targeted `rg -n "buildBuiltinClientToolManifest|tool_manifest|createBuiltinToolManifest|BUILTIN_CLIENT_TOOLS" .`:
  no callers import `buildBuiltinClientToolManifest(...)` outside
  `tool_manifest.cjs`; production handshake and MCP manifest projection consume
  the higher-level client manifest APIs.
- `bin/windie test frontend -- ExtensionManifest AgentCapabilityHandshake McpControl`:
  passed; 3 suites and 19 tests. This covered the exploratory CommonJS export
  narrowing before that part was reverted because Knip classified several
  test-only extension registry exports as unused.
- `bin/windie test frontend -- AgentCapabilityHandshake McpRuntime`: passed; 2
  suites and 18 tests after keeping only the tool-manifest export deletion.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 131 to 130 after
  removing the built-in manifest helper export.
- `bin/windie docs list`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required. The client tool manifest shape and handshake path are unchanged;
  only the lower-level generated built-in manifest helper stopped being public.

CD-066 validation:

- targeted `rg -n "buildArtifactFetchUrl|inferArtifactId" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain inside `ipc_artifact_fetch.cjs`.
- `bin/windie test frontend -- IpcArtifactFetch`: passed; 1 suite and 2 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 130 to 128 after
  removing artifact fetch helper exports.
- `bin/windie docs list`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required. The protected artifact fetch IPC behavior and response shape are
  unchanged; URL construction and artifact-id inference are now private helper
  details under `fetchArtifactImage(...)`.

CD-067 validation:

- targeted `rg -n "buildBackendAssistantTraceSummary|buildSettingsTraceSummary|shouldTraceAssistantBackendEvent|traceAssistantBackendEvent|\\[AssistantTrace\\]\\[backend\\]" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only the private same-module `buildSettingsTraceSummary(...)` implementation
  remains.
- `bin/windie test frontend -- AssistantTrace IpcDiagnosticsRuntime`: passed; 2
  suites and 8 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 128 to 124 after
  deleting the standalone assistant-backend trace helper exports.
- `bin/windie docs list`: passed.
- Migration note: no storage, transport, or persisted-data migration is
  required. Electron backend event diagnostics still flow through
  `createElectronMainTraceLogger(...)`; only the unused standalone
  `[AssistantTrace][backend]` helper output path was removed.

CD-068 validation:

- targeted `rg -n "BACKEND_EVENT_RENDERER_CHANNELS|getRendererChannelsForBackendEvent" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain inside
  `ipc_backend_event_channels.cjs`.
- `bin/windie test frontend -- IpcBackendEventChannels`: passed; 1 suite and 4
  tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 124 to 122 after
  removing backend event channel helper exports.
- `bin/windie docs list`: passed.
- Migration note: no storage, transport, or persisted-data migration is
  required. Backend event renderer routing and event payloads are unchanged;
  tests now exercise the production broadcaster rather than the private channel
  resolver.

CD-069 validation:

- targeted `rg -n "BACKEND_PAYLOAD_KEYS_BY_TYPE" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  the frontend allowlist is private inside `ipc_backend_payload_contract.cjs`;
  the remaining test hit parses the SDK source allowlist for cross-runtime
  parity.
- `bin/windie test frontend -- FrontendBackendWebsocketContract`: passed all 9
  tests, but the Jest wrapper remained open due to an existing open-handle
  warning; the process was interrupted after the pass output.
- `npm run test:ci -- --forceExit FrontendBackendWebsocketContract`: passed; 1
  suite and 9 tests with clean command exit.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 122 to 121 after
  removing the backend payload allowlist export.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no storage, transport, or persisted-data migration is
  required. Outbound websocket payload filtering is unchanged; only the
  implementation allowlist stopped being a public Electron main export.

CD-070 validation:

- targeted `rg -n "IPC_CHANNELS|IPC_CHANNELS_ARGUMENT_PREFIX" frontend/src/main tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain inside
  `ipc_channel_registry_runtime.cjs`.
- `bin/windie test frontend -- IpcChannels PreloadIpcChannels MainWindowRuntime MainWindowOverlayRuntime`:
  passed; 4 suites and 74 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 121 to 119 after
  removing IPC channel registry constant exports.
- `bin/windie docs list`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required. Preload channel injection still uses `buildPreloadIpcChannelsArgument(...)`;
  the shared channel registry and argument prefix are just private implementation
  details in Electron main.

CD-071 validation:

- targeted `rg -n "MAX_DATA_IMAGE_BYTES|MAX_REMOTE_IMAGE_BYTES|validateRemoteImageUrl" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain inside `ipc_clipboard_image.cjs`.
- `bin/windie test frontend -- IpcClipboardImageHandler IpcImageContextMenuHandler`:
  passed; 2 suites and 11 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 119 to 116 after
  removing clipboard image helper exports.
- `bin/windie docs list`: passed.
- Migration note: no runtime, storage, transport, or persisted-data migration is
  required. Clipboard copy behavior, trusted artifact validation, redirect
  checks, and size limits are unchanged; the lower-level helpers are no longer
  public Electron main exports.

CD-072 validation:

- targeted `rg -n "broadcastConversationEvent" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**'`:
  no remaining references.
- `bin/windie test frontend -- IpcMainBridge.query QueryBroadcast FrontendBackendWebsocketContract`:
  passed; 2 suites and 31 tests, then hit the existing Jest open-handle hang
  after completion.
- `npm run test:ci -- --forceExit FrontendBackendWebsocketContract` in
  `frontend`: passed; 1 suite and 9 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 116 to 115 after
  removing the conversation-event broadcast wrapper export.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport, IPC payload, or persisted-data
  migration is required. Backend-to-conversation event normalization remains
  available through `buildConversationEventFromBackendEvent(...)`; renderer
  broadcast ownership stays with the active caller modules.

CD-073 validation:

- targeted `rg -n "formatFrontendInteractionSummary|normalizeFrontendInteractionEntry|shouldIncludeMessageText" frontend/src/main tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module Electron main references remain for the helpers;
  separate renderer interaction logger summary helpers are independent.
- `bin/windie test frontend -- IpcDiagnosticsRuntime FrontendInteractionLogger`:
  passed; 2 suites and 14 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 115 to 112 after
  removing the diagnostics helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, IPC payload, diagnostic file, or
  persisted-data migration is required. Renderer diagnostics still enter
  Electron main through `handleRendererLog(...)`; only lower-level helper
  functions stopped being public module exports.

CD-074 validation:

- targeted `rg -n "buildImageContextMenu|showImageContextMenu" frontend/src/main tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain inside
  `ipc_image_context_menu.cjs`.
- `bin/windie test frontend -- IpcImageContextMenuHandler IpcClipboardImageHandler`:
  passed; 2 suites and 11 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 112 to 110 after
  removing the image context menu helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, IPC payload, menu behavior, or
  persisted-data migration is required. The `show-image-context-menu` IPC
  handler remains the public Electron main boundary and still performs the same
  menu creation, popup, trusted image validation, and clipboard-copy behavior.

CD-075 validation:

- targeted `rg -n "hardenInstallAuthStatePath|normalizeInstallAuthState|shouldApplyPosixFileModes" frontend/src/main tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module references remain inside
  `ipc_install_auth_state.cjs`.
- `bin/windie test frontend -- IpcInstallAuthState IpcPersistenceConcurrency BackendConnection`:
  passed on rerun; 2 suites and 6 tests. The first combined attempt failed once
  in the existing persistence concurrency last-writer assertion, while
  `IpcPersistenceConcurrency` passed in isolation and the combined rerun passed.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 110 to 107 after
  removing the install-auth helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, auth-token shape, IPC payload, file-mode,
  or persisted-data migration is required. Install-auth state still normalizes
  `installToken`, `userId`, and `installId`, validates cached tokens through the
  backend identity endpoint, writes `install-auth.json` atomically, and hardens
  owner-only POSIX modes through the public load/save paths.

CD-076 validation:

- targeted `rg -n "BACKEND_QUERY_PAYLOAD_KEYS|normalizeQueryMessageId" frontend/src/main tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module query-runtime references remain; the remaining docs
  hit is a historical refactor report entry, not current API guidance.
- `bin/windie test frontend -- IpcQueryRuntime IpcMainBridge.query FrontendBackendWebsocketContract`:
  passed; 3 suites and 38 tests, then hit the existing Jest open-handle hang
  after completion.
- `npm run test:ci -- --forceExit FrontendBackendWebsocketContract` in
  `frontend`: passed; 1 suite and 9 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 107 to 105 after
  removing the query runtime helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, transport payload, IPC payload, or
  persisted-data migration is required. Backend query payload filtering still
  uses the same allowlist internally through `buildBackendQueryPayload(...)`,
  and renderer query ids still normalize through `prepareRendererQueryPayload(...)`.

CD-077 validation:

- targeted `rg -n "generateUserId|normalizeBackendPayload" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  no matches.
- `bin/windie test frontend -- FrontendBackendWebsocketContract IpcMainBridge.query WindieSdkManagedBackendSession`:
  passed; 3 suites and 37 tests, then hit the existing Jest open-handle hang
  after completion.
- `npm run test:ci -- --forceExit FrontendBackendWebsocketContract` in
  `frontend`: passed; 1 suite and 9 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 105 to 103 after
  deleting the runtime-helper user/payload exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, auth-token shape, IPC payload, websocket
  payload, or persisted-data migration is required. Electron main still resolves
  install auth before SDK startup, query payload shaping remains in
  `ipc_query_runtime.cjs`, settings/direct payload filtering remains in
  `ipc_backend_payload_contract.cjs`, and normal backend websocket sends route
  through the SDK managed agent session default payload filter.

CD-078 validation:

- targeted `rg -n "buildBackendSettingsPayload|createSettingsSyncRuntime" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  only private same-module settings-runtime references remain; historical
  refactor-report command snippets mention the old function name but are not
  current API guidance.
- `bin/windie test frontend -- IpcSettingsSyncRuntime IpcMainBridge.query IpcSettingsSync`:
  passed; 3 suites and 32 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 103 to 101 after
  deleting the settings sync helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, settings payload, IPC payload, websocket
  payload, or persisted-data migration is required. `sendSettingsUpdate(...)`
  still filters backend settings through `filterBackendPayload('update-settings',
  ...)`, preserves local MCP enablement before caching config, and waits for the
  same settings ACK gate through `createIpcSettingsSyncRuntime(...)`.

CD-079 validation:

- targeted `rg -n "normalizeToolName" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/release/**' --glob '!frontend/python-runtime/**'`:
  no external imports remain; matches are private same-module helper use or
  unrelated local helper names in sidecar/MCP/tool-manifest modules.
- `bin/windie test frontend -- MainProcessBootstrapRuntime IpcMainSdkRuntimeBoundary ModularRefactorCompletionBoundary SurfaceRuntime`:
  passed; 4 suites and 36 tests.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 101 to 100 after
  removing the tool-surface lifecycle helper export.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, local-tool payload, IPC payload,
  websocket payload, or persisted-data migration is required. Electron still
  installs the same `createElectronToolSurfaceLifecycle(...)` hook and still
  begins pointer-control leases for `mouse_control`/`scroll_control` and
  screenshot-capture leases for `screenshot`.

CD-080 validation:

- targeted `rg -n "ACTIVE_AGENT_LOOP_STOP_PHASES|getSupportedGlobalAgentStopShortcuts|normalizeGlobalAgentStopAccelerator" frontend/src tests/frontend docs scripts --glob '!frontend/node_modules/**' --glob '!frontend/dist/**' --glob '!frontend/.vite/**'`:
  no external imports remain; matches are private same-module helper use inside
  `agent_stop_shortcut_runtime.cjs`.
- `bin/windie test frontend -- AgentStopShortcutRuntime IpcMainBridge.lifecycle IpcStartupState SettingsSection AgentStopShortcut`:
  passed; 5 suites and 96 tests. Jest printed the existing open-handle warning
  after completion but exited successfully.
- `npm run audit:knip` in `frontend`: still exits 1 for broader existing
  dependency/export findings; unused exports dropped from 100 to 97 after
  removing the global stop shortcut helper exports.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.
- Migration note: no runtime, storage, settings, IPC, or persisted-data
  migration is required. `initializeAgentStopShortcutRuntime(...)` still
  projects the same `supportedAccelerators`, fallback registration behavior, and
  phase gating, while the public accelerator resolver remains available for
  main bootstrap callers.

## Inspection Notes

- The prior 25-commit campaign is complete and already removed many stale docs,
  SDK aliases, backend package exports, browser aliases, and rehydrate
  compatibility paths.
- The remaining architecture refactor plan shows one unchecked owner-split item:
  local backend bridge split into RPC mapping, host context, and status
  ownership. This is architecture debt, not automatically unused code.
- Current broad `fallback` hits are noisy. Each candidate must be classified
  before deletion because many are live resilience paths.
- CD-001 has no migration impact: the removed branch checked the same
  `WINDIE_FRONTEND_LOG_FILE` variable that the generic layer resolver already
  handles for the `frontend` layer.
- CD-002 migration note: VM run control events are in-memory service events and
  transcription gateway trace events are websocket stream messages, so no
  database migration is required for this slice. Clients relying on the
  underscore stream event spelling must use the canonical `trace-event` type.
- CD-002 validation exposed that the transcription websocket route's
  `SessionManagerDep` alias was being interpreted as a plain query parameter.
  The route now uses the explicit FastAPI dependency, and the lightweight route
  import shim returns a minimal session object for tests that import route
  packages under the shim.
- CD-003 has no runtime migration impact: it removes only a stale source
  comment after declarative handler bindings became the active registry path.
- CD-004 has no transport migration impact: the outgoing event type remains
  `llm-thought`, but the backend session now emits it through the typed stream
  event path instead of a raw dict.
- CD-005 has no transport migration impact: legacy dict event spellings remain
  normalized in API extraction helpers, while typed event producers now have
  only the canonical enum member names available.
- CD-006 has no transport migration impact: event payloads that are already
  plain dict/list/tuple values, dataclasses, Enums, or current Pydantic schema
  objects still serialize recursively; only Pydantic v1-style `.dict()`-only
  objects stop being coerced inside stream-event payloads.
- CD-007 has no runtime migration impact: prompt loading already targets only
  `system_prompt.txt`; the deleted files were inactive text snapshots preserved
  by tests/docs, not runtime prompt assets.
- CD-008 migration note: backend query-stream extraction now requires canonical
  stream event literals such as `streaming-response` and
  `assistant-message-full`; producers still emitting old `chunk` or
  `assistant_message_full` spellings must switch to canonical names.
- CD-009 has no runtime migration impact: it renames a backend test module,
  validation command references, and synthetic fixture IDs only.
- CD-010 has no persisted-data migration impact: backend prompt construction
  already used `build_provider_prompt(...)` for normal model invocation; SDK
  prompt preview now consumes the same typed provider prompt object.
- CD-011 has no runtime migration impact: it deletes a docs-only compatibility
  entrypoint after updating the docs hubs that linked to it.
- CD-012 has no runtime migration impact: it renames a docs-only reference page
  and updates internal docs links after the code path already required
  canonical event types.
- CD-013 has no runtime migration impact: it renames docs-only package-split
  references and updates internal docs links without changing API route exports,
  handlers, or tests.
- CD-014 has no persisted-data or API migration impact: InternVL still runs the
  same chat/generate fallback helper state machine, but the provider no longer
  exposes class-level forwarding methods for those helper functions.
- CD-015 has no runtime migration impact: it renames docs-only browser
  references and updates links after the shared backend/sidecar browser
  contract already rejected removed aliases.
- CD-016 has no database migration. It is a strictness change: persisted
  transcripts with incomplete tool-call/tool-output linkage now fail rehydrate
  instead of getting synthetic backend history. Current transcript projection
  must persist complete linkage.
- CD-017 has no storage migration impact. It removes a developer CLI alias from
  help and command dispatch; callers should use `bin/windie docs search <query>`
  or `bin/windie docs <query>`.
- CD-018 has no runtime or storage migration impact: it updates stale
  troubleshooting wording only.
- CD-019 has no storage migration impact. It changes runtime routing strictness:
  when a tool result includes `system_state_internal`, that field is the only
  source considered for session runtime state; current `system_state`-only tool
  results still update state when no internal field is present.
- CD-020 has no storage migration impact. Query payloads that omit `content`
  still receive the existing plain `<user_query>` wrapper in query ingress, but
  prompt construction no longer owns a second raw-query fallback.
- CD-021 has no runtime migration impact: it moves an import to the function
  that constructs the executor and preserves executor initialization behavior.
- CD-022 has no storage migration impact. It deletes renderer-only utilities
  that were no longer imported by production code; current memory listing,
  conversation resume, display projection, and backend rehydrate continue to
  route through `DesktopMemoryRuntimeClient`, SDK `chat_events`, SDK display
  projection, and the desktop continuity service.
- CD-023 has no runtime migration impact. It deletes an unused manual test
  harness and broken npm script; shell/process runtime behavior remains owned by
  the Python sidecar system tools and their sidecar/frontend bridge tests.
- CD-024 has no storage migration impact. It deletes an orphan renderer-side
  projection writer and in-memory retry queues that were no longer production
  imports; current durable transcript state remains owned by SDK conversation
  events, the desktop conversation store, the desktop continuity/library
  clients, and sidecar `chat_events`.
- CD-025 has no storage migration impact. It deletes only the store-side helper
  conversion path and stored-transcript bridge utilities that supported the
  already-deleted renderer projection writer; current store calls still use SDK
  conversation commands and sidecar `chat_events`.
- CD-026 has no storage or transport migration impact. It deletes only unused
  renderer presentation scanner helpers; response overlay entries still come
  from SDK/current-turn presentation messages in the minimal chat pill view
  model.
- CD-027 has no storage or transport migration impact. It deletes only
  renderer phase predicate exports that had no production consumers; loop UI
  state still uses `isOverlayAwaitingReplyPhase(...)`.
- CD-028 has no runtime, storage, or transport migration impact. It deletes
  only unused default export aliases while retaining the named exports used by
  production imports.
