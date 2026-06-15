---
summary: "Continuation plan for the 25-commit deletion-first cleanup campaign."
read_when:
  - When continuing the at-least-25-commits cleanup goal.
  - When removing unused code, legacy compatibility shims, stale aliases, or stale docs that preserve old runtime paths.
title: "25 Commit Cleanup Campaign Plan"
---

# 25 Commit Cleanup Campaign Plan

Date: 2026-06-14

## User Intent

Make at least 25 small commits that remove unused code, legacy paths, and
compatibility code. The commits should move WindieOS toward one owner and one
current path for each behavior.

## Relationship To Earlier Cleanup

This continues the deletion-first direction from
`2026-06-05-deterministic-codebase-cleanup-campaign-plan.md`, but the stop
condition is now stricter: at least 25 cleanup commits are required before this
campaign can be called complete.

## Constraints

- Preserve unrelated dirty work.
- Prefer code deletion over docs-only cleanup.
- Keep each commit scoped and reviewable.
- Do not delete operational fallbacks unless evidence proves they are stale
  compatibility rather than resilience.
- Update docs and changelog when active behavior, ownership, or routing changes.
- Validate each slice with focused tests or targeted import/search checks.

## Cleanup Loop

For each slice:

1. Identify the owning runtime.
2. Verify the suspected stale path with `rg`, docs, tests, and recent commits.
3. Delete the stale code first.
4. Update direct docs/tests only when they still point at the removed path.
5. Run focused validation.
6. Commit the slice separately.
7. Record the commit, validation, and remaining candidates in the report.

## Initial Candidate Themes

- Pure re-export wrapper modules that only rename the real owner.
- Exported type aliases with no runtime or test consumers.
- Docs/test references to deleted SDK desktop-agent paths.
- Docs/test references to deleted renderer route or component names.
- Compatibility-only parser branches where persisted-data or public API support
  has already been removed.

## Success Criteria

- [ ] At least 25 cleanup commits exist for this campaign.
- [ ] Each counted commit removes unused code, legacy code, compatibility code,
      or stale active docs/tests that preserved an old path.
- [ ] The report records each counted commit and validation result.
- [ ] At least four runtime/documentation areas are scanned.
- [ ] Current evidence, not memory, proves no counted commit staged unrelated
      changes.
