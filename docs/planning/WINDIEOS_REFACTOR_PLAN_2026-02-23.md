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
