---
summary: "Matrix of WindieOS trust boundaries with security jobs, owning code, failure signals, and validation targets."
read_when:
  - When a change crosses backend, Electron main, renderer, local-runtime, local-runtime Python implementation, or SDK trust boundaries or touches auth, validation, credentials, permissions, or local tool execution.
  - When debugging security-sensitive failures such as 401/1008, invalid IPC channels, hidden tools, permission denial, or local execution errors.
title: "Security Boundary Matrix"
---

# Security Boundary Matrix

Use this matrix to route a security-sensitive change to its owner. Security issues in WindieOS usually cross more than one runtime, but the fix should still land at the boundary that enforces the invariant.

| Boundary | Enforces | Code roots | Failure signals | Validate |
| --- | --- | --- | --- | --- |
| Hosted REST auth | Bearer install token on `/api/*` except registration | `backend/src/api/auth/*` | HTTP `401`, `503`, missing install identity | auth middleware and registration tests |
| Hosted websocket auth | authenticated install identity overrides client `user_id` | `backend/src/api/routes/websocket/connection.py` | close `1008`, user-id mismatch logs | websocket handshake/auth tests |
| Runs API key | optional shared key for `/api/runs/*` | `backend/src/api/routes/runs/support.py` | HTTP `401` on runs endpoints | runs route tests |
| WebSocket schema validation | handshake and incoming message shape | `backend/src/api/schemas/*`, `backend/src/api/routes/websocket/*` | policy close, validation error envelope | schema/handler tests |
| Error sanitization | safe client-visible backend errors | `backend/src/api/infrastructure/errors.py` | unsafe detail leakage or overly generic validation errors | `tests/backend/test_api_errors.py` |
| Client settings patch guard | renderer can update only allowed client settings | `backend/src/core/validation/settings_update_rules.py`, `validators.py`, `backend/src/api/handlers/settings.py` | unknown setting dropped, invalid update rejected | validation/settings tests |
| Preload allowlist | renderer sees only approved IPC methods/channels | `frontend/src/preload.js`, `frontend/src/shared/ipcChannels.json` | invalid channel ignored/rejected | preload/bridge validation tests |
| Main IPC handlers | privileged actions stay in Electron main | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/*`, `frontend/src/main/*_runtime.cjs` | unhandled invoke/send, wrong window/permission behavior | main-process IPC tests |
| Permission probes | OS-level screen/input/mic/browser capability checks | `frontend/src/main/permission*`, renderer onboarding/settings | permission stuck/misreported | permission/onboarding tests |
| Tool capability policy | model sees only allowed/executable tools | `backend/src/tools/tool_policy.py`, `backend/src/tools`, `backend/src/agent/tools` | tool visible when disabled or hidden when needed | schema/policy tests |
| Tool executor policy | backend security policy/audit/sandbox registry primitives | `backend/src/core/security/*` | permission/audit/sandbox mismatch | backend tools security tests |
| Local-runtime tool execution | local actions validate args and normalize results | `frontend/src/main/python/tools/**` | local action failure, unsafe path, shell/browser errors | local-runtime Python pytest tests |
| Provider credentials | keys come from env or explicit credential stores | `backend/src/core/config/*`, provider loaders, renderer provider settings | provider unavailable, credential not found | config/provider tests |
| Artifact storage | uploaded files get bounded, addressable artifact refs | `backend/src/api/routes/artifacts/*`, `backend/src/services/artifacts/*` | upload/fetch failure, wrong content type | artifact route/client tests |
| Multi-user sessions | one user's state/config/history does not bleed into another | session manager, websocket connection cleanup, hosted auth | shared state, disconnect kills active device | multi-user/session tests |

## Boundary Rules

Backend boundaries should:

- validate all external HTTP/websocket input.
- sanitize unexpected internal errors.
- derive hosted identity from server-authenticated credentials.
- narrow model-visible capabilities before prompt construction.
- keep API keys in environment/config-owned credential paths.

Frontend boundaries should:

- keep renderer sandboxed behind preload allowlists.
- route privileged work through typed IPC.
- keep local config patches scoped to allowed client settings fields.
- avoid direct backend-code imports.
- preserve request ids and conversation/session refs when relaying tool results.

Local-runtime boundaries should:

- validate executable tool payloads at runtime.
- keep filesystem/shell/browser/computer actions explicit.
- return structured errors instead of crashing the bridge.
- treat local memory and transcript storage as local user data.

## High-Risk Change Signals

Escalate review and tests when a change:

- adds a new IPC channel.
- changes auth headers, token storage, or websocket identity.
- changes allowed renderer settings fields.
- changes tool visibility, tool policies, or local-runtime execution.
- changes filesystem/shell/browser/computer controls.
- stores or transmits user files, screenshots, transcript rows, provider keys, or install tokens.
- changes multi-user session cleanup or per-user config lookup.

## Related Docs

- [Security Hub](README.md)
- [Security Change Playbook](security_change_playbook.md)
- [Operations Security](../operations/security.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Backend Tools Security Docs Hub](../backend/tools/security/README.md)
- [Frontend Preload Channel Allowlist](../frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md)
