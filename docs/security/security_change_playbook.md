---
summary: "Security change playbook for WindieOS auth, IPC, validation, credential, permission, tool-policy, and local execution changes."
read_when:
  - When implementing or reviewing a security-sensitive WindieOS change.
  - When deciding which tests and docs must move with an auth, IPC, validation, credential, permission, tool, local-runtime, or local-runtime Python implementation change.
title: "Security Change Playbook"
---

# Security Change Playbook

Use this playbook for changes that alter trust boundaries or local-machine authority. Keep the change anchored to the enforcing layer and update docs/tests in the same pass.

## Hosted Auth or Identity

Read:

- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Multi-User Runtime Hardening](../operations/multi_user_runtime_hardening.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

Likely code:

- `backend/src/api/auth/*`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/core/config/models.py`
- frontend token propagation/storage code in `frontend/src/main` and renderer infrastructure

Validate:

- install registration success/failure
- REST middleware missing/invalid/valid token behavior
- websocket auth derives identity from token
- claimed `user_id` mismatch is ignored when token is valid
- same-user active connection cleanup does not kill another active connection

## IPC or Preload Exposure

Read:

- [Preload Channel Allowlist](../frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md)
- [IPC Channel and Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md)
- [Channels Hub](../channels/README.md)

Likely code:

- `frontend/src/shared/ipcChannels.json`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs` or owned main-process runtime module

Validate:

- invalid renderer channel rejection/ignore behavior
- typed bridge constants and preload allowlist parity
- main-process handler exists for every new invoke/send channel
- listeners clean up correctly for new event channels

Do not add a generic "run privileged action" channel. Add a narrow channel with typed payloads and a clear owner.

## Backend Validation or Error Surface

Read:

- [Input Validation and Client Settings Patch Guard](../backend/core/validation/input_validation_and_client_settings_patch_guard_reference.md)
- [Backend API and Transport](../backend/api/api_and_transport.md)
- [Backend Contracts Docs Hub](../backend/contracts/README.md)

Likely code:

- `backend/src/api/schemas/*`
- `backend/src/core/validation/*`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/handlers/*`

Validate:

- valid payloads still pass.
- malformed payloads fail at schema/validation boundary.
- validation errors expose useful field-level detail.
- unexpected internal errors are sanitized.
- handler routing/schema literal tests still align.

## Credentials or Provider Secrets

Read:

- [Credential and Token Change Workflow](credential_token_change_workflow.md)
- [Provider Credentials](../providers/credentials.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Providers Hub](../providers/README.md)

Likely code:

- `backend/src/core/config/models.py`
- `backend/src/core/config/loader.py`
- provider files under `backend/src/llm/providers`
- renderer provider settings only for explicit renderer-managed overrides/OAuth entries

Validate:

- no real key appears in docs/tests/fixtures.
- missing credentials produce safe unavailable/provider-health behavior.
- renderer-managed keys do not become broad backend config patches.
- hosted install auth remains separate from provider credentials.

## Permissions and Local Machine Authority

Read:

- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Platforms Hub](../platforms/README.md)
- [Security Boundary Matrix](security_boundary_matrix.md)

Likely code:

- `frontend/src/main/permission*`
- `frontend/src/renderer/features/onboarding/**`
- platform-specific main/local-runtime adapters
- local-runtime Python computer/browser tool implementations

Validate:

- permission probes match actual OS capability.
- onboarding/settings surfaces do not claim access before probes pass.
- denied permissions hide or fail local tools cleanly.
- platform-specific screenshot/input behavior remains isolated.

## Tool Policy or Local-Runtime Execution

Read:

- [Tools Hub](../tools/README.md)
- [Tool Policy Profiles and Capabilities](../tools/tool_policy_profiles_and_capabilities.md)
- [Local Tool Channels](../channels/sidecar_and_tool_channels.md)
- [Backend Tools Security Docs Hub](../backend/tools/security/README.md)

Likely code:

- `backend/src/tools/tool_policy.py`
- `backend/src/tools/**`
- `backend/src/agent/tools/**`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/python/tools/**`

Validate:

- model-visible schema narrows as intended.
- parser validation matches visible tools.
- local-runtime execution validates executable payloads independently.
- tool-result ingress preserves request ids and failure outputs.
- local filesystem/shell/browser/computer tests cover risky edge cases.

## Final Checklist

Before finishing:

1. identify the enforcing boundary in [Security Boundary Matrix](security_boundary_matrix.md).
2. update owner tests and at least one consumer/producer boundary test when payloads cross runtimes.
3. update feature docs plus this security hub when the trust model changes.
4. run `<windie> docs list`.
5. confirm `git diff --check` is clean for touched files.
