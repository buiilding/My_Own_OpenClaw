---
summary: "Deletion-first plan for removing compatibility, legacy, old, and unused code across WindieOS without preserving duplicate authorities."
read_when:
  - When continuing the broad codebase cleanup goal for compatibility, legacy, old, or unused code.
  - When deciding whether a fallback, alias, adapter, package export, parser branch, or stale doc is removable.
title: "Codebase Compatibility Deletion Plan"
---

# Codebase Compatibility Deletion Plan

Date: 2026-06-15

## User Intent

Remove compatibility, legacy, old, and unused code from the WindieOS codebase.
The cleanup should favor deletion and current ownership over preserving old
runtime paths.

## Target Architecture

- Each behavior has one current owner: backend for hosted agent/provider/API
  authority, SDK for reusable conversation/runtime semantics, Electron main for
  native desktop host mechanics, renderer for display, and sidecar for local
  execution/storage.
- Compatibility branches, legacy aliases, stale package-root exports, adapter
  wrappers, fallback parser shapes, and stale docs should be removed when there
  is no verified current external or persisted-data dependency.
- Operational resilience remains valid when it handles live failure modes rather
  than old API shapes. Do not delete a fallback only because it contains the
  word "fallback"; classify it first.
- If a deletion changes a public API, storage shape, event payload, tool schema,
  or setting, document the migration impact or state that no migration is
  required.

## In Scope

- Source code under `backend/`, `frontend/`, `packages/`, sidecar code, tests,
  examples, and active docs.
- Compatibility aliases and parser branches for old payload names.
- Package-root export aggregators and wrapper modules that only rename the
  current owner.
- Dead feature branches, unused helpers, and stale docs/tests that keep removed
  paths looking active.
- Existing cleanup candidates from prior audits, revalidated against current
  code before editing.

## Out Of Scope Until Classified

- Operational fallbacks for provider failures, token counting, browser launch,
  screenshot capture, overlay placement, network reconnects, and user-facing
  recovery.
- Legacy persisted-data import paths that still protect existing users.
- Public SDK/API compatibility that has verified external consumers.
- Broad generated-file churn unless the source change requires regeneration.
- Dependency updates or vendored patches.

## Inspection Workflow

For each slice:

1. Identify the owning runtime and current source of truth.
2. Inspect recent commits for the touched path.
3. Prove the old path is unused or only compatibility with `rg`, tests, docs,
   and import/runtime checks.
4. Delete the old path and update direct callers/tests/docs to current owners.
5. Run focused validation for the owning layer plus `bin/windie docs list` and
   `git diff --check`.
6. Re-scan the touched area after edits and classify remaining hits as fixed,
   intentionally retained, or next-slice candidates.
7. Update the matching report before committing.

## Initial Candidate Areas

- Remaining local backend bridge ownership split from
  `docs/refactors/remaining_architecture_refactor_plan.md`.
- Active source hits for `legacy`, `compat`, `deprecated`, `alias`, `shim`,
  `monkeypatch`, and stale package-root exports outside historical docs.
- Active docs that still point to removed runtime modules after the 25-commit
  cleanup campaign.
- Tests that preserve old payload shapes after the production fallback has been
  removed.
- SDK CJS/ESM output drift where generated artifacts still expose removed
  aliases.

## Success Criteria

- [ ] Each completed slice removes code or active docs/tests that preserve a
      stale path.
- [ ] No touched area becomes more duplicated, more compatibility-heavy, or more
      coupled.
- [ ] Every retained fallback in a touched area has a current operational reason
      or is explicitly out of scope.
- [ ] Behavior/API/storage/tool-schema changes include migration notes or a
      clear no-migration reason.
- [ ] The report records commits, validation, inspection findings, and remaining
      candidates.

## Validation Commands

- `bin/windie docs list`
- `git diff --check`
- Focused backend tests through `./scripts/python-in-env backend pytest ...`
- Focused sidecar tests through `./scripts/python-in-env sidecar pytest ...`
- Focused frontend tests through `bin/windie test frontend -- ...`
- `cd frontend && npm run lint` when frontend source changes
- SDK build/type checks when SDK package exports or generated output changes

## Reread Anchors After Compaction

- This plan.
- `docs/plans/2026-06-15-codebase-compatibility-deletion-report.md`
- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `pending/compaction_safe_plan_execution.md`
- `docs/refactors/remaining_architecture_refactor_plan.md`
- `docs/plans/2026-06-14-25-commit-cleanup-campaign-report.md`
