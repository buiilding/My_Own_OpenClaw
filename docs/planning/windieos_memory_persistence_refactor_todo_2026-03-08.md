---
summary: "Historical TODO for transcript-vs-interaction persistence refactor; superseded by SDK-owned completed-turn memory persistence."
read_when:
  - When refactoring completed-turn persistence, transcript storage, or SDK-owned memory writes.
  - When debugging why chats appear in transcript history but not in Episodic Memory.
title: "WindieOS Memory Persistence Refactor TODO (2026-03-08)"
---

# WindieOS Memory Persistence Refactor TODO (2026-03-08)

## Goal

Make completed-turn interaction persistence explicit and test-backed so transcript storage and episodic interaction memory do not drift.

Current architecture note: this historical plan originally routed interaction
memory through a backend websocket persistence event. That path has been
superseded. SDK chat sessions now own completed-turn local memory writes after
terminal assistant completion.

## Completed

- [x] Extract post-terminal query-stream policy into a dedicated helper instead of inline branching in `QueryExecutionService`.
- [x] Extract executor completion side effects into a dedicated helper module.
- [x] Add an executor-level regression proving a completed `user -> assistant` turn yields an interaction memory event in addition to transcript history writes.
- [x] Refresh docs/changelog so transcript rows and interaction memory rows are described as separate persistence artifacts.

## Follow-up

- [ ] Split transcript persistence and interaction-memory persistence into separately named frontend-sidecar modules.
- [ ] Add one cross-process integration test proving SDK completed-turn memory persistence writes `record_kind='interaction'` in the local episodic DB after a completed turn.
- [ ] Rename any remaining overloaded "episodic" references that still mean "transcript storage" rather than surfaced interaction memory.
