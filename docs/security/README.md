---
summary: "Security hub for WindieOS hosted auth, IPC isolation, schema validation, credentials, tool execution, local-runtime boundaries, and multi-user risks."
read_when:
  - When changing security-relevant behavior across backend, frontend,
    local-runtime implementation, tools, providers, hosted auth, or packaging.
  - When deciding which trust boundary owns an auth, IPC, credential, permission, tool-execution, or multi-user issue.
title: "Security Hub"
---

# Security Hub

WindieOS security spans hosted backend identity, Electron renderer isolation, backend validation, provider credentials, permission checks, tool policy, and local execution through the local-runtime Python implementation. Start here when a change affects trust, secrets, local machine control, or multi-user hosted behavior.

## Start Here

- [Security Boundary Matrix](security_boundary_matrix.md) for owner/code/test routing by trust boundary.
- [Security Change Playbook](security_change_playbook.md) for how to change auth, IPC, validation, credentials, permissions, tools, or local execution.
- [Permissions and Local Authority Workflow](permissions_and_local_authority_workflow.md) for screen/input/microphone/browser/workspace/sudo authority changes.
- [Credentials and Tokens Matrix](credentials_and_tokens_matrix.md) for install tokens, runs keys, provider keys, OAuth state, and local-runtime remote-client auth.
- [Credential and Token Change Workflow](credential_token_change_workflow.md) for changing install auth, bearer tokens, runs keys, provider credentials, OAuth state, local-runtime remote-client auth headers, and secret logging boundaries.
- [Operations Security](../operations/security.md) for current security notes.
- [Safety Boundaries](../concepts/safety_boundaries.md) for the conceptual safety model.
- [Hosted Backend Auth](../operations/hosted_backend_auth.md) for install-token REST and websocket identity.
- [Multi-User Runtime Hardening](../operations/multi_user_runtime_hardening.md) for shared backend risks.

## Security Areas

| Area | Security job | Primary docs |
| --- | --- | --- |
| Hosted auth | Derive backend identity from install token, not client claims | [Hosted Backend Auth](../operations/hosted_backend_auth.md), [HTTP and WebSocket API Surface](../reference/http_api_surface.md) |
| WebSocket validation | Parse/validate handshakes and incoming messages, cap tasks, sanitize errors | [Backend API and Transport](../backend/api/api_and_transport.md), [Backend WebSocket Docs Hub](../backend/api/websocket/README.md) |
| Renderer isolation | Keep privileged APIs behind preload allowlists and typed IPC bridge | [Preload Channel Allowlist](../frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md), [IPC Channel Reference](../frontend/contracts/ipc_channel_and_handler_reference.md) |
| Settings patch guard | Accept only allowed client settings fields from renderer updates | [Input Validation and Client Settings Patch Guard](../backend/core/validation/input_validation_and_client_settings_patch_guard_reference.md) |
| Credentials | Keep API keys in env or explicit provider credential surfaces | [Credential and Token Change Workflow](credential_token_change_workflow.md), [Provider Credentials](../providers/credentials.md), [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md) |
| Tool execution | Narrow model-visible capabilities and route local actions through SDK/main local execution boundaries | [Tools Hub](../tools/README.md), [Backend Tools Security Docs Hub](../backend/tools/security/README.md) |
| Permissions | Gate screen/input/microphone/browser capabilities through OS-aware probes and onboarding | [Onboarding and Permissions](../desktop/onboarding_permissions.md), [Platform Docs](../platforms/README.md) |
| Local runtime implementation | Keep local JSON-RPC, filesystem/shell/browser/computer actions, and subprocess protocols explicit through the current local-runtime Python implementation | [Local Tool Channels](../channels/sidecar_and_tool_channels.md), [Local Runtime Python Implementation Docs Hub](../frontend/sidecar/README.md) |
| Future compliance | Plan durable hosted security/compliance before implementing broad hosted features | [Planning Hub](../planning/README.md) |

## Rules

- Do not commit real credentials, tokens, user data, local private paths, or generated machine secrets.
- Do not add broad preload channels to bypass renderer/main boundaries.
- Do not let Electron client or local-runtime Python implementation code import
  backend schemas for parity; add contract tests instead.
- Do not trust renderer-provided user identity when hosted install auth is enabled.
- Do not expose unavailable tools or coordinate methods to the model.
- Do not route local machine actions through hosted SDK routes.
- Do not turn future security plans into docs that imply implementation already exists.

## Validation Defaults

When a security boundary changes, run the focused tests for that boundary:

- hosted auth: backend auth middleware, install registration, websocket handshake tests
- IPC/preload: bridge validation, preload allowlist, main handler tests
- backend validation: schema, input validation, sanitized error tests
- tool security: tool policy/schema/filtering tests, local-runtime executable
  tool tests
- credentials/config: config loader and provider credential tests
- permissions/platform: renderer onboarding, main permission service, platform-specific tests

Always run `<windie> docs list` after docs updates.

## Evidence Notes

- Security-sensitive changes need evidence at the trust boundary that rejects,
  redacts, or authorizes the action.
- Logs used as proof must be checked for credential leakage before being copied
  into docs, tests, or reports.
