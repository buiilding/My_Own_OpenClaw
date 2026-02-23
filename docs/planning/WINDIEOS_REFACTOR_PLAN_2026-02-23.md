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
