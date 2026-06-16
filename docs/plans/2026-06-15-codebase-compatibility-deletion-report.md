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
- pending commit for CD-037.

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
