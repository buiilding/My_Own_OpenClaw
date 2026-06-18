---
summary: "Architecture Decision Records hub for durable WindieOS technical decisions, current ADR status, and when to create or update decision records."
read_when:
  - When a technical decision affects multiple WindieOS runtimes, trust boundaries, schemas, packaging, hosted APIs, or long-term extension policy.
  - When existing docs mention an ADR or when a planning item needs a durable accepted/proposed/rejected decision record.
title: "Architecture Decision Records"
---

# Architecture Decision Records

Use ADRs for durable technical decisions that should outlive one implementation pass. ADRs are not roadmap plans; they capture a decision, the context that forced it, the alternatives considered, and consequences.

## ADR Index

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR 004: Browser Extension Auto-Attach Boundary](004-browser-extension-auto-attach.md) | proposed | Keep browser-extension auto-attach as future extension-mode work; current browser control remains dedicated-profile/CDP owned. |
| [ADR 005: Desktop Client Tool Manifest Source of Truth](005-frontend-tool-schema-source-of-truth.md) | accepted | Use desktop client/local-runtime executable tool manifests while preserving backend-owned model-facing policy and no runtime backend imports. |

## When To Add An ADR

Create or update an ADR when a decision:

- changes a runtime boundary
- changes auth, permissions, credentials, or trust policy
- changes model-facing or executable tool schemas
- changes packaged runtime or update/distribution policy
- introduces plugin, extension, or marketplace semantics
- makes a long-term tradeoff between hosted and local execution

Do not use ADRs for simple implementation notes, temporary TODOs, or task checklists. Put those in planning docs or the relevant subsystem docs.

## ADR Shape

Each ADR should include:

- status
- context
- decision
- alternatives considered
- consequences
- validation and docs impact

## Related Docs

- [Architecture Hub](../architecture/README.md)
- [Planning Hub](../planning/README.md)
- [Extension Points](../architecture/extension_points.md)
- [Security Change Playbook](../security/security_change_playbook.md)
