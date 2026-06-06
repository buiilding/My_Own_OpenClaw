---
summary: "Execution report for the sidebar conversation metadata boundary plan."
read_when:
  - When continuing or auditing the sidebar conversation metadata boundary work.
  - When debugging internal SDK event names in recent chat titles, previews, or workspace groups.
title: "Sidebar Conversation Metadata Boundary Report"
---

# Sidebar Conversation Metadata Boundary Report

Plan: [Sidebar Conversation Metadata Boundary Plan](2026-06-06-sidebar-conversation-metadata-boundary-plan.md)

## Status

Implementation complete; validation passed. Fresh inspection found no remaining
in-scope metadata leak in the sidecar producer, SDK adapter, or renderer
sidebar consumer.

## Approved Intent

Sidebar conversation metadata must be human-facing:

- generated/manual title wins when present
- first user message is the provisional title before generated title exists
- preview/last message ignores SDK lifecycle internals
- workspace grouping comes from persisted conversation workspace metadata
- lifecycle rows remain in the SDK event log for runtime/debug/replay, but do
  not create user-facing sidebar identity

## Worktree Guard

Before implementation, `git status --short` showed unrelated dirty files in
frontend renderer/SDK live-turn presentation paths, backend provider retry
policy work, existing untracked plan/report files, and `scratch/`.

This task will not revert, stage, or commit those unrelated changes.

## Checklist

- [x] Execution report created after approval.
- [x] Live code and local DB behavior inspected before implementation.
- [x] Event eligibility allowlist documented in the report.
- [x] Sidecar listing hides conversations with only internal lifecycle rows.
- [x] First user message is the provisional title before generated title exists.
- [x] Generated/manual title still overrides fallback title.
- [x] Sidebar preview/last message ignores internal lifecycle rows.
- [x] Workspace metadata remains correct for first-send conversations.
- [x] SDK store adapter does not reintroduce lifecycle fallback text.
- [x] Renderer sidebar does not add duplicate event-name filtering.
- [x] Migration/no-migration decision recorded.
- [x] Focused tests pass.
- [x] Docs listing and diff checks pass.
- [x] Fresh inspection finds no remaining in-scope metadata leaks.

## Findings

- The sidecar `list_chat_conversations(...)` query is the producer of recent
  conversation metadata consumed by `SidecarConversationStore.listMetadata(...)`,
  `DesktopConversationLibraryClient.listMetadata(...)`, and the dashboard
  sidebar. The SDK adapter and renderer mostly map returned metadata fields;
  they do not need renderer-side SDK event-name filters.
- The current local DB confirmed stored internal rows such as `turn_started`,
  `usage_updated`, and `memory_store_changed` can have synthetic content like
  `[sdk event: memory_store_changed]`.
- Recent local DB rows also confirmed the workspace path can already be present
  on the first `user_message` row. The verified leak for current rows was
  sidebar `last_message`/preview eligibility reading arbitrary nonempty event
  content; the title path already preferred first user content when present.
- The implementation still protects the originally reported first-send class:
  conversations with only lifecycle rows are not listed as normal recent chats.

## Event Eligibility Contract

Sidebar metadata-visible event types:

- `user_message`
- `assistant_message`
- `tool_output`
- `tool_bundle_output`
- `turn_error`

The sidecar listing query now builds a `visible_events` CTE from that allowlist.
Conversation visibility, first/last metadata timestamps, first user fallback,
last-message preview, workspace path, and workspace name are derived from that
CTE. Full event count and revision lookup still read the full event log so
replay/debug semantics are preserved.

Title fallback is now:

```text
stored/generated/manual title
else first user_message content
else conversation_id
```

It no longer falls back to arbitrary `last_content`.

## Migration Decision

No migration required. Existing rows remain in the SDK event log, but the
listing query filters metadata eligibility at read time. Old lifecycle rows
with `[sdk event: ...]` content no longer drive sidebar preview/title/workspace
metadata.

## Changes Made

- Created this execution report.
- Added `SIDEBAR_METADATA_EVENT_TYPES` in
  `frontend/src/main/python/memory/chat_event_store.py`.
- Changed `list_chat_conversations(...)` to use a `visible_events` CTE for
  sidebar metadata eligibility while preserving full event counts/revisions.
- Removed `last_content` as a title fallback.
- Added sidecar tests for lifecycle-only conversations and first-turn
  user-facing metadata with later internal SDK events.
- Updated `CHANGELOG.md` with the sidecar metadata boundary change.

## Validation Log

- `./scripts/python-in-env sidecar pytest tests/sidecar/test_chat_event_store.py`
  - Passed: `10 passed in 2.28s`.
- `bin/windie docs list`
  - Passed.
- `git diff --check -- frontend/src/main/python/memory/chat_event_store.py tests/sidecar/test_chat_event_store.py docs/plans/2026-06-06-sidebar-conversation-metadata-boundary-plan.md docs/plans/2026-06-06-sidebar-conversation-metadata-boundary-report.md CHANGELOG.md`
  - Passed.
- `cd frontend && npm run test:ci -- DesktopConversationStore.test.ts DesktopConversationLibraryClient.test.ts`
  - Passed: `2 passed`, `11 tests passed`.
  - Existing warning: transcript session sync channel unavailable in Jest
    preload-less environment.
- `cd frontend && npm run test:ci -- ChatGptDashboardShell.test.jsx`
  - Passed: `1 passed`, `28 tests passed`.
  - Existing warnings: React `act(...)` warnings in dashboard shell tests.

## Commits

- `2e5c2ab45 fix(sidecar): filter sidebar metadata events`
  - Implements the sidecar metadata eligibility boundary, adds regression
    tests, records validation, and updates the changelog.

## Blockers

- None currently.
