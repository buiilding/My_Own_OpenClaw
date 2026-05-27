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

- [SDK Display Rows Refactor Plan](sdk_display_rows_refactor_plan.md):
  focused plan for making the SDK expose one ordered display row list so
  Electron and future UIs only wrap rows visually instead of reconstructing,
  merging, deduping, or transforming active tool messages.
- [SDK Display Rows Refactor Report](sdk_display_rows_refactor_report.md):
  real-time implementation and validation report for the SDK display row
  ownership refactor.
- [Chat Replay Send Convergence Plan](chat_replay_send_convergence_plan.md):
  focused medium-width plan for converging composer send, retry, and edit/resend
  onto one desktop live-turn query dispatch path while keeping replay rewrite
  and backend rehydrate preparation separate.
- [Chat Replay Send Convergence Report](chat_replay_send_convergence_report.md):
  real-time implementation and validation report for the replay send
  convergence plan.
- [Remaining Architecture Refactor Plan](remaining_architecture_refactor_plan.md):
  current-state deletion checklist for query prompt assembly, backend event
  contracts, SDK source duplication, memory/config IPC, tool manifests, and
  Electron bridge ownership.
- [Remaining Architecture Refactor Real-Time Report](remaining_architecture_refactor_realtime_report.md):
  real-time implementation and validation report for the remaining architecture
  refactor checklist.
- [Runtime Ownership Simplification Plan](runtime_ownership_simplification_plan.md):
  broader ownership migration plan for renderer, main, SDK, sidecar, and backend
  responsibilities.

Refactor notes should make ownership explicit:

- what layer owns the behavior
- what old path will be deleted
- what tests prove the boundary
- what debt remains intentionally
