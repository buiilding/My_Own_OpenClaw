---
summary: "Execution report for the history.db UI read model plan."
read_when:
  - When resuming the history.db UI read model implementation.
title: "History DB UI Read Model Report"
---

# History DB UI Read Model Report

Plan: [2026-06-11-history-db-ui-read-model-plan.md](2026-06-11-history-db-ui-read-model-plan.md)

## Status

Complete.

## Checklist

- [x] Orientation: read existing schema, CLI, tests, and docs anchors.
- [x] Add `conversation_display_messages` read model.
- [x] Add CLI message export path.
- [x] Add focused tests.
- [x] Update docs and changelog.
- [x] Run validation.
- [x] Complete inspection pass.
- [ ] Commit completed work.

## Decisions

- The read model will live in `history/history.db` as a SQLite view over `conversation_events`, not as another table or memory store.
- The SDK remains the preferred UI contract. The SQLite view is for deterministic inspection and future UI prototyping, not a replacement for SDK projection logic.
- Legacy compatibility views are preserved in this slice because removing them is separate cleanup with migration risk.

## Validation Log

- Passed: `./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_chat_event_store.py -q`
- Passed: `npm --prefix frontend run test:ci -- WindieCli`
- Passed: `bin/windie docs list`
- Passed: `git diff --check`
- Passed: live CLI smoke with `bin/windie conversation messages <conversation-ref> --limit 2 --json`

## Inspection Log

- Initial inspection found the canonical history schema already separates transcript events from memory stores and creates legacy compatibility views. The missing piece is a display-safe read model and a CLI command that does not require callers to hand-write raw event filters.
- Completion inspection found the schema change is limited to a view over `conversation_events`; no new persistence owner was introduced.
- Completion inspection found the CLI uses the view when present and preserves a compatibility fallback for older canonical history schemas without the view or `attachments` column.
- Completion inspection found docs classify the read model as an inspection/prototyping contract while preserving SDK display APIs as the first-party UI path.
- No remaining in-scope violations found. Dashboard rewiring and legacy compatibility view deletion remain out of scope per plan.

## Commits

Pending.
