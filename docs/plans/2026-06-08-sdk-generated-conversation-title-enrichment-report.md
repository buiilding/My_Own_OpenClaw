---
summary: "Implementation report for SDK-owned generated conversation title enrichment after the first completed user plus assistant exchange."
read_when:
  - When auditing generated conversation title writes, sidecar title-state RPCs, or SDK terminal-turn side effects.
title: "SDK Generated Conversation Title Enrichment Report"
---

# SDK Generated Conversation Title Enrichment Report

Date: 2026-06-08

Plan: `docs/plans/2026-06-08-sdk-generated-conversation-title-enrichment-plan.md`

## Status

Implemented and validated with focused SDK/sidecar coverage.

## Implementation Notes

- Added this report before code changes per the compaction-safe implementation workflow.
- Added SDK-owned generated-title enrichment after the first successful
  backend `turn_completed` with assistant text. The runtime captures the
  pending-turn user text and final assistant response, emits the completed-turn
  snapshot, then asynchronously checks sidecar title state, calls hosted title
  generation, and persists the generated title through local
  `update_conversation_title`.
- Kept title generation best-effort. Missing SDK title API, missing local RPC,
  no pending turn, empty user/assistant text, prior assistant text, durable
  title state, backend fallback `New chat`, generation failure, or update
  failure do not block transcript storage or turn completion.
- Added sidecar `get_conversation_title_state` JSON-RPC registration and handler
  backed by the existing `conversation_titles` helper so the SDK can avoid
  overwriting locked/manual/model/unknown durable titles.
- Updated SDK, sidecar memory, dashboard title-invalidation docs, and
  `CHANGELOG.md`.

## Validation Log

- Passed: `bin/windie test frontend -- WindieSdkConversationRuntime.test.ts`
- Passed: `./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_local_backend.py tests/sidecar/test_chat_event_store.py -q`
- Passed: `bin/windie test backend tests/backend/test_memory_routes.py -q`
- Passed: `bin/windie test frontend -- UseDashboardConversations.test.jsx`
- Passed: `bin/windie docs list`
- Passed: `git diff --check`
- Not passing, unrelated to this title change:
  `bin/windie test frontend -- WindieSdkClient.test.ts
  UseDashboardConversations.test.jsx` failed only in `WindieSdkClient.test.ts`
  with stale memory/search/send-order and stream diagnostic expectations. The
  dashboard test in that same invocation passed.
- Not passing, unrelated to this title change:
  `bin/windie test sidecar tests/sidecar/test_local_backend.py -q` expanded to
  the broader sidecar suite and failed
  `tests/sidecar/test_tool_manifest.py::test_generated_builtin_manifest_matches_sidecar_source`
  for generated tool-manifest drift.

## Design Inspection

- Touched SDK, sidecar, renderer-doc, and test paths were reread after
  implementation.
- Search confirmed the only hosted `/api/semantic/title` callers remain SDK
  clients/tests and backend route code. The sidecar has no hosted title HTTP
  client and does not import backend code.
- Renderer remains a consumer of metadata invalidation/list reload behavior; no
  renderer-owned title generation path was added.
- Existing conversation listing fallback remains unchanged:
  `stored title -> first user message -> conversation id`.

## Migration Note

- No schema migration is required. The existing `conversation_titles` table,
  title-state helper, generated-title upsert, and title invalidation event are
  reused.
