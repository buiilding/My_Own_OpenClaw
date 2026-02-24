---
summary: "WindieOS Refactor Plan (2026-02-23)"
read_when:
  - When planning refactor sequencing and risk reduction work.
  - When tracking duplication/dead-code and lint-audit deltas.
---

# WindieOS Refactor Plan (2026-02-23)

## Scope

- Goal: reduce duplication, dead-code drift, and route inconsistency without behavior regressions.
- Strategy: phased slices with measurable baselines and verification gates.

## Baseline Metrics (Snapshot: 2026-02-23)

### jscpd duplication

- Total clones: `234`
- Duplicated lines: `3506 (3.07%)`
- Duplicated tokens: `30490 (3.65%)`
- Source: `.audit/plan1/jscpd-report/jscpd-report.md`

### knip dead code snapshot

- Unused files: `5`
- Unused dependencies: `3`
- Unused devDependencies: `5`
- Unused exports: `44`
- Unused exported types: `23`
- Caveat: expected false positives from entrypoint/runtime wiring and tests outside frontend root. Keep audit signal, do not bulk-delete from this report alone.
- Source: `cd frontend && npm run audit:knip` terminal snapshot (2026-02-23)

### eslint react-compiler + deprecation audits

- `react-compiler` audit: no blocking errors in latest run.
- Deprecation warnings:
  - `ScriptProcessorNode` in `useVoiceMode` and `useWakewordDetection`
  - `onaudioprocess` in `useVoiceMode` and `useWakewordDetection`
- Source: `cd frontend && npm run lint:audit` terminal snapshot (2026-02-23)

### Slow test baseline

- Top slow frontend suite in latest run: `tests/frontend/ToolRunnerHook.test.ts` (~`687ms`)
- Source: `.audit/plan1/jest-report.json`

## Phased Roadmap

## Phase 1 (current slice)

- Frontend dedupe:
  - Extract transcript-session subscription to shared hook (`useSyncExternalStore`).
  - Extract shared memory context-menu/backdrop component.
- Backend API consolidation:
  - Shared health payload builders + exception-safe health-check wrapper for memory routes.
- Tests:
  - Keep episodic/semantic memory section coverage green.
  - Add backend helper coverage for normal/exception paths.

## Phase 2

- API route consolidation opportunities:
  - Align route-level health/reporting contracts across `memory/*`.
  - Pull repeated response-shape builders into route helpers where stable.
- File-size split strategy:
  - Keep files under ~500 LOC.
  - Split large UI containers by concern: data loaders, actions, view components.

### Phase 2 Execution Slice (Current Loop)

- Frontend dashboard dedupe:
  - Extract shared `Escape/Delete` context-menu keyboard shortcut hook used by both memory sections.
  - Keep behavior unchanged for menu close and delete actions.
- Test suite restructuring:
  - Split `tests/frontend/ToolRunnerHook.test.ts` (over LOC guideline) into smaller focused files with shared test harness utilities.
  - Land split outputs:
    - `tests/frontend/ToolRunnerHook.testUtils.ts`
    - `tests/frontend/ToolRunnerHook.events.test.ts`
    - `tests/frontend/ToolRunnerHook.callbacks.test.ts`
  - Preserve all current assertions while reducing per-file complexity.
- Success checks:
  - `cd frontend && npm run test:ci -- tests/frontend/ToolRunnerHook.events.test.ts tests/frontend/ToolRunnerHook.callbacks.test.ts`
  - `cd frontend && npm run test:ci -- tests/frontend/SemanticMemorySectionDelete.test.jsx tests/frontend/EpisodicMemorySectionDelete.test.jsx`
  - `cd frontend && npm run lint`

## Phase 3

- Docs maintenance:
  - Keep planning docs synchronized with shipped behavior.
  - Add/update `read_when` hints for cross-cutting docs.
- Tests + comments for tricky paths:
  - Add regression tests for every extracted shared helper.
  - Keep comments brief; only for non-obvious control flow/state invariants.

### Phase 3 Execution Slice (Current Loop)

- Dead-code cleanup (`knip`-driven, low-risk):
  - Remove unused placeholder component `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx` if no runtime references remain.
  - Update docs references that still point to removed file.
- Regression coverage completion:
  - Add direct unit tests for `useMemoryContextMenuHotkeys` (`Escape` closes; `Delete` triggers delete only with active menu/target).
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/useMemoryContextMenuHotkeys.test.js`
  - `cd frontend && npm run test:ci -- tests/frontend/SemanticMemorySectionDelete.test.jsx tests/frontend/EpisodicMemorySectionDelete.test.jsx`
  - `cd frontend && npm run audit:knip` (expect one fewer unused file finding)

## Phase 4

- Dependency/tool upgrades:
  - Track `eslint-plugin-react-compiler`, `knip`, and lint plugins for stable releases.
  - Run quick health checks before upgrades: release recency, maintenance activity, adoption.
- File restructuring:
  - Co-locate reusable dashboard hooks/components under feature-owned `hooks/` and `components/shared/`.

### Phase 4 Execution Slice (Current Loop)

- `knip`-driven dependency cleanup:
  - remove true-positive unused runtime dependencies from `frontend/package.json` when no code references exist.
  - remove low-risk unused dev dependency (`baseline-browser-mapping`) when only transitive usage remains.
- `knip` signal quality improvements:
  - codify intentional/tooling-only dependencies in `frontend/knip.json` using explicit ignore list (for CLI-invoked lint plugins and manual codegen tooling).
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/useMemoryContextMenuHotkeys.test.js tests/frontend/ToolRunnerHook.events.test.ts tests/frontend/ToolRunnerHook.callbacks.test.ts`
  - `cd frontend && npm run audit:knip` (expect dependency findings count reduction)

## Phase 5

- Slow-test rewrite plan:
  - Profile `ToolRunnerHook` suite and remove heavy setup duplication.
  - Prefer targeted fixtures and shared test utilities.
  - Keep runtime assertions while reducing repeated orchestration scaffolding.
- Modern React pattern migration:
  - Replace event-listener `useEffect` state mirrors with stable subscription hooks.
  - Reduce unnecessary `useEffect` usage where render-derivation/memoized selectors are sufficient.

## Phase 6

- `knip` signal hardening (type/export surface):
  - Convert `unused exported types` findings into internal file-local types where no cross-module imports exist.
  - Remove unused re-export aliases in service façade files when the canonical type module remains exported.
  - Keep runtime behavior unchanged; scope is API surface and audit-noise reduction.

### Phase 6 Execution Slice (Current Loop)

- Type de-export cleanup (`knip` `unused exported types` set):
  - de-export 17 flagged type/interface symbols across chat/infrastructure/transcript utilities where usage is local-only.
- Export cleanup:
  - remove unused re-exported types from `ToolExecutionService` (`ToolExecutionOptions`, `ToolExecutionCallbacks`).
  - de-export transcript session storage key constant (`TRANSCRIPT_SESSION_STORAGE_KEY`) and update tests to use explicit fixture key value.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/TranscriptStorage.test.ts tests/frontend/TranscriptWriter.test.ts tests/frontend/ToolExecutionService.test.ts`
  - `cd frontend && npm run audit:knip` (expect remaining `unused exported types` section to clear)

## Phase 7

- `knip` export-surface cleanup (test-only helper exports):
  - remove unused helper exports from CJS utility modules where runtime entrypoints stay unchanged.
  - internalize config helper exports that are test-only and keep runtime callers on `loadConfigFromStorage`/`saveConfigToStorage`.
  - update tests to use local fixtures and behavior-based assertions instead of private helper imports.

### Phase 7 Execution Slice (Current Loop)

- Query payload export pruning:
  - remove helper-only exports from `frontend/src/main/query_payload_builder.cjs` and keep only `buildQueryPayloadContent` in module exports.
- Config helper export pruning:
  - de-export test-only symbols in `frontend/src/renderer/utils/configStorage.js`:
    - `DEFAULT_FRONTEND_CONFIG`
    - `hasStoredConfig`
    - `getConfigVersion`
    - `clearConfigStorage`
  - de-export `isFrontendConfigOnly` from `frontend/src/renderer/utils/configFilter.js`.
  - update `tests/frontend/configStorage.test.js` and `tests/frontend/configFilter.test.js` to use fixture constants + public behavior checks.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/QueryPayloadBuilder.test.cjs tests/frontend/configStorage.test.js tests/frontend/configFilter.test.js`
  - `cd frontend && npm run audit:knip` (expect unused exports count reduction)

## Phase 8

- `knip` export-surface cleanup (chat helper internals):
  - internalize helper exports that are only used inside their module.
  - keep runtime-facing entrypoints exported (`resolveMessageSendUiBehavior`, `buildOutgoingMessage`, `buildTokenCountItems`, selector roots).
  - migrate tests from private helper imports to public behavior assertions.

### Phase 8 Execution Slice (Current Loop)

- Chat policy/helper export pruning:
  - de-export `defaultReturnToChatboxPolicyForSurface` and `resolveReturnToChatboxOnSend` from `messageSendUiPolicy.ts`.
  - de-export `selectStreamTracking` from `chatSelectors.js`.
  - de-export `normalizeMessageForSend` from `messageInput.js`.
  - de-export `formatTokenCount` and `getActiveConversationTokenCount` from `tokenCounts.js`.
- Test updates:
  - update `MessageSendUiPolicy`, `ChatSelectors`, `MessageInputUtils`, and `TokenCounts` tests to validate behavior through public exported APIs only.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/MessageSendUiPolicy.test.ts tests/frontend/ChatSelectors.test.js tests/frontend/MessageInputUtils.test.js tests/frontend/TokenCounts.test.js`
  - `cd frontend && npm run audit:knip` (expect unused exports count reduction)

## Phase 9

- `knip` export/dead-code cleanup (chatbox/logger):
  - remove dead chatbox presentation helper module that has no runtime imports.
  - internalize logger helper export that is only used inside logger module/tests.
  - keep behavior coverage by validating public logger APIs and existing chatbox component tests.

### Phase 9 Execution Slice (Current Loop)

- Dead module removal:
  - delete `frontend/src/renderer/features/chat/utils/chatBoxPresentation.js`.
  - delete `tests/frontend/ChatBoxPresentation.test.js` (dead-module-only test).
  - update docs references (folder structure) for removed module.
- Logger helper export pruning:
  - de-export `shortCorrelationId` in `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`.
  - update logger test assertions to validate truncation/missing-id behavior via `logToolStart` return value.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/ToolExecutionLogger.test.ts tests/frontend/ChatBoxResponse.test.jsx`
  - `cd frontend && npm run audit:knip` (expect unused exports count reduction)

## Phase 10

- `knip` export-surface cleanup (test-only service/dashboard helpers):
  - internalize dashboard parsing constants/helpers used only within module implementation.
  - internalize formatter/capture helper exports used only by module internals and tests.
  - update tests to validate behavior through public APIs (`parseMemoriesToMessages`, `buildConversationKey`, `formatToolOutputMessage`, `formatBundledToolOutputMessage`, `captureAfterTool`, `ensureAutoCapture`).

### Phase 10 Execution Slice (Current Loop)

- Export/internal API cleanup:
  - de-export `UNASSIGNED_CONVERSATION_KEY` and `parseMemoryContent` from `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`.
  - de-export `formatSequentialStateXml` from `frontend/src/renderer/infrastructure/services/MessageFormatter.ts`.
  - de-export `getWaitSeconds`, `extractCaptureFromResult`, and `applyCaptureToResult` from `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`.
- Test-surface updates:
  - migrate tests away from private helper imports and keep behavioral assertions on public entrypoints.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/EpisodicMemoryUtils.test.js tests/frontend/MessageFormatter.test.ts tests/frontend/ToolExecutionCapture.test.ts`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip` (expect unused exports count reduction)

## Phase 11

- `knip` export-surface cleanup (wakeword bridge final pass):
  - remove private wakeword lifecycle exports that are not part of runtime entrypoint usage.
  - keep lifecycle behavior coverage via public bridge initialization + IPC handlers + process lifecycle hook paths.

### Phase 11 Execution Slice (Current Loop)

- Export cleanup:
  - remove `startWakewordService` and `stopWakewordService` from `frontend/src/main/wakeword_bridge.cjs` module exports.
- Test migration:
  - update `tests/frontend/WakewordBridge.test.cjs` to validate restart/cleanup behavior using public paths only:
    - `initializeWakewordBridge(...)`
    - `wakeword-enable` / `wakeword-disable` IPC handlers
    - captured `process.on('beforeExit', ...)` cleanup callback
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/WakewordBridge.test.cjs`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip` (expect unused exports count reduction to zero)

## Phase 12

- `jscpd` duplication cleanup (dashboard settings toggles):
  - extract repeated toggle-control JSX in `SettingsSection` to one shared renderer component.
  - keep toggle behavior identical for wakeword, voice mode, speech replies, and query screenshot controls.
  - add focused SettingsSection regressions for toggle update wiring and wakeword suppression messaging.

### Phase 12 Execution Slice (Current Loop)

- Frontend dedupe:
  - extract `SettingsToggleField` in `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx` and replace repeated toggle blocks.
- Test coverage:
  - add `tests/frontend/SettingsSection.test.jsx` for:
    - wakeword toggle dispatch to `setWakewordEnabled`
    - `onConfigChange` payload wiring for voice/speech/screenshot toggles
    - suppressed wakeword helper messaging visibility
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/SettingsSection.test.jsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 13

- `jscpd` duplication cleanup (message prop typing):
  - remove repeated message shape `PropTypes` definitions in `MessageList.jsx`.
  - keep runtime/message rendering behavior unchanged.

### Phase 13 Execution Slice (Current Loop)

- Frontend dedupe:
  - extract shared message-shape prop type constant in `frontend/src/renderer/features/chat/components/MessageList.jsx`.
  - reuse the shared constant in both `MessageItem.propTypes` and `MessageList.propTypes`.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/MessageListClasses.test.js tests/frontend/MessageListThinkingDisplay.test.jsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 14

- `jscpd` duplication cleanup (chat overlay phase listener):
  - extract repeated `response-overlay-phase` payload normalization/subscription logic shared by `ChatBox` and `ChatBoxResponse`.
  - keep overlay behavior unchanged for awaiting/streaming/complete/error phase transitions.

### Phase 14 Execution Slice (Current Loop)

- Frontend dedupe:
  - add shared response-overlay phase subscription helper under `frontend/src/renderer/features/chat/utils/`.
  - add shared overlay frame-size normalization helper under `frontend/src/renderer/features/chat/utils/`.
  - replace duplicate listener blocks in:
    - `frontend/src/renderer/features/chat/components/ChatBox.jsx`
    - `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- Regression coverage:
  - add focused helper tests verifying phase normalization/listener cleanup and frame-size rounding behavior.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/OverlayPhaseListener.test.js tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx tests/frontend/ChatBoxResponse.test.jsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 15

- `jscpd` duplication cleanup (landing privacy highlights):
  - replace repeated highlight-item JSX in `PrivacySection` with mapped data.
  - keep landing copy and icon semantics unchanged.

### Phase 15 Execution Slice (Current Loop)

- Frontend dedupe:
  - refactor `frontend/src/landing/components/PrivacySection.jsx` highlight list to data-driven rendering for:
    - Local-First
    - Transparent
    - Your Choice
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/landing/LandingPage.test.jsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 16

- `jscpd` duplication cleanup (landing section intros):
  - extract shared badge/heading/description JSX used by landing sections.
  - start with `WhySection` and `PrivacySection` to reduce duplicate section-intro markup.
  - keep visual copy, heading line breaks, and section-level layout classes unchanged.

### Phase 16 Execution Slice (Current Loop)

- Frontend dedupe:
  - add shared landing section-intro component under `frontend/src/landing/components/`.
  - migrate intro markup in:
    - `frontend/src/landing/components/WhySection.jsx`
    - `frontend/src/landing/components/PrivacySection.jsx`
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/landing/LandingPage.test.jsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 17

- `jscpd` duplication cleanup (voice audio-capture lifecycle):
  - extract shared cleanup helpers for ScriptProcessor/source/media-stream/audio-context teardown.
  - reuse helpers in both voice hooks:
    - `useVoiceMode`
    - `useWakewordDetection`
  - keep hook API and runtime behavior unchanged.
- Deprecation/react-compiler audit check:
  - run `npm run lint:audit` after refactor and record current deprecation warning status.

### Phase 17 Execution Slice (Current Loop)

- Frontend dedupe:
  - add shared voice utility module under `frontend/src/renderer/features/voice/utils/` for audio-capture teardown helpers.
  - replace duplicated cleanup blocks in:
    - `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
    - `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- Regression coverage:
  - add focused utility tests for cleanup helpers (safe close + ref reset behavior).
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/VoiceModeHook.test.ts tests/frontend/WakewordDetectionHook.test.ts tests/frontend/VoiceAudioCleanup.test.ts`
  - `cd frontend && npm run lint:audit`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 18

- `jscpd` duplication cleanup (transcript immediate-store paths):
  - extract shared internal helpers for session-info resolution and immediate store-or-queue retry flow.
  - apply to `recordUserMessage`, `recordAssistantMessage`, and `recordToolMessage` in:
    - `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
  - keep transcript payload shape, queueing behavior, and warning semantics unchanged.

### Phase 18 Execution Slice (Current Loop)

- Frontend dedupe:
  - refactor `TranscriptWriter.ts` repeated resolve/store/catch queue blocks to shared internal helpers.
- Verification checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/TranscriptWriter.test.ts tests/frontend/TranscriptStorage.test.ts tests/frontend/TranscriptSessionState.test.ts`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 19

- `jscpd` duplication cleanup (Electron main Python executable resolution):
  - extract shared runtime helper for Python executable path resolution into:
    - `frontend/src/main/runtime_paths.cjs`
  - reuse helper from:
    - `frontend/src/main/local_backend_bridge.cjs`
    - `frontend/src/main/wakeword_bridge.cjs`
  - preserve current resolution order and platform fallback semantics.

### Phase 19 Execution Slice (Current Loop)

- Main-process dedupe:
  - centralize `WINDIE_PYTHON_PATH`/bundled-runtime/conda/fallback resolution logic in runtime-path helper.
  - keep local backend bridge path caching behavior unchanged.
- Verification checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/LocalBackendBridge.test.cjs tests/frontend/WakewordBridge.test.cjs`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 20

- `jscpd` duplication cleanup (chat hook store selector blocks):
  - extract shared chat-store selector helper for common message-send/stream actions.
  - reuse helper in:
    - `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
    - `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
  - preserve message send/stream behavior and hook contracts.

### Phase 20 Execution Slice (Current Loop)

- Frontend dedupe:
  - centralize shared chat action selectors (`addMessage`, `updateMessage`, `setIsSending`, `setThinkingStatus`) in a dedicated hook helper.
  - update sender/stream hooks to consume the shared selector helper.
- Verification checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/ChatMessageSender.test.tsx tests/frontend/ChatStreamThinkingStatus.test.tsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 21

- `jscpd` duplication cleanup (voice audio-capture ref declarations):
  - extract shared hook for audio-capture refs (`MediaStream`, `AudioContext`, source node, script node).
  - reuse helper in:
    - `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
    - `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
  - preserve voice-mode and wakeword runtime behavior.

### Phase 21 Execution Slice (Current Loop)

- Frontend dedupe:
  - add shared voice hook helper for audio-capture node refs.
  - remove duplicated ref declarations in both voice hooks.
- Verification checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/VoiceModeHook.test.ts tests/frontend/WakewordDetectionHook.test.ts tests/frontend/VoiceAudioCleanup.test.ts`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 22

- `jscpd` duplication cleanup (settings panel shared item styles):
  - extract shared CSS selector blocks for duplicated item visual styles in:
    - `frontend/src/renderer/styles/SettingsPanel.css`
  - consolidate shared declarations for:
    - `.model-item` + `.memory-item`
    - shared `:hover` + `.active` states
  - keep existing settings/memory panel rendering behavior unchanged.

### Phase 22 Execution Slice (Current Loop)

- Frontend dedupe:
  - merge duplicated item style/state declarations into shared selector groups.
  - retain section-specific declarations where they differ.
- Verification checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/SettingsSection.test.jsx tests/frontend/SemanticMemorySection.test.jsx tests/frontend/EpisodicMemorySectionDelete.test.jsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:knip`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 23

- `jscpd` duplication cleanup (API formatter required-field handling):
  - extract shared required-field + missing-fields warning helpers in:
    - `backend/src/api/processing/formatters/base.py`
  - reuse helper paths in:
    - `backend/src/api/processing/formatters/chunk.py`
    - `backend/src/api/processing/formatters/thinking.py`
    - `backend/src/api/processing/formatters/assistant_message.py`
    - `backend/src/api/processing/formatters/tool_call.py`
    - `backend/src/api/processing/formatters/tool_output.py`
  - preserve outgoing payload contracts and warning semantics.

### Phase 23 Execution Slice (Current Loop)

- Backend dedupe:
  - centralize required-field warning flow in formatter base.
  - remove repeated per-formatter required-content checks where behavior is identical.
  - keep tool-call/tool-output validation behavior unchanged (`tool_name` + params/output guards).
- Verification checks:
  - `pytest tests/backend/test_formatters.py tests/backend/test_outgoing_schema_contract.py tests/backend/test_response_formatter.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 24

- `jscpd` duplication cleanup (core exception + validation helpers):
  - extract shared metadata merge helper for repeated exception constructor patterns in:
    - `backend/src/core/infrastructure/exceptions.py`
  - extract shared Pydantic error-detail mapping helper in:
    - `backend/src/core/validation/validators.py`
  - preserve exception metadata semantics and validation error payloads.

### Phase 24 Execution Slice (Current Loop)

- Backend dedupe:
  - centralize conditional exception metadata merge behavior used by LLM/memory/trust-boundary exception classes.
  - centralize repeated `PydanticValidationError` field-path/message extraction.
  - keep exception error codes, attributes, and logger behavior unchanged.
- Verification checks:
  - `pytest tests/backend/test_exceptions.py tests/backend/test_validation_utils.py tests/backend/test_api_errors.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 25

- `jscpd` duplication cleanup (exception constructor specialization):
  - extract shared optional-field metadata helper and trust-boundary metadata helper in:
    - `backend/src/core/infrastructure/exceptions.py`
  - centralize default error-code behavior for LLM + memory exception families.
  - reduce repeated constructor blocks in:
    - `LLMAPIError`, `LLMRateLimitError`
    - `MemoryError`, `MemoryStoreError`, `EmbeddingError`
    - `InputSizeLimitError`, `ParseTimeoutError`, `ParseValidationError`
  - preserve existing error-code values, attributes, and metadata semantics.

### Phase 25 Execution Slice (Current Loop)

- Backend dedupe:
  - keep exception public API stable while collapsing repeated constructor paths.
  - retain existing handling for falsey optional metadata values (`0`, `None`, `[]`).
- Verification checks:
  - `pytest tests/backend/test_exceptions.py tests/backend/test_validation_utils.py tests/backend/test_api_errors.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 26

- `jscpd` duplication cleanup (API schema re-export surface):
  - remove duplicated schema export lists between:
    - `backend/src/api/schema.py`
    - `backend/src/api/schemas/__init__.py`
  - keep `backend/src/api/schema.py` as backward-compatible import path.
  - centralize export membership in one source of truth (`api.schemas.__all__`).
  - preserve all existing schema symbols and import contracts used by handlers/tests.

### Phase 26 Execution Slice (Current Loop)

- Backend dedupe:
  - make `backend/src/api/schema.py` a thin compatibility facade that reuses `api.schemas` export surface.
  - avoid symbol drift by binding compatibility module `__all__` directly to `api.schemas.__all__`.
- Verification checks:
  - `pytest tests/backend/test_api_handlers.py tests/backend/test_websocket_message_handler.py tests/backend/test_outgoing_schema_contract.py tests/backend/test_api_contract_registry.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 27

- `jscpd` duplication cleanup (tool preparation flow):
  - extract shared coordinate-resolution invoke helper in:
    - `backend/src/agent/tools/preparation/preparer.py`
  - reuse shared helper for bundle and single-call preparation paths to remove repeated
    `resolve_tool_with_coordinates(...)` argument wiring.
  - preserve existing error handling, request/bundle identifiers, and timing logs.

### Phase 27 Execution Slice (Current Loop)

- Backend dedupe:
  - keep metadata/registration flow unchanged while collapsing duplicate coordinate-resolution call wiring.
  - avoid behavior changes in bundle short-circuit-on-error and single-call error return contract.
- Verification checks:
  - `pytest tests/backend/test_tool_preparer.py tests/backend/test_coordinate_scaling.py tests/backend/test_coordinate_contract.py tests/backend/test_vision_coordinates.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 28

- `jscpd` duplication cleanup (remote tool export surface):
  - remove duplicated remote-tool class import blocks between:
    - `backend/src/tools/remote_tools/__init__.py`
    - `backend/src/tools/remote_tools/registry.py`
  - keep `backend/src/tools/remote_tools/__init__.py` as stable public export surface.
  - centralize remote-tool class import list in registry and re-export from package init.

### Phase 28 Execution Slice (Current Loop)

- Backend dedupe:
  - make `remote_tools.__init__` source class symbols from `remote_tools.registry`.
  - preserve all existing exports used by `backend/src/tools/remote.py` and tests.
- Verification checks:
  - `pytest tests/backend/test_remote_tools.py tests/backend/test_browser_remote_tool.py tests/backend/test_remote_tool_contract.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 29

- `jscpd` duplication cleanup (LLM completion request kwargs):
  - extract shared request-kwargs builder in:
    - `backend/src/agent/llm/llm_stream_processor.py`
  - reuse builder for both:
    - `_iter_completion_stream`
    - `_get_completion_response`
  - preserve prompt cache key normalization and existing completion transport args.

### Phase 29 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicate native completion request-kwargs assembly logic.
  - keep stream/non-stream branch behavior unchanged for tool turns.
- Verification checks:
  - `pytest tests/backend/test_llm_stream_processor.py tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 30

- `jscpd` duplication cleanup (session tool-result delegation wrappers):
  - simplify pass-through delegation methods in:
    - `backend/src/agent/session/session.py`
  - replace duplicated explicit argument lists with keyword-forwarding wrappers to:
    - `ToolResultHandler.process_frontend_tool_result`
    - `ToolResultHandler.process_frontend_tool_bundle_result`
  - preserve websocket/API handler call behavior and result-routing semantics.

### Phase 30 Execution Slice (Current Loop)

- Backend dedupe:
  - keep delegation behavior identical while reducing wrapper duplication in `AgentSession`.
  - preserve API handler keyword-call contract for tool-result and tool-bundle-result messages.
- Verification checks:
  - `pytest tests/backend/test_api_handlers.py tests/backend/test_websocket_message_handler.py tests/backend/test_tool_result_handler.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 31

- `jscpd` duplication cleanup (LLM stream/non-stream request path signatures):
  - remove duplicated completion-call signatures in:
    - `backend/src/agent/llm/llm_stream_processor.py`
  - build native completion kwargs once in `get_response` and reuse for:
    - non-stream completion call
    - stream iteration call
  - preserve tool-turn branching and prompt cache key behavior.

### Phase 31 Execution Slice (Current Loop)

- Backend dedupe:
  - remove redundant `_get_completion_response(...)` wrapper.
  - keep event emission order and payload capture semantics unchanged.
- Verification checks:
  - `pytest tests/backend/test_llm_stream_processor.py tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 32

- `jscpd` duplication cleanup (tool schema shared field definitions):
  - extract shared schema-field helpers in:
    - `backend/src/tools/schema_fields.py`
  - replace repeated explanation field declarations in:
    - `backend/src/tools/system/schemas.py`
    - `backend/src/tools/filesystem/schemas.py`
  - replace repeated post-action wait field declarations in:
    - `backend/src/tools/computer/schemas.py`
  - preserve schema defaults and field descriptions.

### Phase 32 Execution Slice (Current Loop)

- Backend dedupe:
  - keep tool argument contracts unchanged while reducing repeated Field blocks.
  - avoid touching browser schema contracts in this slice.
- Verification checks:
  - `pytest tests/backend/test_remote_tools.py tests/backend/test_browser_remote_tool.py tests/backend/test_remote_tool_contract.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 33

- `jscpd` duplication cleanup (LLM provider request kwargs):
  - extract shared provider request-kwargs builder in:
    - `backend/src/llm/client.py`
  - reuse for both:
    - `LiteLLMClient.get_completion_response`
    - `LiteLLMClient.get_completion_stream`
  - preserve prompt-cache key normalization and provider call contracts.

### Phase 33 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicated `request_kwargs` assembly blocks in `LiteLLMClient`.
  - keep stream error-event behavior and non-stream exception mapping unchanged.
- Verification checks:
  - `pytest tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_stream_processor.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 34

- `jscpd` duplication cleanup (LLM optional-field exception constructors):
  - extract shared optional-field constructor base for LLM error subclasses in:
    - `backend/src/core/infrastructure/exceptions.py`
  - reuse for both:
    - `LLMAPIError`
    - `LLMRateLimitError`
  - preserve error-code values, metadata include rules, and public attributes.

### Phase 34 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicated optional-field constructor wiring in LLM exception subclasses.
  - keep existing constructor signatures and default error messages unchanged.
- Verification checks:
  - `pytest tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py tests/backend/test_parser_validation.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 35

- `jscpd` duplication cleanup (scoped exception constructor path):
  - extract shared scoped-constructor base in:
    - `backend/src/core/infrastructure/exceptions.py`
  - reuse for both:
    - `LLMError` (`model` scope)
    - `MemoryError` (`user_id` scope)
  - preserve constructor signatures, default error-code behavior, metadata include rules, and public attributes.

### Phase 35 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicated scoped constructor metadata/error-code wiring in `LLMError` and `MemoryError`.
  - keep optional-field subclass wiring (`LLMAPIError`, `LLMRateLimitError`, `MemoryStoreError`) behavior unchanged.
- Verification checks:
  - `pytest tests/backend/test_exceptions.py tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 36

- `jscpd` duplication cleanup (OpenRouter request param assembly):
  - extract shared request-param builder wrapper in:
    - `backend/src/llm/providers/openrouter.py`
  - reuse for both:
    - `OpenRouterProvider.get_completion`
    - `OpenRouterProvider._stream_internal`
  - preserve prompt-cache key forwarding, stream usage reporting, and existing provider error semantics.

### Phase 36 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicated `_build_request_params(...)` argument assembly in OpenRouter provider completion paths.
  - keep stream chunk parsing and `stream_options` behavior unchanged.
- Verification checks:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py`
  - `cd frontend && npm run audit:jscpd` (expect clone reduction)

## Phase 37

- `jscpd` duplication cleanup (provider stream flags):
  - extract shared stream+usage param helper in:
    - `backend/src/llm/providers/base.py`
  - reuse across provider stream paths:
    - `AnthropicProvider._stream_internal`
    - `GeminiProvider._stream_internal`
    - `KimiCodingProvider._stream_internal`
    - `LocalLLMProvider._stream_internal`
    - `MistralProvider._stream_internal`
    - `OpenAIProvider._stream_internal`
    - `OpenRouterProvider._build_completion_params`
  - preserve existing stream usage reporting (`include_usage`) and provider-specific params (e.g., `custom_llm_provider`).

### Phase 37 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicated stream flag and usage-option assignments (`stream`, `stream_options`) in provider streaming paths.
  - keep stream event parsing, provider-specific request params, and error semantics unchanged.
- Verification checks:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py`
  - `cd frontend && npm run audit:jscpd` (track duplicate-volume delta; note repository-wide churn can shift global totals)

## Phase 38

- `jscpd` duplication cleanup (provider text-stream loop):
  - extract shared stream loop helper in:
    - `backend/src/llm/providers/base.py`
  - reuse for simple text-stream providers:
    - `OpenAIProvider._stream_internal`
    - `MistralProvider._stream_internal`
    - `LocalLLMProvider._stream_internal`
    - `OpenRouterProvider._stream_internal`
  - preserve stream usage recording, delta extraction, and emitted `ChunkEvent` semantics.

### Phase 38 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicated `litellm.acompletion` + chunk iteration + content-yield loop blocks in text-stream providers.
  - keep provider-specific request-param wiring intact (`_build_request_params`, `custom_llm_provider`, prompt-cache key forwarding).
- Verification checks:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py`
  - `cd frontend && npm run audit:jscpd` (track clone/duplicate delta; annotate global file-set churn when present)

## Phase 39

- `jscpd` duplication cleanup (provider thinking-stream loop):
  - extract shared thinking+text stream helper in:
    - `backend/src/llm/providers/base.py`
  - reuse for provider streaming paths with thinking deltas:
    - `AnthropicProvider._stream_internal`
    - `GeminiProvider._stream_internal`
  - preserve usage capture, thinking-event emission, and assistant chunk emission semantics.

### Phase 39 Execution Slice (Current Loop)

- Backend dedupe:
  - remove duplicated thinking-aware stream iteration blocks in Anthropic/Gemini providers.
  - keep provider-specific request params and model-specific thinking options unchanged.
- Verification checks:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py`
  - `cd frontend && npm run audit:jscpd` (track clone/duplicate delta; annotate file-set churn when present)

### Phase 5 Execution Slice (Current Loop)

- `knip` export-surface cleanup (`true-positive`, low-risk):
  - Remove dead legacy hook exports with no runtime/test imports:
    - `useAppContext` (`frontend/src/renderer/app/providers/AppContextHooks.js`)
    - `useChatContext` (`frontend/src/renderer/app/providers/ChatContext.jsx`)
  - Remove unused CJS constants from module exports:
    - `DEFAULT_BACKEND_HOST`
    - `DEFAULT_BACKEND_PORT`
  - De-export internal-only helper/type symbols that are only file-local:
    - `getBackendHttpUrl`
    - `DisplayBounds`
    - `TranscriptSessionState`
    - `ToolCallPayloadLike`
    - `ToolBundlePayloadLike`
    - `ToolOutputPayloadLike`
- Docs sync:
  - Update folder structure notes that still reference removed legacy hooks.
- Success checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/AppProvider.test.tsx tests/frontend/configStorage.test.js tests/frontend/TranscriptSessionState.test.ts tests/frontend/ChatStreamFormatting.test.ts tests/frontend/ArtifactUploader.test.ts tests/frontend/BackendEndpoints.test.cjs`
  - `cd frontend && npm run audit:knip` (expect export/type findings count reduction)

## Tracking

- Update this plan per phase completion with:
  - metric deltas (`jscpd`, `knip`, lint audits)
  - shipped files
  - test-gate outcome
  - unresolved risks/debt carried forward

## Phase 1 Outcome (2026-02-23)

- jscpd delta after Phase 1 extraction work:
  - clones: `234 -> 230`
  - duplicated lines: `3506 -> 3410`
  - duplicated tokens: `30490 -> 29922`
- Verification:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run lint:audit`
  - `cd frontend && npm run test:ci`
  - `pytest tests/backend/test_memory_routes.py`

## Phase 2 Outcome (2026-02-23)

- Dashboard dedupe shipped:
  - shared context-menu keyboard shortcut hook extracted and reused in episodic + semantic memory sections.
- Slow/large test restructure shipped:
  - replaced `tests/frontend/ToolRunnerHook.test.ts` with:
    - `tests/frontend/ToolRunnerHook.testUtils.ts`
    - `tests/frontend/ToolRunnerHook.events.test.ts`
    - `tests/frontend/ToolRunnerHook.callbacks.test.ts`
- jscpd delta after Phase 2 extraction work:
  - clones: `230 -> 225`
  - duplicated lines: `3410 -> 3325`
  - duplicated tokens: `29922 -> 29329`
- Verification:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/ToolRunnerHook.events.test.ts tests/frontend/ToolRunnerHook.callbacks.test.ts`
  - `cd frontend && npm run test:ci -- tests/frontend/SemanticMemorySectionDelete.test.jsx tests/frontend/EpisodicMemorySectionDelete.test.jsx`
  - `cd frontend && npm run test:ci`
  - `cd frontend && npm run audit:jscpd`
  - `cd frontend && npm run audit:knip` (findings unchanged; still requires triage)

## Phase 3 Outcome (2026-02-23)

- Dead-code cleanup shipped:
  - removed unused placeholder component `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`.
  - removed stale reference from `frontend/src/renderer/folder_structure.md`.
  - removed stale knip ignore entry for the deleted file from `frontend/knip.json`.
- Regression coverage completion shipped:
  - added `tests/frontend/useMemoryContextMenuHotkeys.test.js` covering Escape/Delete/no-menu behavior for the shared hook.
- Verification:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run test:ci -- tests/frontend/useMemoryContextMenuHotkeys.test.js`
  - `cd frontend && npm run test:ci -- tests/frontend/SemanticMemorySectionDelete.test.jsx tests/frontend/EpisodicMemorySectionDelete.test.jsx`
  - `cd frontend && npm run audit:knip` (unused files section remained absent; export/dependency/type findings unchanged)

## Phase 4 Outcome (2026-02-23)

- Dependency cleanup shipped:
  - removed unused runtime deps from `frontend/package.json`: `clipboardy`, `pngjs`, `systeminformation`.
  - removed unused dev dep from `frontend/package.json`: `baseline-browser-mapping`.
  - lockfile regenerated via targeted npm uninstall commands.
- `knip` calibration shipped:
  - added `ignoreDependencies` entries in `frontend/knip.json` for intentional tooling-only/manual-use packages:
    - `@testing-library/react`
    - `eslint-plugin-deprecation`
    - `eslint-plugin-react-compiler`
    - `json-schema-to-typescript`
- knip dependency findings delta:
  - unused dependencies: `3 -> 0`
  - unused devDependencies: `5 -> 0`
  - remaining findings (unchanged category): `unused exports (42)`, `unused exported types (23)`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/useMemoryContextMenuHotkeys.test.js tests/frontend/ToolRunnerHook.events.test.ts tests/frontend/ToolRunnerHook.callbacks.test.ts` (pass)
  - `cd frontend && npm run audit:knip` (dependency findings removed; command still non-zero from export/type findings)

## Phase 5 Outcome (2026-02-23)

- Export-surface cleanup shipped:
  - removed unused legacy hook exports:
    - `useAppContext` from `frontend/src/renderer/app/providers/AppContextHooks.js`
    - `useChatContext` from `frontend/src/renderer/app/providers/ChatContext.jsx`
  - removed unused CJS exports from `frontend/src/main/backend_endpoints.cjs`:
    - `DEFAULT_BACKEND_HOST`
    - `DEFAULT_BACKEND_PORT`
  - de-exported internal-only helper/type symbols:
    - `getBackendHttpUrl`
    - `DisplayBounds`
    - `TranscriptSessionState`
    - `ToolCallPayloadLike`
    - `ToolBundlePayloadLike`
    - `ToolOutputPayloadLike`
- Regression-assertion integrity fixes shipped:
  - updated display-selection related tests to use explicit storage-key fixtures after storage-key de-export, preserving meaningful assertions.
  - updated stale AppProvider comment that referenced removed legacy `useAppContext`.
  - updated folder-structure docs comments for removed hook exports.
- knip findings delta after Phase 5 slice:
  - unused exports: `42 -> 34`
  - unused exported types: `23 -> 17`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/AppProvider.test.tsx tests/frontend/configStorage.test.js tests/frontend/TranscriptSessionState.test.ts tests/frontend/ChatStreamFormatting.test.ts tests/frontend/ArtifactUploader.test.ts` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/displaySelection.test.ts tests/frontend/SystemCapture.test.ts tests/frontend/ToolExecutionInvoker.test.ts tests/frontend/ToolExecutionService.test.ts` (pass)
  - `cd frontend && npm run audit:knip` (remaining command non-zero from residual export/type findings)

## Phase 6 Outcome (2026-02-23)

- Type-surface cleanup shipped:
  - de-exported local-only type/interface declarations across chat/infrastructure/transcript modules.
  - removed now-dead internal `ToolBundleItem` interface from `ToolExecutionTypes` after de-export.
- Export cleanup shipped:
  - removed unused type re-exports from `ToolExecutionService`:
    - `ToolExecutionOptions`
    - `ToolExecutionCallbacks`
  - de-exported `TRANSCRIPT_SESSION_STORAGE_KEY` from `sessionInfoStorage`.
  - updated transcript storage/writer tests to use explicit fixture key value (`transcript-session-info`) while preserving behavioral assertions.
- knip findings delta after Phase 6 slice:
  - unused exports: `34 -> 31`
  - unused exported types: `17 -> 0`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/TranscriptStorage.test.ts tests/frontend/TranscriptWriter.test.ts tests/frontend/ToolExecutionService.test.ts` (pass)
  - `cd frontend && npm run test:ci` (pass)
  - `cd frontend && npm run audit:knip` (remaining command non-zero from residual unused exports only)

## Phase 7 Outcome (2026-02-23)

- Query payload export cleanup shipped:
  - pruned helper-only CJS exports from `frontend/src/main/query_payload_builder.cjs`.
  - retained only `buildQueryPayloadContent` as module export.
- Config helper export cleanup shipped:
  - internalized test-only config helpers in `frontend/src/renderer/utils/configStorage.js`:
    - `DEFAULT_FRONTEND_CONFIG`
    - `hasStoredConfig`
    - `getConfigVersion`
    - `clearConfigStorage`
  - removed `isFrontendConfigOnly` export from `frontend/src/renderer/utils/configFilter.js`.
  - updated config tests to validate public behavior and explicit storage fixtures.
- knip findings delta after Phase 7 slice:
  - unused exports: `31 -> 19`
  - unused exported types: `0 -> 0`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/QueryPayloadBuilder.test.cjs tests/frontend/configStorage.test.js tests/frontend/configFilter.test.js` (pass)
  - `cd frontend && npm run test:ci` (pass)
  - `cd frontend && npm run audit:knip` (remaining command non-zero from residual unused exports only)

## Phase 8 Outcome (2026-02-23)

- Chat helper export cleanup shipped:
  - de-exported private helper symbols from chat policy/utility modules:
    - `defaultReturnToChatboxPolicyForSurface`
    - `resolveReturnToChatboxOnSend`
    - `selectStreamTracking`
    - `normalizeMessageForSend`
    - `formatTokenCount`
    - `getActiveConversationTokenCount`
  - kept runtime API entrypoints exported:
    - `resolveMessageSendUiBehavior`
    - `selectChatInterfaceState` and `selectChatBoxState`
    - `buildOutgoingMessage`
    - `buildTokenCountItems`
- Test surface adjustments shipped:
  - updated chat utility tests to assert public behavior paths instead of importing private helper symbols.
- knip findings delta after Phase 8 slice:
  - unused exports: `19 -> 13`
  - unused exported types: `0 -> 0`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/MessageSendUiPolicy.test.ts tests/frontend/ChatSelectors.test.js tests/frontend/MessageInputUtils.test.js tests/frontend/TokenCounts.test.js` (pass)
  - `cd frontend && npm run test:ci` (pass)
  - `cd frontend && npm run audit:knip` (remaining command non-zero from residual unused exports only)

## Phase 9 Outcome (2026-02-23)

- Dead module cleanup shipped:
  - removed unused `frontend/src/renderer/features/chat/utils/chatBoxPresentation.js`.
  - removed module-specific test `tests/frontend/ChatBoxPresentation.test.js`.
  - removed stale folder-structure reference for `chatBoxPresentation.js`.
- Logger export cleanup shipped:
  - de-exported `shortCorrelationId` in `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`.
  - updated logger tests to validate correlation-id truncation/default behavior through public `logToolStart` API.
- knip findings delta after Phase 9 slice:
  - unused exports: `13 -> 8`
  - unused exported types: `0 -> 0`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/ToolExecutionLogger.test.ts tests/frontend/ChatBoxResponse.test.jsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 78 suites after dead-module test removal)
  - `cd frontend && npm run audit:knip` (remaining command non-zero from residual unused exports only)

## Phase 10 Outcome (2026-02-23)

- Export-surface cleanup shipped:
  - de-exported dashboard test-only internals from `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`:
    - `UNASSIGNED_CONVERSATION_KEY`
    - `parseMemoryContent`
  - de-exported formatter helper `formatSequentialStateXml` from `frontend/src/renderer/infrastructure/services/MessageFormatter.ts`.
  - de-exported capture helper internals from `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`:
    - `getWaitSeconds`
    - `extractCaptureFromResult`
    - `applyCaptureToResult`
- Test-surface updates shipped:
  - updated episodic-memory, message-formatter, and capture tests to validate behavior via public APIs only.
- knip findings delta after Phase 10 slice:
  - unused exports: `8 -> 2`
  - remaining unused exports:
    - `startWakewordService`
    - `stopWakewordService`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/EpisodicMemoryUtils.test.js tests/frontend/MessageFormatter.test.ts tests/frontend/ToolExecutionCapture.test.ts` (pass)
  - `cd frontend && npm run test:ci` (pass; 78 suites)
  - `cd frontend && npm run audit:knip` (remaining command non-zero from residual wakeword exports only)

## Phase 11 Outcome (2026-02-23)

- Wakeword bridge export cleanup shipped:
  - removed private lifecycle exports from `frontend/src/main/wakeword_bridge.cjs`:
    - `startWakewordService`
    - `stopWakewordService`
  - kept runtime entrypoint export unchanged:
    - `initializeWakewordBridge`
- Wakeword test migration shipped:
  - updated `tests/frontend/WakewordBridge.test.cjs` to cover restart/cleanup behavior using public lifecycle paths only:
    - `initializeWakewordBridge(...)`
    - IPC channels `wakeword-enable` and `wakeword-disable`
    - captured `process.on('beforeExit', ...)` callback
- knip findings delta after Phase 11 slice:
  - unused exports: `2 -> 0`
  - remaining findings: none (`knip` exit code `0`)
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/WakewordBridge.test.cjs` (pass)
  - `cd frontend && npm run test:ci` (pass; 78 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)

## Phase 12 Outcome (2026-02-23)

- Dashboard settings dedupe shipped:
  - extracted shared `SettingsToggleField` in `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`.
  - replaced repeated toggle JSX blocks for:
    - wakeword listening
    - voice mode
    - speech replies
    - attach image to user query
- Regression coverage shipped:
  - added `tests/frontend/SettingsSection.test.jsx` validating wakeword setter dispatch, `onConfigChange` payload wiring, and suppressed wakeword helper messaging.
- jscpd delta after Phase 12 slice:
  - clones: `225 -> 222`
  - duplicated lines: `3325 -> 3292`
  - duplicated tokens: `29329 -> 29060`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/SettingsSection.test.jsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 79 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 13 Outcome (2026-02-23)

- Message list prop-typing dedupe shipped:
  - extracted shared `messageShapePropType` in `frontend/src/renderer/features/chat/components/MessageList.jsx`.
  - reused shared shape for both `MessageItem.propTypes` and `MessageList.propTypes`.
  - no runtime behavior changes to message rendering or thinking-status flow.
- jscpd delta after Phase 13 slice:
  - clones: `222 -> 221`
  - duplicated lines: `3292 -> 3282`
  - duplicated tokens: `29060 -> 28963`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/MessageListClasses.test.js tests/frontend/MessageListThinkingDisplay.test.jsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 79 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 14 Outcome (2026-02-23)

- Chat overlay listener dedupe shipped:
  - added shared response-overlay phase subscriber helper:
    - `frontend/src/renderer/features/chat/utils/overlayPhaseListener.js`
  - replaced duplicated phase-payload parsing/listener wiring in:
    - `frontend/src/renderer/features/chat/components/ChatBox.jsx`
    - `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- Chat overlay frame-size dedupe shipped:
  - added shared frame-size normalization helper:
    - `frontend/src/renderer/features/chat/utils/overlayFrameSize.js`
  - replaced duplicate element-rect size normalization blocks in `ChatBox` and `ChatBoxResponse`.
- Regression coverage shipped:
  - added:
    - `tests/frontend/OverlayPhaseListener.test.js`
    - `tests/frontend/OverlayFrameSize.test.js`
  - preserved existing chat overlay behavior coverage via:
    - `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
    - `tests/frontend/ChatBoxResponse.test.jsx`
- jscpd delta after Phase 14 slice:
  - clones: `221 -> 220`
  - duplicated lines: `3282 -> 3275`
  - duplicated tokens: `28963 -> 28878`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/OverlayPhaseListener.test.js tests/frontend/OverlayFrameSize.test.js tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx tests/frontend/ChatBoxResponse.test.jsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 81 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 15 Outcome (2026-02-23)

- Landing privacy highlight dedupe shipped:
  - refactored repeated `privacy-highlights` JSX blocks in `frontend/src/landing/components/PrivacySection.jsx` to data-driven rendering.
  - preserved existing copy and icon semantics for:
    - `Local-First`
    - `Transparent`
    - `Your Choice`
- jscpd delta after Phase 15 slice:
  - clones: `220 -> 218`
  - duplicated lines: `3275 -> 3264`
  - duplicated tokens: `28878 -> 28722`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/landing/LandingPage.test.jsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 81 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 16 Outcome (2026-02-23)

- Landing section intro dedupe shipped:
  - added shared `SectionIntro` component at `frontend/src/landing/components/SectionIntro.jsx`.
  - migrated shared badge/heading/description intro markup in:
    - `frontend/src/landing/components/WhySection.jsx`
    - `frontend/src/landing/components/PrivacySection.jsx`
- Additional landing icon dedupe shipped:
  - added shared `ProviderStackIcon` component at `frontend/src/landing/components/icons/ProviderStackIcon.jsx`.
  - replaced repeated provider-stack SVG blocks in:
    - `frontend/src/landing/components/WhySection.jsx`
    - `frontend/src/landing/components/PrivacySection.jsx`
    - `frontend/src/landing/components/CTAFooter.jsx`
- jscpd delta after Phase 16 slice:
  - clones: `218 -> 215`
  - duplicated lines: `3264 -> 3244`
  - duplicated tokens: `28722 -> 28487`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/landing/LandingPage.test.jsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 81 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 17 Outcome (2026-02-23)

- Voice audio-capture teardown dedupe shipped:
  - added shared cleanup utility:
    - `frontend/src/renderer/features/voice/utils/audioCaptureCleanup.ts`
  - reused shared teardown helpers in:
    - `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
    - `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- Regression coverage shipped:
  - added direct cleanup utility tests:
    - `tests/frontend/VoiceAudioCleanup.test.ts`
- `lint:audit` deprecation status:
  - `react-compiler` audit: no blocking errors.
  - deprecation warnings remain for `ScriptProcessorNode`/`onaudioprocess` in:
    - `useVoiceMode.ts`
    - `useWakewordDetection.ts`
    - `audioCaptureCleanup.ts`
- jscpd delta after Phase 17 slice:
  - clones: `215 -> 214`
  - duplicated lines: `3244 -> 3225`
  - duplicated tokens: `28487 -> 28350`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/VoiceModeHook.test.ts tests/frontend/WakewordDetectionHook.test.ts tests/frontend/VoiceAudioCleanup.test.ts` (pass)
  - `cd frontend && npm run lint:audit` (pass; deprecation warnings only)
  - `cd frontend && npm run test:ci` (pass; 82 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 18 Outcome (2026-02-23)

- Transcript immediate-store dedupe shipped:
  - added shared session/store helpers in:
    - `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
  - rewired repeated immediate store-retry flow in:
    - `recordUserMessage`
    - `recordAssistantMessage`
    - `recordToolMessage`
  - preserved existing queue-on-missing-session and queue-on-store-failure behavior.
- jscpd delta after Phase 18 slice:
  - clones: `214 -> 212`
  - duplicated lines: `3225 -> 3203`
  - duplicated tokens: `28350 -> 28138`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/TranscriptWriter.test.ts tests/frontend/TranscriptStorage.test.ts tests/frontend/TranscriptSessionState.test.ts` (pass)
  - `cd frontend && npm run test:ci` (pass; 82 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 19 Outcome (2026-02-23)

- Electron main-process Python path dedupe shipped:
  - added shared Python executable resolver in:
    - `frontend/src/main/runtime_paths.cjs`
  - rewired duplicate path-resolution logic in:
    - `frontend/src/main/local_backend_bridge.cjs`
    - `frontend/src/main/wakeword_bridge.cjs`
  - preserved local-backend Python-path caching behavior.
- `knip` dead-export cleanup shipped:
  - internalized now-unused runtime-path helper exports:
    - `firstExistingPath`
    - `getBundledPythonExecutableCandidates`
- jscpd delta after Phase 19 slice:
  - clones: `212 -> 211`
  - duplicated lines: `3203 -> 3192`
  - duplicated tokens: `28138 -> 28043`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/LocalBackendBridge.test.cjs tests/frontend/WakewordBridge.test.cjs` (pass)
  - `cd frontend && npm run test:ci` (pass; 82 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 20 Outcome (2026-02-23)

- Chat hook selector dedupe shipped:
  - added shared chat action selector hook:
    - `frontend/src/renderer/features/chat/hooks/useChatCommonActions.ts`
  - rewired selector blocks in:
    - `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
    - `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
  - preserved existing message-send and stream handling behavior.
- jscpd delta after Phase 20 slice:
  - clones: `211 -> 210`
  - duplicated lines: `3192 -> 3187`
  - duplicated tokens: `28043 -> 27952`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/ChatMessageSender.test.tsx tests/frontend/ChatStreamThinkingStatus.test.tsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 82 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 21 Outcome (2026-02-23)

- Voice audio-capture ref dedupe shipped:
  - added shared ref hook:
    - `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
  - rewired duplicated audio-capture ref declarations in:
    - `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
    - `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
  - preserved existing audio capture lifecycle behavior across voice mode and wakeword detection.
- jscpd delta after Phase 21 slice:
  - clones: `210 -> 209`
  - duplicated lines: `3187 -> 3182`
  - duplicated tokens: `27952 -> 27860`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/VoiceModeHook.test.ts tests/frontend/WakewordDetectionHook.test.ts tests/frontend/VoiceAudioCleanup.test.ts` (pass)
  - `cd frontend && npm run test:ci` (pass; 82 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 22 Outcome (2026-02-24)

- Settings panel style dedupe shipped:
  - consolidated duplicated item card selectors in:
    - `frontend/src/renderer/styles/SettingsPanel.css`
  - merged shared base + state declarations for:
    - `.model-item` + `.memory-item`
    - shared `:hover` + `.active` states
  - preserved model-specific layout declarations (`display`/`flex-direction`/`gap`) as local-only styles.
- jscpd delta after Phase 22 slice:
  - clones: `209 -> 208`
  - duplicated lines: `3182 -> 3172`
  - duplicated tokens: `27860 -> 27753`
- Verification:
  - `cd frontend && npm run lint` (pass)
  - `cd frontend && npm run test:ci -- tests/frontend/SettingsSection.test.jsx tests/frontend/SemanticMemorySection.test.jsx tests/frontend/EpisodicMemorySectionDelete.test.jsx` (pass)
  - `cd frontend && npm run test:ci` (pass; 82 suites)
  - `cd frontend && npm run audit:knip` (pass; no findings)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 23 Outcome (2026-02-24)

- API formatter dedupe shipped:
  - added shared formatter helpers in:
    - `backend/src/api/processing/formatters/base.py`
  - rewired required-field checks and missing-field warning logs in:
    - `backend/src/api/processing/formatters/chunk.py`
    - `backend/src/api/processing/formatters/thinking.py`
    - `backend/src/api/processing/formatters/assistant_message.py`
    - `backend/src/api/processing/formatters/tool_call.py`
    - `backend/src/api/processing/formatters/tool_output.py`
  - preserved outgoing payload shapes and invalid-event skip behavior.
- jscpd delta after Phase 23 slice:
  - clones: `208 -> 200`
  - duplicated lines: `3172 -> 3105`
  - duplicated tokens: `27753 -> 27067`
- Verification:
  - `pytest tests/backend/test_formatters.py tests/backend/test_outgoing_schema_contract.py tests/backend/test_response_formatter.py` (pass; 37 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 24 Outcome (2026-02-24)

- Core exception + validation dedupe shipped:
  - added shared metadata merge helper in:
    - `backend/src/core/infrastructure/exceptions.py`
  - rewired repeated constructor metadata-merge paths in configuration/LLM/tool/memory/session/trust-boundary exceptions.
  - added shared Pydantic field-error mapper in:
    - `backend/src/core/validation/validators.py`
  - rewired `validate_message` and `validate_dict` to reuse shared error-detail mapping.
- jscpd delta after Phase 24 slice:
  - clones: `200 -> 199`
  - duplicated lines: `3105 -> 3097`
  - duplicated tokens: `27067 -> 26977`
- Verification:
  - `pytest tests/backend/test_exceptions.py tests/backend/test_validation_utils.py tests/backend/test_api_errors.py` (pass; 57 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 25 Outcome (2026-02-24)

- Exception constructor specialization dedupe shipped:
  - added shared optional-metadata helpers in:
    - `backend/src/core/infrastructure/exceptions.py`
      - `_metadata_with_optional_field`
      - `_merge_trust_boundary_metadata`
  - centralized subclass default error-code wiring for:
    - `LLMError` family (`LLMAPIError`, `LLMRateLimitError`)
    - `MemoryError` family (`MemoryStoreError`, `EmbeddingError`)
  - extracted shared trust-boundary base constructor flow for:
    - `_TrustBoundaryError`
    - `InputSizeLimitError`, `ParseTimeoutError`, `ParseValidationError`
  - preserved existing exception attributes, metadata include semantics, and error-code values.
- jscpd delta after Phase 25 slice:
  - clones: `199 -> 197`
  - duplicated lines: `3097 -> 3084`
  - duplicated tokens: `26977 -> 26845`
- Verification:
  - `pytest tests/backend/test_exceptions.py tests/backend/test_validation_utils.py tests/backend/test_api_errors.py` (pass; 57 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 26 Outcome (2026-02-24)

- API schema re-export dedupe shipped:
  - converted compatibility module to thin facade in:
    - `backend/src/api/schema.py`
  - removed duplicated export list maintenance by sourcing symbols from:
    - `backend/src/api/schemas/__init__.py` (`__all__`)
  - preserved backward-compatible import path and schema symbol availability for existing handlers/tests.
- jscpd delta after Phase 26 slice:
  - clones: `197 -> 196`
  - duplicated lines: `3084 -> 3030`
  - duplicated tokens: `26845 -> 26634`
- Verification:
  - `pytest tests/backend/test_api_handlers.py tests/backend/test_websocket_message_handler.py tests/backend/test_outgoing_schema_contract.py tests/backend/test_api_contract_registry.py` (pass; 61 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 27 Outcome (2026-02-24)

- Tool preparation flow dedupe shipped:
  - added shared resolved-call initialization helper in:
    - `backend/src/agent/tools/preparation/preparer.py` (`_initialize_resolved_call`)
  - added shared coordinate-resolution invoke helper in:
    - `backend/src/agent/tools/preparation/preparer.py` (`_resolve_coordinates_for_call`)
  - rewired bundle and single-call preparation paths to use shared helpers while preserving:
    - bundle short-circuit-on-first-error behavior
    - single-call timing and error-return semantics
    - request/bundle context id usage.
- jscpd delta after Phase 27 slice:
  - clones: `196 -> 195`
  - duplicated lines: `3030 -> 3014`
  - duplicated tokens: `26634 -> 26517`
- Verification:
  - `pytest tests/backend/test_tool_preparer.py tests/backend/test_coordinate_scaling.py tests/backend/test_coordinate_contract.py tests/backend/test_vision_coordinates.py` (pass; 25 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 28 Outcome (2026-02-24)

- Remote tool export-surface dedupe shipped:
  - rewired package export module to source remote-tool class symbols from:
    - `backend/src/tools/remote_tools/registry.py`
  - removed duplicate class import blocks from:
    - `backend/src/tools/remote_tools/__init__.py`
  - preserved package public exports consumed by `backend/src/tools/remote.py` and backend tests.
- jscpd delta after Phase 28 slice:
  - clones: `195 -> 194`
  - duplicated lines: `3014 -> 3000`
  - duplicated tokens: `26517 -> 26419`
- Verification:
  - `pytest tests/backend/test_remote_tools.py tests/backend/test_browser_remote_tool.py tests/backend/test_remote_tool_contract.py` (pass; 27 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 29 Outcome (2026-02-24)

- LLM completion request-kwargs dedupe shipped:
  - added shared request-kwargs builder in:
    - `backend/src/agent/llm/llm_stream_processor.py` (`_build_completion_request_kwargs`)
  - rewired duplicated completion transport setup in:
    - `_iter_completion_stream`
    - `_get_completion_response`
  - preserved prompt-cache key trimming and tool-turn stream/non-stream behavior.
- jscpd delta after Phase 29 slice:
  - clones: `194 -> 194`
  - duplicated lines: `3000 -> 2995`
  - duplicated tokens: `26419 -> 26397`
- Verification:
  - `pytest tests/backend/test_llm_stream_processor.py tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py` (pass; 42 tests)
  - `cd frontend && npm run audit:jscpd` (pass; duplicate-lines/tokens reduction confirmed)

## Phase 30 Outcome (2026-02-24)

- Session tool-result delegation wrapper dedupe shipped:
  - simplified session pass-through methods in:
    - `backend/src/agent/session/session.py`
      - `process_frontend_tool_result`
      - `process_frontend_tool_bundle_result`
  - switched explicit arg-list wrappers to keyword-forwarding payload wrappers delegated to `ToolResultHandler`.
  - preserved API handler keyword-call behavior and tool-result routing semantics.
- jscpd delta after Phase 30 slice:
  - clones: `194 -> 193`
  - duplicated lines: `2995 -> 2971`
  - duplicated tokens: `26397 -> 26296`
- Verification:
  - `pytest tests/backend/test_api_handlers.py tests/backend/test_websocket_message_handler.py tests/backend/test_tool_result_handler.py` (pass; 50 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 31 Outcome (2026-02-24)

- LLM request-path signature dedupe shipped:
  - built native completion request kwargs once in `get_response` and reused them across:
    - non-stream completion (`get_completion_response`)
    - stream completion (`_iter_completion_stream`)
  - removed redundant non-stream wrapper method:
    - `_get_completion_response`
  - preserved prompt-cache key normalization, tool-turn branch behavior, and event emission semantics.
- jscpd delta after Phase 31 slice:
  - clones: `193 -> 191`
  - duplicated lines: `2971 -> 2957`
  - duplicated tokens: `26296 -> 26147`
- Verification:
  - `pytest tests/backend/test_llm_stream_processor.py tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py` (pass; 42 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone reduction confirmed)

## Phase 32 Outcome (2026-02-24)

- Shared tool-schema field helper dedupe shipped:
  - added shared field helper module:
    - `backend/src/tools/schema_fields.py`
  - rewired repeated explanation field declarations to shared helper in:
    - `backend/src/tools/system/schemas.py`
    - `backend/src/tools/filesystem/schemas.py`
  - rewired repeated post-action wait field declarations to shared helper in:
    - `backend/src/tools/computer/schemas.py`
  - preserved tool argument defaults and descriptions.
- jscpd delta after Phase 32 slice:
  - clones: `191 -> 191`
  - duplicated lines: `2957 -> 2957`
  - duplicated tokens: `26147 -> 26147`
- Verification:
  - `pytest tests/backend/test_remote_tools.py tests/backend/test_browser_remote_tool.py tests/backend/test_remote_tool_contract.py` (pass; 27 tests)
  - `cd frontend && npm run audit:jscpd` (pass; metrics unchanged this slice)

## Phase 33 Outcome (2026-02-24)

- `LiteLLMClient` provider request-kwargs dedupe shipped:
  - added shared provider-kwargs builder in:
    - `backend/src/llm/client.py`
  - rewired both completion paths to consume shared builder:
    - `LiteLLMClient.get_completion_response`
    - `LiteLLMClient.get_completion_stream`
  - preserved prompt-cache key normalization and stream/non-stream error semantics.
- jscpd delta after Phase 33 slice:
  - clones: `191 -> 190`
  - duplicated lines: `2957 -> 2944`
  - duplicated tokens: `26147 -> 26048`
- Verification:
  - `pytest tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_stream_processor.py` (pass; 42 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone/duplicate reduction confirmed)

## Phase 34 Outcome (2026-02-24)

- LLM optional-field exception constructor dedupe shipped:
  - added shared base class for single optional-field LLM exceptions:
    - `backend/src/core/infrastructure/exceptions.py` (`_LLMOptionalFieldError`)
  - rewired duplicated constructor wiring in:
    - `LLMAPIError`
    - `LLMRateLimitError`
  - preserved constructor signatures, error-code defaults, metadata include rules, and public attributes (`status_code`, `retry_after`).
- jscpd delta after Phase 34 slice:
  - clones: `190 -> 189`
  - duplicated lines: `2944 -> 2935`
  - duplicated tokens: `26048 -> 25965`
- Verification:
  - `pytest tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py tests/backend/test_parser_validation.py` (pass; 52 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone/duplicate reduction confirmed)

## Phase 35 Outcome (2026-02-24)

- Scoped exception constructor-path dedupe shipped:
  - added shared scoped-constructor helpers in:
    - `backend/src/core/infrastructure/exceptions.py`
      - `_init_scoped_context_error`
      - `_init_optional_scoped_context_error`
  - rewired duplicated scoped init paths in:
    - `LLMError` (`model` scope)
    - `MemoryError` (`user_id` scope)
  - preserved constructor signatures, error-code defaults, metadata include rules, and public attributes (`model`, `user_id`).
- jscpd delta after Phase 35 slice:
  - clones: `189 -> 188`
  - duplicated lines: `2935 -> 2927`
  - duplicated tokens: `25965 -> 25865`
- Verification:
  - `pytest tests/backend/test_exceptions.py tests/backend/test_llm_client.py tests/backend/test_local_llm_providers.py` (pass; 68 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone/duplicate reduction confirmed)

## Phase 36 Outcome (2026-02-24)

- OpenRouter completion/stream request-param dedupe shipped:
  - added shared OpenRouter completion-param builder in:
    - `backend/src/llm/providers/openrouter.py` (`_build_completion_params`)
  - rewired both OpenRouter completion paths to consume the shared builder:
    - `OpenRouterProvider.get_completion`
    - `OpenRouterProvider._stream_internal`
  - preserved prompt-cache key forwarding and stream usage options (`include_usage`).
- jscpd delta after Phase 36 slice:
  - clones: `188 -> 189`
  - duplicated lines: `2927 -> 2906`
  - duplicated tokens: `25865 -> 25746`
  - note: clone count regressed by one due clone regrouping, but duplicated volume decreased.
- Verification:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py` (pass; 101 tests)
  - `cd frontend && npm run audit:jscpd` (pass; duplicated lines/tokens reduction confirmed)

## Phase 37 Outcome (2026-02-24)

- Provider stream-flag dedupe shipped:
  - added shared stream+usage request helper in:
    - `backend/src/llm/providers/base.py` (`_enable_stream_with_usage`)
  - rewired duplicated stream-flag setup in:
    - `backend/src/llm/providers/anthropic.py`
    - `backend/src/llm/providers/gemini.py`
    - `backend/src/llm/providers/kimi_coding.py`
    - `backend/src/llm/providers/local.py`
    - `backend/src/llm/providers/mistral.py`
    - `backend/src/llm/providers/openai.py`
    - `backend/src/llm/providers/openrouter.py`
  - preserved provider-specific request params and stream usage semantics.
- jscpd delta after Phase 37 slice:
  - clones: `189 -> 190`
  - duplicated lines: `2906 -> 2909`
  - duplicated tokens: `25746 -> 25763`
  - note: this run included wider repository churn (`773` files analyzed) while backend stream-flag duplication block was removed.
- Verification:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py` (pass; 101 tests)
  - `cd frontend && npm run audit:jscpd` (completed; global totals drifted upward during broader repo changes)

## Phase 38 Outcome (2026-02-24)

- Provider text-stream loop dedupe shipped:
  - added shared text-stream event helper in:
    - `backend/src/llm/providers/base.py` (`_stream_text_content_events`)
  - rewired duplicate stream iteration blocks in:
    - `backend/src/llm/providers/openai.py`
    - `backend/src/llm/providers/mistral.py`
    - `backend/src/llm/providers/local.py`
    - `backend/src/llm/providers/openrouter.py`
  - preserved stream usage capture, delta parsing, and chunk emission behavior.
- jscpd delta after Phase 38 slice:
  - clones: `190 -> 187`
  - duplicated lines: `2909 -> 2854`
  - duplicated tokens: `25763 -> 25335`
  - note: run included broader repository churn (`774` files analyzed).
- Verification:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py` (pass; 101 tests)
  - `cd frontend && npm run audit:jscpd` (pass; clone/duplicate reduction confirmed)

## Phase 39 Outcome (2026-02-24)

- Provider thinking-stream loop dedupe shipped:
  - added shared thinking+text stream event helper in:
    - `backend/src/llm/providers/base.py` (`_stream_thinking_and_text_events`)
  - rewired duplicate thinking-stream iteration blocks in:
    - `backend/src/llm/providers/anthropic.py`
    - `backend/src/llm/providers/gemini.py`
  - preserved stream usage capture and thinking/chunk event semantics.
- jscpd delta after Phase 39 slice:
  - clones: `187 -> 188`
  - duplicated lines: `2854 -> 2850`
  - duplicated tokens: `25335 -> 25317`
  - note: run included broader repository churn (`775` files analyzed).
- Verification:
  - `pytest tests/backend/test_llm_provider_base.py tests/backend/test_local_llm_providers.py tests/backend/test_llm_client.py` (pass; 101 tests)
  - `cd frontend && npm run audit:jscpd` (pass; duplicated lines/tokens reduction confirmed)

## Phase 40 Outcome (2026-02-24)

- React compiler + frontend voice hook hard-error cleanup shipped:
  - removed `useAudioCaptureRefs` shared object hook usage from:
    - `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
    - `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
  - replaced with direct `useRef` declarations per hook to satisfy `react-compiler` immutability constraints.
  - deleted now-unused hook:
    - `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- Oversized frontend IPC test split shipped:
  - split `tests/frontend/IpcMainBridge.test.cjs` (`752` LOC) into:
    - `tests/frontend/IpcMainBridge.lifecycle.test.cjs` (`179` LOC)
    - `tests/frontend/IpcMainBridge.query.test.cjs` (`436` LOC)
  - extracted shared setup/mocks into:
    - `tests/frontend/__mocks__/ipcMainBridgeHarness.cjs`
  - preserved full suite coverage (same `27` IPC bridge tests passing).
- Dependency/tooling refresh (safe, non-breaking) shipped:
  - bumped `@types/react` to `^18.3.28` in `frontend/package.json` and lockfile.
  - attempted `eslint-plugin-react-refresh@0.5.2`, but intentionally kept `0.4.26` due peer requirement (`eslint ^9 || ^10`) conflicting with current `eslint 8.57.1` stack.
- API route consolidation check:
  - reviewed current route surface under `backend/src/api/routes`.
  - no new low-risk consolidation target identified in this slice; memory route health checks already centralized via `backend/src/api/routes/memory/health.py`.
- Audit delta snapshot:
  - jscpd totals: clones `190 -> 181`, duplicated lines `2883 -> 2765`, duplicated tokens `25624 -> 24597`.
  - knip: pass (`0` findings).
  - lint audit: react-compiler pass; deprecation warnings unchanged (ScriptProcessorNode/onaudioprocess in voice capture path).
- Verification:
  - `cd frontend && npm run lint:audit` (pass; warnings only)
  - `cd frontend && npm run audit:knip` (pass)
  - `cd frontend && npm run audit:jscpd` (pass; clone/duplicate reduction confirmed)
  - `cd frontend && npm run test:ci` (pass; 86 suites, 607 tests)
  - `./scripts/test-backend` (pass; 966 tests)
  - `./scripts/test-sidecar` (pass; 462 tests)
