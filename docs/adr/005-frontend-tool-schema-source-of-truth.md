---
summary: "ADR 005 for exploring a frontend/sidecar executable tool schema source of truth while preserving backend-owned model-facing policy and import-independent parity."
read_when:
  - When changing backend tool schemas, sidecar executable tool manifests, schema parity tests, tool catalog generation, or provider-visible tool policy.
  - When evaluating whether frontend/sidecar should publish executable tool manifests consumed by the backend.
title: "ADR 005: Frontend Tool Schema Source of Truth"
---

# ADR 005: Frontend Tool Schema Source of Truth

## Status

Proposed. Current implementation remains backend-owned for model-facing schemas, with sidecar-owned executable behavior and parity enforced by tests.

## Context

WindieOS has two related but distinct tool contracts:

- backend model-facing schemas: what the LLM sees and what policy/capability gates can expose
- sidecar executable tools: what actually runs on the user's machine

Today, the backend owns the model-facing tool catalog and emits tool calls to the frontend. The sidecar owns local tool execution. Frontend and sidecar must not import backend Python code for schema parity.

The planned schema-ownership migration explores whether the frontend/sidecar should publish a versioned executable manifest that the backend can consume to reduce drift.

## Decision

Keep current behavior unless and until a manifest-based schema pipeline is implemented.

Current rules:

- backend owns model-facing schemas and policy gates
- sidecar owns executable tool implementation
- frontend/sidecar do not import backend code
- drift prevention uses explicit parity tests and generated/shared contracts

Proposed future direction:

- sidecar/frontend can publish a signed/versioned executable manifest
- backend can consume the manifest to build or validate model-facing schemas
- backend still owns model-facing policy, provider adaptation, and capability narrowing
- compatibility checks reject unknown or incompatible manifest versions
- fallback uses last-known-good schemas when manifest refresh fails

## Alternatives Considered

| Alternative | Reason not chosen now |
| --- | --- |
| backend remains permanent sole source for all schemas | simpler today, but executable drift can grow as sidecar tools evolve |
| sidecar becomes sole source for model-facing schemas | loses backend policy/provider context and hosted capability control |
| frontend imports backend schema code | violates runtime boundary and breaks open-source client/backend separation |
| backend imports sidecar runtime code | couples hosted backend to local desktop dependencies |

## Consequences

- Tool docs must keep backend model-facing and sidecar executable contracts distinct.
- Any manifest proposal needs compatibility, trust, signing, and fallback behavior.
- Current implementation work should update backend schema, sidecar execution, docs, and parity tests together.

## Validation And Docs Impact

If this ADR moves from proposed to accepted/implemented:

- update [Tool Contracts](../tools/tool_contracts.md)
- update [Tool Catalog Matrix](../tools/tool_catalog_matrix.md)
- update [Backend Tools Docs Hub](../backend/tools/README.md)
- update [Frontend Sidecar Tools Docs Hub](../frontend/sidecar/tools/README.md)
- add manifest parsing, compatibility, malicious/malformed manifest, and fallback tests
- update [Security Change Playbook](../security/security_change_playbook.md)
