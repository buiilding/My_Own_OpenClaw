---
summary: "ADR 005 for the client/local-runtime executable tool manifest source of truth while preserving backend-owned model-facing policy and import-independent parity."
read_when:
  - When changing backend tool schemas, local-runtime executable tool manifests, schema parity tests, tool catalog generation, or provider-visible tool policy.
  - When evaluating whether the client/local-runtime manifest pipeline should publish executable tool manifests consumed by the backend.
title: "ADR 005: Client Tool Manifest Source of Truth"
---

# ADR 005: Client Tool Manifest Source of Truth

## Status

Accepted. Current implementation uses a client/local-runtime generated
built-in client tool manifest for local tools, with backend-owned manifest trust
checks, policy filtering, provider projection, and backend-native tools.

## Context

WindieOS has two related but distinct tool contracts:

- backend model-facing schemas: what the LLM sees and what policy/capability gates can expose
- local-runtime executable tools: what actually runs on the user's machine

Historically, the backend owned the local model-facing tool catalog and emitted tool calls to the frontend while the Python implementation directly carried local execution. That left local tools split across two runtime contracts and made drift easy.

The client/local-runtime pipeline now publishes a versioned executable
manifest for local built-in tools. The backend consumes the manifest during
handshake, validates it, applies policy/provider projection, and still owns
backend-native tools.

## Decision

Use the client/local-runtime manifest pipeline for built-in local tools.

Current rules:

- the client/local-runtime manifest pipeline owns built-in local tool
  schemas, while local-runtime Python code owns concrete executable implementations
- Electron consumes `frontend/src/main/generated/builtin_tool_manifest.json`
- the generated manifest is produced from `frontend/src/main/python/tools/manifest.py`
- built-in manifest entries keep `schema` for backend validation/capability
  reporting and `executable_schema` for direct local-runtime arguments when
  grounded tools need backend preparation before execution
- backend owns client-manifest envelope/trust checks, model-facing policy gates,
  provider adaptation, capability narrowing, and backend-native tools
- backend validates tool arguments only for backend-executed tools; local
  tool payload validation belongs to the SDK/main local execution path
- client/local-runtime Python code does not import backend code
- drift prevention uses explicit parity tests and generated/shared contracts

## Alternatives Considered

| Alternative | Reason not chosen now |
| --- | --- |
| backend remains permanent sole source for all schemas | executable drift grew as local-runtime Python tools evolved |
| local-runtime Python becomes sole source for all model-facing behavior | loses backend policy/provider context and hosted capability control |
| frontend imports backend schema code | violates runtime boundary and breaks open-source client/backend separation |
| backend imports local-runtime Python implementation code | couples hosted backend to local desktop dependencies |

## Consequences

- Tool docs must keep client/local-runtime schemas and backend-native schemas distinct.
- Built-in client/local-runtime schema changes update the frontend Python manifest source, regenerate the JSON artifact, and update tests.
- Backend-native tool changes still update backend schema/policy tests.
- Manifest compatibility, trust, signing, and fallback behavior remain future hardening work.

## Validation And Docs Impact

When changing this pipeline:

- update [Tool Contracts](../tools/tool_contracts.md)
- update [Tool Catalog Matrix](../tools/tool_catalog_matrix.md)
- update [Local-Runtime Tools Docs Hub](../frontend/sidecar/tools/README.md)
- update backend client-manifest validation tests when the accepted manifest shape changes
- add manifest parsing, compatibility, malicious/malformed manifest, and fallback tests for compatibility changes
- update Security Change Playbook (private backend docs) for trust-boundary changes
