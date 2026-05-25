---
summary: "Refactor planning hub for WindieOS ownership cleanup, deletion milestones, and migration notes."
read_when:
  - When planning or reviewing cross-runtime refactors.
  - When deciding how to simplify ownership boundaries without adding duplicate layers.
title: "Refactors Hub"
---

# Refactors Hub

Use this folder for focused refactor plans, migration notes, and deletion milestones.

Refactor notes should make ownership explicit:

- what layer owns the behavior
- what old path will be deleted
- what tests prove the boundary
- what debt remains intentionally
