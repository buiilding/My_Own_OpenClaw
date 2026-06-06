---
summary: "Checklist for promoting WindieOS planning work into stable implementation docs, including code roots, tests, security, operations, docs hubs, and changelog updates."
read_when:
  - When a planned WindieOS feature ships or becomes partially implemented.
  - When deciding how to move roadmap language into architecture, concepts, operations, install, tools, providers, web, automation, nodes, or security docs.
title: "Plan Promotion Checklist"
---

# Plan Promotion Checklist

Use this checklist when a planning item becomes implemented behavior. The goal is to keep stable docs factual and prevent future-state claims from lingering in the wrong place.

## Required Before Promotion

| Requirement | Question |
| --- | --- |
| code root | What files implement the behavior? |
| owner runtime | Is the owner backend, Electron main, renderer, preload, sidecar, VM worker, gateway, or operations? |
| protocol/config | Did any API, websocket, IPC, JSON-RPC, env var, or schema change? |
| tests | Which focused tests prove the behavior? |
| security | Does it cross auth, permissions, credentials, local execution, hosted tenant, or IPC boundaries? |
| operations | Does it need install, deployment, logs, health, release, packaging, or troubleshooting docs? |
| user-facing docs | Does product/help/install/desktop docs need a current-behavior entry? |
| planning cleanup | Should the plan be marked completed, partially shipped, or stale? |

## Promotion Targets

| Planned feature type | Stable docs to update |
| --- | --- |
| runtime/process/node | `docs/nodes`, `docs/architecture`, `docs/operations` |
| hosted API/websocket route | `docs/gateway`, `docs/reference`, `docs/web`, SDK docs |
| desktop UI behavior | `docs/desktop`, frontend renderer/main docs, help docs |
| local tool or sidecar behavior | `docs/tools`, `docs/frontend/sidecar`, `docs/architecture/python_sidecar.md` |
| provider/inference capability | `docs/providers`, backend service docs, operations config |
| platform/install behavior | `docs/platforms`, `docs/install`, `docs/operations` |
| security/auth/permission behavior | `docs/security`, `docs/operations/security.md`, platform/help docs |
| automation/VM runs | `docs/automation`, `docs/nodes`, `docs/operations` |

## Commit Checklist

1. Update stable docs and hub links.
2. Update or trim planning docs.
3. Update `CHANGELOG.md`.
4. Run `bin/windie docs list`.
5. Run focused tests for the behavior.
6. Run link/whitespace checks for touched docs.
7. Commit the docs with the implementation or as the immediate follow-up.

## Related Docs

- [Current vs Future Boundary](current_vs_future_boundary.md)
- [Roadmap Status Matrix](roadmap_status_matrix.md)
- [Documentation Hub](../getting-started/docs_hub.md)
