---
summary: "Workflow for changing WindieOS install auth, install tokens, bearer tokens, runs keys, provider credentials, OAuth state, local-runtime remote-client auth headers, and secret logging boundaries."
read_when:
  - When changing install registration, REST bearer auth, websocket auth, runs
    API keys, provider API keys, OAuth state, local-runtime remote-client auth,
    or credential persistence.
  - When debugging 401 responses, websocket 1008 closes, missing provider credentials, saved keys that backend ignores, VM worker auth failures, or possible secret leakage in logs/tests.
title: "Install Auth and Credential Token Change Workflow"
---

# Install Auth and Credential Token Change Workflow

Use this workflow before editing any code that accepts, stores, forwards, derives, logs, or validates credentials. WindieOS has several credential classes with different owners. Treat the credential class as the first design decision; do not route a bug through the nearest failing client if the enforcing boundary lives elsewhere.

Core rule: install auth identifies a desktop install to the hosted backend, runs keys protect the VM-run control plane, provider credentials authenticate vendors, OAuth state belongs to provider-specific auth, and local-runtime remote-client auth is only a hosted-backend bearer-header propagation path.

## Fast Owner Map

| Credential surface | First owner | Code roots | Tests to inspect or add | Start docs |
| --- | --- | --- | --- | --- |
| Install registration and token hashing | Backend auth service | `backend/src/api/auth/service.py`, `backend/src/api/auth/router.py` | `tests/backend/test_install_auth.py` | [Hosted Backend Auth](../operations/hosted_backend_auth.md) |
| Hosted REST bearer auth | Backend auth middleware | `backend/src/api/auth/http_middleware.py`, `backend/src/api/auth/context.py`, `backend/src/main.py` | `tests/backend/test_install_auth.py`, route tests for affected APIs | [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md) |
| Websocket bearer auth and identity override | Backend websocket connection lifecycle | `backend/src/api/routes/websocket/connection.py`, `backend/src/api/schemas/common.py` | `tests/backend/test_websocket_connection.py` | [WebSocket Connection Lifecycle](../gateway/websocket_connection_lifecycle.md) |
| Electron install-token persistence | Electron main auth-state helper and IPC wiring | `frontend/src/main/ipc/ipc_install_auth_state.cjs`, `frontend/src/main/ipc/ipc_install_auth_runtime.cjs`, `frontend/src/main/ipc/ipc_install_auth_identity_runtime.cjs`, `frontend/src/main/ipc.cjs` | frontend install-auth, backend-connection, or IPC tests | [Main Process Change Workflow](../frontend/main/main_process_change_workflow.md) |
| Local-runtime remote-client auth headers | local-runtime Python remote client base | `frontend/src/main/python/windie/_auth.py`, `frontend/src/main/python/windie/_remote_api_client_base.py`, `frontend/src/main/python/core/remote_*_client.py` | local-runtime Python remote client tests | [Local-Runtime Python Implementation Change Workflow](../frontend/sidecar/local_runtime_python_change_workflow.md) |
| Runs API key | Runs route dependency and VM worker runtime | `backend/src/api/routes/runs/support.py`, `backend/src/api/routes/runs/router.py`, `frontend/src/main/app/vm_worker_runtime.cjs` | `tests/backend/test_run_control_routes.py`, `tests/backend/test_run_control_route_helpers.py`, `tests/frontend/VmWorkerRuntime.test.cjs` | [Runs API Runbook](../automation/runs_api_runbook.md) |
| Provider env keys | Backend config and provider constructors | `backend/src/core/config/models.py`, `backend/src/core/config/loader.py`, `backend/src/llm/providers/**` | `tests/backend/test_config_models.py`, `tests/backend/test_config_loader.py`, provider tests | [Provider Credentials](../providers/credentials.md) |
| Renderer-managed provider key overrides | Renderer settings, app-runtime provider credential facade, Electron main encrypted credential store, and backend client-settings patch guard | `frontend/src/renderer/features/dashboard/components/sections/ApiKeysSection.jsx`, `frontend/src/renderer/app/runtime/desktopProviderCredentialRuntime.js`, `frontend/src/renderer/app/providers/appConfigPersistence.js`, `frontend/src/main/ipc/ipc_provider_credentials_store.cjs`, `backend/src/core/validation/**`, `backend/src/core/config/models.py` | `tests/frontend/ModelsSection.test.jsx`, `tests/frontend/AppConfigPersistence.test.js`, `tests/frontend/IpcProviderCredentialPersistence.test.cjs`, `tests/backend/test_validation_utils.py`, `tests/backend/test_api_handlers.py` | [Provider Change Workflow](../providers/provider_change_workflow.md) |
| Secret logging, redaction, and fixtures | Producing runtime and test fixture owner | logging call sites in backend, Electron, renderer, sidecar, and tests | focused tests for the changed boundary plus fixture scans | [Observability Change Workflow](../debug/observability_change_workflow.md) |

## Credential Classes

### Install token

The install token is generated by `InstallAuthService.register_install()`, returned once from `POST /api/install/register`, stored hashed in the backend install-auth SQLite table, and cached by Electron main as `install-auth.json` under the app user-data directory.

Use it only for hosted backend install identity:

- REST requests use `Authorization: Bearer <install_token>`.
- Main `/ws` websocket sessions use the same bearer header when install auth is required.
- Sidecar remote clients can read the Electron-auth-state file path from `WINDIE_BACKEND_AUTH_STATE_PATH` or `BACKEND_AUTH_STATE_PATH` and forward the bearer header to backend-backed services.

Do not use install tokens for provider API calls, runs worker auth, local machine permission decisions, or app-login semantics.

### Server-owned install identity

`user_id` and `install_id` returned by registration are identifiers, not credentials. When install auth is required, backend routes should derive identity from the authenticated token and ignore renderer-claimed ownership when it conflicts.

Important places:

- `request.state.install_identity` is set by `install_auth_http_middleware()`.
- `get_current_authenticated_install_identity()` carries request-local identity where services need it.
- `perform_handshake()` uses the authenticated `user_id` and `install_id`, and logs when the handshake claim is stale.

### Runs API key

Runs auth is a shared control-plane key, not install identity. The backend resolves the expected key from `WINDIE_RUNS_API_KEY`. VM workers resolve their outgoing header from `WINDIE_VM_RUNS_API_KEY` or `WINDIE_RUNS_API_KEY`.

The header is:

```http
x-windie-runs-key: <shared-key>
```

If no expected key is configured, `verify_runs_api_key()` allows the route dependency to pass. If a key is configured, a mismatch returns `401` with `Invalid runs API key`.

### Provider credentials

Provider credentials are backend config inputs and provider-specific auth material. The baseline environment-variable surface lives in `AppConfig` and config models. Renderer-managed overrides are intentionally narrow and pass through the settings/config path, not arbitrary backend config patching. When the desktop UI saves a renderer-managed provider key, Electron main writes the normal `frontend-config.json` with `api_key` fields redacted and stores the raw key only in the encrypted `provider-credentials.json` side file backed by Electron `safeStorage`. Startup config loads hydrate enabled redacted entries from that encrypted store before syncing settings to the backend.

Do not add provider keys directly to route payloads, websocket handshakes, tool payloads, or logs. Resolve them through config loading and provider constructors so unavailable-provider behavior, health, and model catalog gates stay consistent.

### OAuth state

OAuth state is provider-specific. The current OpenAI Codex helper lives in Electron main. Backend config resolution may consume OAuth access-token state for compatible provider selection, but generic hosted auth and provider OAuth must remain separate.

If changing OAuth fields, update all three boundaries:

1. Electron main helper and IPC/storage behavior.
2. Renderer settings or provider status surface, if exposed.
3. Backend config model/loader behavior that consumes the OAuth entry.

### Local-runtime remote-client auth

The local runtime does not own install authentication. The local-runtime Python
implementation reads persisted install auth state and forwards a bearer header
when calling hosted backend-backed services, such as semantic summarization or
other future local-runtime remote clients. SDK-owned embedding calls use the SDK
transport/auth path. Missing local auth state should produce a clear hosted-auth
failure, not silent local identity invention.

## Runtime Flows

### Install registration to REST auth

1. Electron main registers through `POST /api/install/register`.
2. Backend creates `user_id`, `install_id`, and `wnd_install_<secret>` token.
3. Backend stores only the token hash.
4. Electron main normalizes and persists `{ installToken, userId, installId }` in `install-auth.json` under the app user-data directory.
   On POSIX platforms, saves and valid loads harden the file to owner read/write only and the containing user-data directory to owner-only access.
5. `ipc_install_auth_identity_runtime.cjs` owns the in-memory install token,
   install id, and client user id used by main-process status/query/wake-up
   wiring.
6. Main process HTTP clients attach `Authorization: Bearer <installToken>`.
7. Backend middleware authenticates `/api/*` paths except install registration.
8. Middleware sets `request.state.install_identity` and request-local auth context.
9. Route handlers use authenticated identity where ownership matters.

If this flow fails, avoid editing route handlers first. Check token persistence, header construction, middleware enablement, and `app.state.install_auth_service` wiring.

### Websocket auth and claimed identity

1. Frontend opens `/ws` with an install bearer header.
2. Frontend still sends a handshake payload containing `user_id` for compatibility.
3. Backend validates the handshake schema and extracts bearer auth.
4. When install auth is required, backend authenticates the token.
5. Backend binds the websocket session to authenticated `user_id` and `install_id`.
6. Backend ignores a mismatched claimed `user_id` and logs the mismatch.
7. Auth, JSON, schema, or service failures close with policy-violation semantics.

Do not "fix" wrong-user websocket bugs by trusting renderer state harder. The backend is the identity source on the hosted-auth path.

### Provider credential resolution

1. `AppConfig` defines environment-backed provider key fields and renderer-managed provider override containers.
2. Config loading normalizes current provider aliases and resolves explicit renderer overrides when enabled.
3. Provider constructors receive resolved credential/config values.
4. Provider health/model availability reflects missing or invalid credentials.

When a model is unavailable, check config resolution before editing provider code. A missing key, disabled override, unsupported provider alias, or sanitized client settings patch can look like a provider bug.

### Sidecar remote-client header propagation

1. Electron main writes the install-auth state file.
2. Electron main injects the auth-state path into the local-runtime launch
   environment for local-runtime Python remote clients.
3. `windie._auth.get_install_bearer_token()` loads and trims `installToken`.
4. `RemoteApiClientBase._build_auth_headers()` emits `Authorization: Bearer <token>` when present.
5. Remote client requests fail at the hosted auth boundary if the token is missing or invalid.

Do not duplicate auth parsing in each remote client. Put shared header behavior in the base class unless a client has a real separate credential class.

### Runs key flow

1. Backend route dependency resolves the expected key from env.
2. VM worker runtime resolves an outgoing key from worker/runtime env.
3. Worker/control-plane requests send `x-windie-runs-key`.
4. Runs routes validate the shared key independently from install auth.

If `/api/runs/*` fails but other hosted `/api/*` routes succeed, check the runs key before changing install auth.

## Change Paths

### Change install registration or token format

Read:

- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)

Edit:

- `backend/src/api/auth/service.py` for token generation, hashing, install storage, and authentication.
- `backend/src/api/auth/router.py` for request/response contract.
- `frontend/src/main/ipc/ipc_install_auth_state.cjs` only if persisted field shape changes.
- SDK or Electron registration clients only after the backend contract is settled.

Validate:

- registration accepts valid optional OS values.
- malformed registration payloads are rejected at the route schema.
- token is returned once and stored hashed.
- existing installs keep working or a real migration exists.
- persisted desktop auth state is owner-only on POSIX platforms, or the platform-specific storage/ACL behavior is documented.
- docs and examples use placeholders only.

### Change REST bearer auth

Read:

- [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Security Boundary Matrix](security_boundary_matrix.md)

Edit:

- `backend/src/api/auth/http_middleware.py` for path exemptions, status codes, and header enforcement.
- `backend/src/api/auth/context.py` only if request-local identity shape changes.
- `backend/src/main.py` or app assembly only if middleware/service wiring changes.
- Client header code in Electron, SDK, or the local-runtime implementation only
  after backend semantics are clear.

Validate:

- non-`/api` paths pass through.
- `/api/install/register` remains unauthenticated.
- missing and invalid bearer tokens return `401`.
- missing auth service returns `503`.
- valid tokens set request identity and reset context after the request.

### Change websocket auth or identity binding

Read:

- [WebSocket Connection Lifecycle](../gateway/websocket_connection_lifecycle.md)
- [WebSocket Event Contract Change Workflow](../channels/websocket_event_contract_change_workflow.md)
- [Sessions and Conversations](../concepts/sessions_and_conversations.md)

Edit:

- `backend/src/api/routes/websocket/connection.py` for handshake auth and identity binding.
- `backend/src/api/schemas/common.py` if handshake fields change.
- SDK/Electron websocket client header construction if auth header transport changes.
- session cleanup/runtime code only if identity lifecycle changes.

Validate:

- valid token plus mismatched claimed `user_id` binds authenticated identity.
- missing/invalid token closes with policy-violation behavior when auth is required.
- handshake JSON/schema failures remain distinct from auth-service failures in logs.
- same-user active connection cleanup does not kill another active connection.

### Change provider API-key loading

Read:

- [Provider Credentials](../providers/credentials.md)
- [Provider Change Workflow](../providers/provider_change_workflow.md)
- [Backend Config and Container Change Workflow](../backend/config/backend_config_and_container_change_workflow.md)

Edit:

- `backend/src/core/config/models.py` for fields/defaults and typed config shape.
- `backend/src/core/config/loader.py` for env resolution, provider aliasing, OAuth, and override semantics.
- provider files in `backend/src/llm/providers/**` only after config delivers the expected credential.
- model catalog or provider health code if availability changes.

Validate:

- missing keys produce safe unavailable-provider behavior.
- enabled overrides beat env only where designed.
- supported aliases such as `gemini` -> `google` still normalize correctly, and
  unsupported Kimi spellings remain unavailable through normal provider
  selection and credential lookup.
- model list and provider health reflect the new credential gate.

### Change renderer-managed provider keys

Read:

- [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md)
- [Provider Change Workflow](../providers/provider_change_workflow.md)
- [Input Validation and Client Settings Patch Guard](../backend/core/validation/input_validation_and_client_settings_patch_guard_reference.md)

Edit:

- `frontend/src/renderer/features/dashboard/components/sections/ApiKeysSection.jsx` for visible controls.
- `frontend/src/renderer/app/runtime/desktopProviderCredentialRuntime.js` for skin-configured provider entries/default normalization and renderer persistence shaping.
- `frontend/src/renderer/app/providers/appConfigPersistence.js` and config storage/filter helpers for local persistence.
- `frontend/src/main/ipc/ipc_provider_credentials_store.cjs` and desktop UI config persistence helpers for restart-safe encrypted provider-key storage.
- backend config and validation code only for explicit client settings patch fields.

Validate:

- UI saves enabled/key state without dropping unrelated provider entries.
- renderer localStorage and `frontend-config.json` keep provider keys redacted while Electron main encrypted credential storage hydrates enabled keys after restart.
- backend settings patch accepts only allowed provider credential fields.
- no frontend setting becomes a generic backend config write channel.

### Change provider OAuth state

Read:

- [OpenAI Provider](../providers/openai.md)
- [Provider Credentials](../providers/credentials.md)

Edit:

- `backend/src/core/config/models.py` and `backend/src/core/config/loader.py` for backend consumption.
- renderer config persistence only when the current UI exposes or should expose
  the flow. The desktop app does not currently expose an OAuth launcher.

Validate:

- disconnect/clear behavior removes sensitive token material.
- config loading can resolve OAuth access tokens without breaking API-key paths.
- tests use fake tokens and never snapshot real material.

### Change local-runtime remote-client auth

Read:

- [Local-Runtime Python Implementation Change Workflow](../frontend/sidecar/local_runtime_python_change_workflow.md)
- [Local Tool Channels](../channels/sidecar_and_tool_channels.md)
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)

Edit:

- `frontend/src/main/python/windie/_auth.py` for state-file env and token extraction.
- `frontend/src/main/python/windie/_remote_api_client_base.py` for shared bearer-header construction.
- concrete `remote_*_client.py` files only for request-specific behavior.
- Electron local-runtime launch environment if the auth-state path changes.

Validate:

- missing auth state omits the header and fails clearly at hosted auth.
- invalid JSON auth state is ignored safely.
- valid state emits exactly one bearer header.
- network fallback does not drop auth headers on the next backend URL.

### Change secret logging or redaction

Read:

- [Observability Change Workflow](../debug/observability_change_workflow.md)
- [Logging](../debug/logging.md)
- [Security Boundary Matrix](security_boundary_matrix.md)

Edit the producing runtime only. Do not add a broad global string scrubber as the first fix if a specific call site is logging secrets unnecessarily.

Validate:

- logs contain presence, provider id, install id, user id, or redacted suffix only.
- tests/fixtures do not include real-looking tokens unless intentionally fake and safe.
- snapshots do not store bearer headers, provider keys, refresh tokens, or auth-state JSON.
- debug flags do not enable full secret payload dumps.

## Debug Routing

| Symptom | First checks | Likely owner |
| --- | --- | --- |
| `POST /api/install/register` fails | route registration, auth service on app state, request schema | backend auth router/service |
| Every `/api/*` route returns `401` except register | Electron/SDK bearer header, persisted install state, backend auth database | client header propagation or auth middleware |
| `/api/*` returns install-auth `503` | `app.state.install_auth_service`, backend startup/container wiring | backend app assembly/main |
| `/ws` closes with `1008` before query | handshake JSON/schema, bearer header, install-auth service | websocket connection lifecycle |
| Backend logs claimed/authenticated user mismatch | stale client user id; backend should still use authenticated identity | renderer local state if UX is wrong, backend only if binding is wrong |
| `/api/runs/*` returns `401` while other APIs work | `x-windie-runs-key`, expected env key, VM worker env | runs support or VM worker runtime |
| Provider missing despite visible model | env key, renderer override enabled state, alias normalization, OAuth access token | backend config loader/provider factory |
| UI saves provider key but backend ignores it | config filter, renderer persistence merge, backend patch guard | renderer config persistence or backend validation |
| Remote embedding/semantic request returns auth error | local-runtime auth-state path, local-runtime bearer header, install token validity | local-runtime remote client base or Electron local-runtime env |
| Token appears in logs or snapshots | producing log call, fixture, snapshot, debug flag | owner runtime plus test fixture |

## Validation Matrix

| Changed boundary | Minimum focused validation |
| --- | --- |
| Install service/router | `./scripts/python-in-env backend pytest tests/backend/test_install_auth.py` |
| REST middleware or auth context | `./scripts/python-in-env backend pytest tests/backend/test_install_auth.py` plus affected route tests |
| Websocket auth | `./scripts/python-in-env backend pytest tests/backend/test_websocket_connection.py` |
| Runs key | `./scripts/python-in-env backend pytest tests/backend/test_run_control_routes.py tests/backend/test_run_control_route_helpers.py` and `cd frontend && npm run test -- VmWorkerRuntime` when worker headers change |
| Provider config/key resolution | `./scripts/python-in-env backend pytest tests/backend/test_config_models.py tests/backend/test_config_loader.py` plus provider-specific tests |
| Frontend provider settings | `cd frontend && npm run test -- ModelsSection AppConfigPersistence configStorage configFilter` |
| Provider OAuth config | backend config-loader tests plus focused renderer config tests if renderer persistence changes |
| Local-runtime remote auth | focused sidecar remote-client pytest module plus backend auth-route test for the called endpoint |
| Docs-only credential changes | `<windie> docs list`, `git diff --check`, and a focused Markdown link check over touched docs |

## Review Checklist

Before committing a credential or token change:

1. Name the credential class in the changelog or PR summary.
2. Confirm the source of truth and storage location did not move accidentally.
3. Confirm every process boundary crossing has an explicit payload/header contract.
4. Confirm renderer-owned fields cannot override server-owned identity.
5. Confirm install token, runs key, provider key, and OAuth paths remain separate.
6. Confirm logs/tests/docs contain placeholders or redacted values only.
7. Confirm missing, invalid, and valid credential tests exist for the changed boundary.
8. Update the related docs below when the user-visible or integration contract changes.

## Related Docs

- [Credentials and Tokens Matrix](credentials_and_tokens_matrix.md)
- [Security Change Playbook](security_change_playbook.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Provider Credentials](../providers/credentials.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)
- [REST Route Auth Matrix](../gateway/rest_route_auth_matrix.md)
- [Runs API Runbook](../automation/runs_api_runbook.md)
- [SDK Auth and Error Handling](../sdk/sdk_auth_and_error_handling.md)
