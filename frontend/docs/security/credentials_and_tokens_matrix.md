---
summary: "Credential and token handling matrix for WindieOS install auth, runs keys, provider API keys, OAuth state, renderer config, and local-runtime remote clients."
read_when:
  - When changing install tokens, runs keys, provider credentials, OAuth state,
    renderer settings, or local-runtime remote clients.
  - When debugging 401s, missing provider keys, token persistence, SDK auth, or credential leakage risk.
title: "Credentials and Tokens Matrix"
---

# Credentials and Tokens Matrix

WindieOS uses several credential classes. Keep them separate: install auth identifies a desktop install to the hosted backend, runs keys protect VM worker/control routes, provider keys authenticate model/inference vendors, and OAuth state belongs to explicit provider-specific flows.

For implementation steps, owner code paths, debug routing, and validation commands, use [Credential and Token Change Workflow](credential_token_change_workflow.md). This matrix is the compact lookup; the workflow is the edit guide.

## Credential Classes

| Credential | Owner | Storage/source | Used by | Must not be used for |
| --- | --- | --- | --- | --- |
| Install token | Backend install auth service plus Electron main token persistence | Registered by `POST /api/install/register`, persisted by `ipc_install_auth_state.cjs` as owner-only `install-auth.json` on POSIX platforms | Hosted `/api/*` middleware and `/ws` handshake | Provider API calls, runs worker auth, local tool authorization |
| Install user/install ids | Backend install auth service | Returned with install token and cached by Electron main | Stable hosted identity and websocket user binding | Renderer-claimed identity override |
| Runs API key | Environment variables `WINDIE_RUNS_API_KEY`, worker `WINDIE_VM_RUNS_API_KEY` | Env only | `/api/runs/*` route dependency and VM worker | General hosted REST auth |
| Provider API keys | Backend config/env or explicit provider settings | `backend/src/core/config/*`, provider settings UI where supported, and Electron main `provider-credentials.json` encrypted with `safeStorage` for renderer-managed overrides; the live desktop UI config store and `frontend-config.json` remain redacted | LLM, OCR, vision, embedding, STT, TTS providers | Install identity or local machine permission |
| Local-runtime remote client auth | Electron/main loaded install token passed to local-runtime remote clients | Main/local-runtime config and remote client headers | Remote embeddings/semantic/title clients when hosted backend auth is enabled | Local memory DB authorization |

## Handling Rules

- Do not commit real credentials, tokens, OAuth refresh material, machine-specific auth state, or generated local token files.
- Do not document live keys in examples; use placeholders.
- Do not reuse install tokens as provider credentials.
- Do not let renderer-provided `user_id` win over authenticated backend identity.
- Do not make renderer settings a broad backend config patch surface.
- Do not log full credentials. If logging is required, log only presence, provider id, or redacted suffix.

## Code Routing

| Change | Primary code | Tests |
| --- | --- | --- |
| Install registration response or token hash behavior | `backend/src/api/auth/router.py`, `backend/src/api/auth/service.py` | `tests/backend/test_install_auth.py` |
| REST bearer auth | `backend/src/api/auth/http_middleware.py`, auth context | `tests/backend/test_install_auth.py`, route tests |
| Websocket bearer auth | `backend/src/api/routes/websocket/connection.py` | `tests/backend/test_websocket_connection.py` |
| Electron install token persistence | `frontend/src/main/ipc/ipc_install_auth_state.cjs`, `frontend/src/main/ipc.cjs` | frontend install/auth or IPC tests around backend connection |
| Runs key behavior | `backend/src/api/routes/runs/support.py`, VM worker runtime | `tests/backend/test_run_control_routes.py`, route helper tests |
| Provider credential loading | `backend/src/core/config/loader.py`, config models, provider constructors | config loader/model tests and provider-specific tests |
| Provider credential UI | Renderer settings/app config providers plus Electron main encrypted provider credential store | AppConfigProvider, SettingsSection, ModelsSection, IPC persistence tests |
| Local-runtime remote clients | `frontend/src/main/python/core/remote_*_client.py` | sidecar remote client tests |

## Failure Routing

| Signal | Likely credential class |
| --- | --- |
| Hosted REST `401` on `/api/*` | Missing/invalid install token. |
| Websocket closes with `1008` during handshake | Missing/invalid install token or invalid handshake. |
| `/api/runs/*` returns `401` only | Runs API key mismatch. |
| Model provider unavailable or missing key | Provider API key/config. |
| Remote embedding/semantic client returns auth error | Local-runtime remote client did not forward install token or backend auth state is missing. |
| UI setting saves but backend ignores field | Client settings patch guard or unsupported config field. |
| Token appears in logs/test snapshots | Logging/test fixture leak; remove and add redaction coverage. |

## Review Checklist

1. Identify credential class before changing code.
2. Confirm source of truth and storage location.
3. Confirm where the credential crosses process boundaries.
4. Confirm logs and test fixtures do not expose secrets.
5. Add missing/invalid/valid credential tests.
6. Update [Provider Credentials](../providers/credentials.md), [Hosted Backend Auth](../operations/hosted_backend_auth.md), or [Runs API Runbook](../automation/runs_api_runbook.md) when the contract changes.

## Related Docs

- [Security Hub](README.md)
- [Credential and Token Change Workflow](credential_token_change_workflow.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Provider Credentials](../providers/credentials.md)
- [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
