---
summary: "Deep reference for role_snapshot helpers: role-ref parsing, ARIA tree interactive filtering, ref/nth generation, compacting rules, and snapshot stats computation."
read_when:
  - When modifying ARIA snapshot parsing/rendering in `role_snapshot.py`.
  - When debugging missing refs, duplicate nth tags, or interactive-only snapshot filtering behavior.
title: "ARIA Snapshot Ref Generation and Compaction Contract Reference"
---

# ARIA Snapshot Ref Generation and Compaction Contract Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/role_snapshot.py`

## Core Data Contracts

Dataclasses:

- `RoleRef(role, name, nth)`
- `RoleSnapshotStats(lines, chars, refs, interactive)`
- `RoleSnapshotOptions(interactive, max_depth, compact)`

Role sets:

- `INTERACTIVE_ROLES`
- `CONTENT_ROLES`
- `STRUCTURAL_ROLES`

These sets drive filtering/ref assignment behavior.

## Ref Parsing Contract

`parse_role_ref(raw)` accepts:

- `e1`
- `@e1`
- `ref=e1`

Output:

- normalized `e<digits>` string
- `None` for invalid/empty values

Regex guard requires exact `e\d+` shape.

## Snapshot Build Contract

`build_role_snapshot_from_aria_snapshot(aria_snapshot, options)`:

- default mode parses tree lines and assigns refs to interactive roles or named content roles
- `interactive=True` mode keeps only interactive nodes
- `max_depth` drops deeper lines
- `compact=True` removes unnamed structural lines and compacts empty branches

Ref assignment:

- refs generated sequentially (`e1`, `e2`, ...)
- duplicate role+name pairs get `nth` markers during build
- `_remove_nth_from_non_duplicates` strips `nth` for unique keys

## Stats Contract

`get_role_snapshot_stats(snapshot, refs)` computes:

- line count (`\n + 1`)
- character count
- total ref count
- interactive ref count

## Compaction/Filtering Drift Risks

1. Changing role set membership can unexpectedly remove/add ref-bearing nodes.
2. Depth/compact filters can hide content needed by downstream action selectors.
3. Altering ref format breaks consumers expecting `e<number>` convention.

## Related Pages

- [Frontend Sidecar Browser Role-Snapshot Docs Hub](README.md)
- [Frontend Sidecar Browser Contracts Docs Hub](../README.md)
