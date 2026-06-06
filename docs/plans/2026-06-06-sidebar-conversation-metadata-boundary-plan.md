---
summary: "Compaction-safe plan for making sidebar conversation metadata derive only from user-facing conversation facts, preventing SDK lifecycle events from appearing as titles, previews, or workspace groups."
read_when:
  - When changing sidebar recent-conversation metadata, workspace grouping, generated-title fallback, SDK event persistence, or sidecar chat conversation listing.
  - When debugging sidebar labels such as "No workspace", "[sdk event: turn_started]", or other internal SDK event names in user-facing conversation lists.
title: "Sidebar Conversation Metadata Boundary Plan"
---

# Sidebar Conversation Metadata Boundary Plan

## User Intent

The user wants the first visible identity of a new chat to come from the
conversation the user actually started, not from SDK lifecycle internals.

Intended product behavior:

```text
first send
  -> conversation is associated with the active workspace used for the send
  -> provisional sidebar title is the first user message
  -> sidebar preview is the first user-facing message or response
  -> generated/manual title may replace the provisional title later
  -> SDK lifecycle event names never appear as chat titles or previews
```

The symptom under investigation is a new/first-send sidebar entry showing
labels such as `No workspace` and `[sdk event: turn_started]` even though the
active workspace is already selected and the intended fallback before title
generation is the first user message.

## Working Diagnosis To Verify

This plan starts from the working hypothesis that sidebar metadata can become
visible from an SDK lifecycle event before the durable user-facing message and
workspace metadata are visible to the listing path:

```text
conversation exists
latest stored/visible event = turn_started
workspace metadata = empty
generated title = not ready yet
first user message = not persisted/readable yet
```

That hypothesis must be verified against live code and local DB behavior before
implementation. If inspection shows the actual leak is different, keep the
target invariant but update the execution report with the corrected producer
and fix that root cause instead.

## Target Architecture

Target boundary:

```text
SDK events are the runtime truth.
Sidebar metadata is the human-facing summary of that truth.
```

Runtime event ownership stays in the SDK. The sidecar may durably store
normalized SDK events, including lifecycle events. The sidebar/recent list must
not treat every stored event as user-facing metadata.

Target path:

```text
Renderer
  -> creates/reuses conversationRef
  -> binds conversationRef to active workspace
  -> sends text + conversationRef + workspacePath + turnRef

Electron main
  -> validates/enriches payload
  -> attaches AGENTS.md layers for workspacePath
  -> forwards through SDK runtime
  -> does not invent sidebar title or workspace labels

SDK conversation runtime
  -> records canonical normalized events
  -> may record internal lifecycle events such as turn_started
  -> records user_message as the first user-facing fact

Sidecar store
  -> stores SDK events durably
  -> exposes sidebar metadata from user-facing facts only

Sidebar/recent list
  -> groups by persisted workspace_path
  -> titles by generated/manual title, else first user_message
  -> previews by latest user-facing message
```

## Source Of Truth Changes

| Surface | Current risk | Target owner |
| --- | --- | --- |
| SDK event log | Contains lifecycle and user-facing events together | SDK runtime |
| Durable event storage | Stores all normalized events, including lifecycle rows | Sidecar store implementation |
| Sidebar metadata | May read raw event rows too broadly | Sidecar metadata query, consumed by SDK store and renderer |
| Provisional title | Must be first user message before generated title | Sidecar metadata query and title store |
| Workspace grouping | Must reflect the workspace used for the conversation send | Renderer binding plus durable metadata query |
| Renderer sidebar | Should render metadata, not infer event semantics | Renderer dashboard/sidebar |

## In Scope

- Inspect and document the exact producer path for the bad sidebar metadata.
- Prevent SDK lifecycle/internal events from being eligible for sidebar title
  fallback, sidebar preview/last-message fallback, or conversation visibility.
- Preserve the existing generated/manual title override behavior.
- Preserve first-user-message provisional title behavior.
- Preserve workspace grouping from persisted conversation metadata.
- Add tests covering first-turn metadata before generated title exists.
- Add tests covering later internal SDK events such as `memory_store_changed`
  not replacing user-facing previews.
- Update docs/report with the verified behavior and validation evidence.

## Out Of Scope

- Redesigning the sidebar UI.
- Changing backend prompt construction or provider behavior.
- Changing model-facing tool schemas.
- Removing lifecycle events from SDK/runtime storage.
- Changing title generation quality or timing, except preserving its existing
  role as an upgrade over the first-message fallback.
- Migrating old local DB rows unless inspection proves a migration is required
  for correctness. If no migration is required, record that explicitly.

## Design Rules

- Sidebar metadata must be derived from a named allowlist of user-facing event
  types, not from arbitrary nonempty `content`.
- Internal SDK event names such as `turn_started`, `turn_completed`,
  `usage_updated`, `memory_store_changed`, `settings_updated`, and compaction
  lifecycle events must not appear as sidebar title or preview text.
- A conversation with only lifecycle/internal rows should not become a normal
  recent-chat entry.
- A conversation with `turn_started` plus `user_message` should list with the
  first user message as title before generated title exists.
- A generated/manual title in `conversation_titles` still wins over fallback
  titles.
- Workspace grouping should use the latest valid persisted workspace metadata
  for the conversation, ideally from user-facing rows. If implementation
  discovers workspace metadata is only present on lifecycle rows, classify and
  fix the write path instead of broadening display eligibility.
- Do not add renderer-side special cases for SDK event names when the sidecar
  metadata query is the producer of the sidebar metadata.

## Ordered Workflow

1. Create the matching execution report under `docs/plans/` after approval.
2. Reread these anchors after any context compaction:
   `docs/frontend/runtime/workspace_context_change_workflow.md`,
   `docs/sdk/conversation_runtime.md`,
   `docs/reference/session_and_transcript_reference.md`,
   `frontend/src/main/python/memory/chat_event_store.py`,
   `frontend/src/main/python/local_backend_memory_handlers.py`,
   `packages/windie-sdk-js/src/stores/SidecarConversationStore.ts`,
   `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`,
   `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`,
   `frontend/src/renderer/features/dashboard/utils/conversationGroups.js`,
   `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`,
   and the focused tests under `tests/sidecar` and `tests/frontend`.
3. Inspect recent related commits and blame for the listing/store paths:
   sidecar conversation listing dedupe, SDK display/history migration,
   SDK live transcript writer, and renderer command routing.
4. Reproduce or simulate the metadata state using tests or a temporary local DB:
   only `turn_started`, `turn_started` plus `user_message`, generated title
   present, workspace present, and later lifecycle events appended.
5. Classify every row family used by the sidecar listing query as one of:
   title-visible, preview-visible, workspace-visible, ordering-only,
   debug-only, or not eligible for sidebar metadata.
6. Design the sidecar metadata contract:
   define the allowlist and SQL predicates for visible conversations, title
   fallback, preview fallback, and workspace extraction.
7. Implement the sidecar query slice in
   `frontend/src/main/python/memory/chat_event_store.py`.
8. Update or add sidecar tests in `tests/sidecar/test_chat_event_store.py`:
   only lifecycle rows are hidden; first user message becomes the provisional
   title; generated title still wins; lifecycle rows do not become preview text;
   workspace grouping metadata remains populated.
9. Inspect the SDK store adapter after the sidecar slice:
   verify `SidecarConversationStore.listMetadata(...)` maps the sidecar result
   without reintroducing lifecycle fallback text.
10. Inspect renderer dashboard/sidebar consumers:
    verify `useDashboardConversations` and `conversationGroups` consume
    metadata directly and do not need SDK event-name filters.
11. Add or update focused frontend tests only if renderer behavior changes or if
    a regression test is needed to prove the sidebar renders metadata as
    produced.
12. Decide whether existing rows need migration:
    if old rows can remain safely because the query filters them, record
    "no migration required"; otherwise define the smallest migration or cleanup.
13. Run validation, update the execution report, then repeat an inspection pass:
    sidecar query, SDK adapter, renderer grouping, title-generation invalidation,
    and workspace binding send path. Continue until no in-scope leak remains.

## Checklist

- [ ] Execution report created after approval.
- [ ] Live code and local DB behavior inspected before implementation.
- [ ] Event eligibility allowlist documented in the report.
- [ ] Sidecar listing hides conversations with only internal lifecycle rows.
- [ ] First user message is the provisional title before generated title exists.
- [ ] Generated/manual title still overrides fallback title.
- [ ] Sidebar preview/last message ignores internal lifecycle rows.
- [ ] Workspace metadata remains correct for first-send conversations.
- [ ] SDK store adapter does not reintroduce lifecycle fallback text.
- [ ] Renderer sidebar does not add duplicate event-name filtering.
- [ ] Migration/no-migration decision recorded.
- [ ] Focused tests pass.
- [ ] Docs listing and diff checks pass.
- [ ] Fresh inspection finds no remaining in-scope metadata leaks.

## Success Criteria

- A conversation containing only internal lifecycle rows is not listed as a
  normal recent chat.
- A first-turn conversation with `turn_started` and `user_message` but no
  generated title appears under the correct workspace with the first user
  message as title.
- Later SDK internal events do not replace the sidebar preview with
  `[sdk event: ...]`.
- Generated/manual title behavior remains unchanged.
- Existing display/replay behavior still reads the full SDK event log; only
  sidebar metadata eligibility is narrowed.
- The report records the verified cause, implementation decisions, validation
  results, and migration/no-migration decision.

## Validation Commands

Run these after implementation, adjusting only if inspection proves a different
owner path:

```bash
bin/windie docs list
./scripts/python-in-env sidecar pytest tests/sidecar/test_chat_event_store.py
cd frontend && npm run test:ci -- DesktopConversationStore.test.ts DesktopConversationLibraryClient.test.ts ChatGptDashboardShell.test.jsx
git diff --check
```

If renderer code is untouched after inspection, record why any frontend tests
were skipped or narrowed in the execution report.

## Assumptions

- Title generation is intentionally asynchronous and should remain an upgrade
  over the first-message fallback.
- SDK lifecycle events remain valuable for runtime state, replay, debugging,
  and tests; the fix should not delete them from the event log.
- The sidecar conversation listing is the correct boundary for sidebar
  metadata eligibility because it is the producer of recent conversation
  metadata consumed by SDK and renderer surfaces.
- Existing local DB rows should not need mutation if the listing query filters
  them correctly.
