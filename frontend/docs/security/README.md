---
summary: "Public security hub for WindieOS frontend trust boundaries, renderer isolation, local authority, permissions, credentials handling expectations, and private-backend boundary routing."
read_when:
  - When changing frontend security-relevant behavior, renderer isolation,
    local-runtime authority, permissions, provider credential UI, or public
    security docs.
  - When deciding whether a trust-boundary topic belongs in public frontend
    docs or private backend docs.
title: "Frontend Security Hub"
---

# Frontend Security Hub

Public security docs cover the frontend and local-machine boundaries that
contributors can inspect and change in the public repo. Private backend docs own
hosted auth implementation, backend validation internals, backend tool policy,
production security runbooks, and multi-user backend hardening.

## Start Here

- [Permissions and Local Authority Workflow](permissions_and_local_authority_workflow.md)
- [Safety Boundaries](../concepts/safety_boundaries.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Platform Docs](../platforms/README.md)
- [Local Tool Channels](../channels/sidecar_and_tool_channels.md)
- [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md)

## Public Frontend Boundaries

| Area | Public owner | Rule |
| --- | --- | --- |
| Renderer isolation | preload allowlists, typed IPC bridge, renderer runtime clients | Do not expose broad Node.js or native authority to renderer code. |
| Permissions | onboarding, permission UI, Electron main permission services, platform probes | Do not mark a capability granted unless the OS probe or privileged action confirms it. |
| Local tool authority | local-runtime Python tools, SDK/main dispatch, permission-aware adapters | Local actions stay on the user's machine and must validate arguments before execution. |
| Provider credential UI | renderer settings and encrypted main-process storage paths | Never display, log, or commit raw credentials. |
| Browser automation | dedicated browser runtime and browser permission surface | Do not treat dedicated browser control as arbitrary user-browser control. |
| Public docs | frontend docs, SDK contracts, contributor workflows | Describe contracts without publishing private backend runbooks or secrets. |

## Private Backend Security

These topics belong in private backend docs:

- install-token service internals
- hosted REST and websocket auth implementation
- backend Pydantic validation internals
- backend tool policy and model-visible schema enforcement
- backend provider environment policy
- runs API key enforcement and VM control-plane security
- production incident/security runbooks

Public docs can reference that a private backend boundary exists, but should not
publish backend operator procedures or implementation-only paths.

## Rules

- Do not commit real credentials, tokens, user data, local private paths, or
  generated machine secrets.
- Do not add broad preload channels to bypass renderer/main boundaries.
- Do not let frontend or local-runtime code import private backend internals for
  schema parity; use public contracts and tests.
- Do not trust renderer-provided identity for hosted backend behavior.
- Do not route local machine actions through hosted SDK routes.
- Do not document planned hosted security features as implemented behavior.

## Validation

When a frontend security boundary changes, run focused checks for that boundary:

- IPC/preload: bridge validation, preload allowlist, and main handler tests
- permissions/platform: onboarding, permission service, and platform-specific tests
- local tools: local-runtime executable tool tests
- credentials/UI: provider settings and persistence tests
- docs: `<windie> docs check`
