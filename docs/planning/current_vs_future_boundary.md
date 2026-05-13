---
summary: "Planning boundary guide separating current WindieOS implementation docs from proposed, future, roadmap, and speculative work."
read_when:
  - When documenting a capability that is planned, proposed, partially implemented, or not yet backed by code.
  - When deciding whether a doc belongs in stable docs, planning docs, operations docs, or an ADR.
title: "Current vs Future Boundary"
---

# Current vs Future Boundary

Planning docs can describe ambitious future work, but stable docs must not make future behavior sound current. Use this boundary before adding roadmap claims to architecture, operations, install, or user-facing docs.

## Status Labels

| Label | Meaning | Where it belongs |
| --- | --- | --- |
| implemented | code root, runtime owner, validation path, and docs exist | stable docs plus planning can link as shipped |
| implemented as mode | exists inside another runtime, not a standalone node/service | stable docs with explicit owner |
| partial | some code exists, but major runtime or UX contract is missing | stable docs for current piece; planning for target state |
| planned | product/architecture plan exists, no implementation contract yet | `docs/planning/` |
| proposed | idea needs design/security/ownership decisions | `docs/planning/` or ADR draft |
| deprecated/stale | plan no longer matches current direction | trim, mark stale, or replace |

## Documentation Rules

- Stable docs describe what code does today.
- Planning docs describe what should exist later.
- Future API examples must be marked proposed unless the route exists.
- Future nodes must not be added to runtime-node docs until they have a process, lifecycle, protocol, and tests.
- Future plugin/marketplace claims belong in planning until runtime loading, trust, isolation, and install flows exist.
- Future billing/usage claims belong in planning until enforcement and ledger code exist.

## Promotion Rule

A plan can move into stable docs only when:

1. code root exists
2. owner runtime is clear
3. protocol/config/schema is documented
4. validation commands exist
5. security boundary is reviewed
6. operations/debug route exists if runtime-facing
7. old planning language is either trimmed or marked completed

## Related Docs

- [Planning Hub](README.md)
- [Roadmap Status Matrix](roadmap_status_matrix.md)
- [Plan Promotion Checklist](plan_promotion_checklist.md)
- [Current vs Future Nodes](../nodes/current_vs_future_nodes.md)
- [Current vs Future Plugin Boundary](../plugins/current_vs_future_plugin_boundary.md)
