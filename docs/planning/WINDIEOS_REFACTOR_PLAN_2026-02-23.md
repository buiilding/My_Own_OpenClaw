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
