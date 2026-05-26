---
summary: "Refactor planning hub for WindieOS ownership cleanup, deletion milestones, and migration notes."
read_when:
  - When planning or reviewing cross-runtime refactors.
  - When deciding how to simplify ownership boundaries without adding duplicate layers.
title: "Refactors Hub"
---

# Refactors Hub

Use this folder for focused refactor plans, migration notes, and deletion milestones.

## Plans

- [Chat Replay Send Convergence Plan](chat_replay_send_convergence_plan.md):
  focused medium-width plan for converging composer send, retry, and edit/resend
  onto one desktop live-turn query dispatch path while keeping replay rewrite
  and backend rehydrate preparation separate.
- [Remaining Architecture Refactor Plan](remaining_architecture_refactor_plan.md):
  current-state deletion checklist for query prompt assembly, backend event
  contracts, SDK source duplication, memory/config IPC, tool manifests, and
  Electron bridge ownership.
- [Runtime Ownership Simplification Plan](runtime_ownership_simplification_plan.md):
  broader ownership migration plan for renderer, main, SDK, sidecar, and backend
  responsibilities.

Refactor notes should make ownership explicit:

- what layer owns the behavior
- what old path will be deleted
- what tests prove the boundary
- what debt remains intentionally
