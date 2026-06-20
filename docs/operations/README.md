---
summary: "Operations hub for WindieOS runtime configuration, hosted backend auth, deployment, packaging, release, security, performance, and troubleshooting."
read_when:
  - When changing runtime configuration, hosted backend behavior, packaging, release, security, or deployment flows.
  - When deciding which operations runbook owns a production, packaged-app, or hosted-backend issue.
title: "Operations Hub"
---

# Operations Hub

Operations docs cover runtime behavior that is outside one feature surface but still affects real users: backend endpoint selection, install auth, hosted deployment, packaging, release, local reinstalls, platform services, security, and production debugging.

Use this hub before editing scripts, build config, backend auth/config, endpoint resolution, or release workflows.

## Ownership Map

| Area | Primary owner | Code and config roots | Start docs |
| --- | --- | --- | --- |
| Runtime configuration | Backend config, Electron main endpoint resolution, renderer settings persistence, and local-runtime env propagation | `backend/src/core/config`, `frontend/src/main/app/backend_endpoints.cjs`, `frontend/src/main/ipc/*`, `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`, `frontend/src/main/python/windie/_backend_config.py` | [Configuration Change Workflow](configuration_change_workflow.md), [Configuration](configuration.md), [Runtime Configuration Matrix](runtime_configuration_matrix.md) |
| Gateway ingress | Hosted FastAPI app assembly, route registration, auth middleware, health checks, and edge troubleshooting | `backend/src/main.py`, `backend/src/api/app_assembly.py`, `backend/src/api/routes`, `backend/src/api/auth`, `scripts/cloudflared` | [Gateway Hub](../gateway/README.md), [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md), [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md) |
| Runtime nodes | Hosted backend, desktop, sidecar, wakeword, VM worker, and Cloudflare/origin process ownership | `backend/src`, `frontend/src/main`, `frontend/src/renderer`, `frontend/src/main/python`, `scripts/cloudflared` | [Runtime Nodes Hub](../nodes/README.md), [Runtime Node Matrix](../nodes/runtime_node_matrix.md) |
| Hosted backend auth | Backend install-token service plus frontend token propagation | `backend/src/api/auth`, `backend/src/api/routes/websocket`, `frontend/src/main`, `frontend/src/renderer/infrastructure` | [Hosted Backend Auth](hosted_backend_auth.md), [Multi-User Runtime Hardening](multi_user_runtime_hardening.md) |
| VM run control | Runs API auth/caps plus Electron worker mode runtime | `backend/src/api/routes/runs`, `backend/src/services/vm_run_control.py`, `frontend/src/main/app/vm_worker_runtime.cjs` | [Automation Hub](../automation/README.md), [VM Runs and Workers](../automation/vm_runs_and_workers.md), [Runs API Runbook](../automation/runs_api_runbook.md) |
| Deployment | Hosted backend origin, Cloudflare Tunnel, user services, default endpoint routing, push-to-host backend refresh | `scripts/cloudflared`, `scripts/deploy`, `.github/workflows/deploy-remote-backend.yml`, `backend/src/main.py`, `frontend/src/main/app/backend_endpoints.cjs` | [Deployment](deployment.md), [Cloudflared Self-Host Runbook](cloudflared_self_host_windieos.md), [Remote Backend Auto Deploy](remote_backend_auto_deploy.md) |
| Packaging | Electron Builder, bundled Python runtime, release workflow | `frontend/package.json`, `frontend/electron-builder.bundled-python.yml`, `scripts/build-sidecar-runtime`, `.github/workflows/desktop-release.yml` | [Release and Packaging Change Workflow](release_packaging_change_workflow.md), [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md), [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md), [Release Guide](release.md) |
| Local packaged reinstall | OS-specific uninstall, local state reset, runtime rebuild, launch smoke | `<windie> reinstall mac`, `<windie> reinstall linux`, `<windie> reinstall win` | [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md), [Packaged Desktop Builds](../install/packaged_desktop.md) |
| Security | IPC isolation, API auth, tool execution policy, hosted-session risks | `frontend/src/preload.js`, `backend/src/api/auth`, `backend/src/core/security`, `frontend/src/main/python/tools` | [Security Hub](../security/README.md), [Security](security.md), [Hosted Backend Auth](hosted_backend_auth.md), [Multi-User Runtime Hardening](multi_user_runtime_hardening.md) |
| Performance | Backend/provider caching, renderer subscriptions, local-runtime startup and JSON-RPC hot paths | `backend/src/agent`, `backend/src/llm`, `frontend/src/renderer`, `frontend/src/main/python` | [Performance](performance.md), [Operational Troubleshooting](operational_troubleshooting.md) |

## Common Change Paths

### Change a Backend Endpoint Default

Read:

- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Configuration](configuration.md)
- [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md)

Likely code:

- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/python/windie/_backend_config.py`
- endpoint-related frontend tests such as `tests/frontend/BackendEndpoints.test.cjs`,
  `tests/frontend/RuntimeEndpointStore.test.ts`, and
  `tests/frontend/IpcBackendEndpointState.test.cjs`

Validation:

- endpoint resolver tests
- packaged local-runtime env propagation tests when local-runtime helper clients
  see backend URL changes
- `<windie> docs list`

### Change Hosted Auth or Install Registration

Read:

- [Security Hub](../security/README.md)
- [Hosted Backend Auth](hosted_backend_auth.md)
- [Multi-User Runtime Hardening](multi_user_runtime_hardening.md)
- [Security](security.md)

Likely code:

- `backend/src/api/auth/service.py`
- `backend/src/api/auth/http_middleware.py`
- `backend/src/api/auth/router.py`
- `backend/src/api/routes/websocket/connection.py`
- frontend token storage/transport code that sends `Authorization: Bearer ...`

Validation:

- backend REST auth middleware tests
- websocket handshake tests for authenticated and unauthenticated paths
- frontend connection tests that verify token propagation and mismatch handling

### Change Packaging or Reinstall Behavior

Read:

- [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md)
- [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md)
- [Release Guide](release.md)
- [Platform docs](../platforms/README.md)

Likely code:

- `frontend/package.json`
- `frontend/electron-builder.bundled-python.yml`
- `scripts/build-sidecar-runtime`
- `<windie> reinstall mac`
- `<windie> reinstall linux`
- `<windie> reinstall win`
- `.github/workflows/desktop-release.yml`

Validation:

- target OS package command only on that OS
- platform smoke helper under `scripts/ci/`
- local reinstall helper when validating packaged app state reset

### Debug Hosted 401, 403, 409, 502, or WebSocket Failures

Read:

- [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md)
- [Operational Troubleshooting](operational_troubleshooting.md)
- [Hosted Backend Auth](hosted_backend_auth.md)
- [Cloudflared Self-Host Runbook](cloudflared_self_host_windieos.md)
- [Runtime Configuration Matrix](runtime_configuration_matrix.md)

Likely owners:

- 401 on `/api/*`: backend install-token auth middleware or missing frontend bearer token
- websocket close code `1008`: handshake/auth/schema failure
- 409 on `/api/runs/*`: active VM run cap
- 502 from `api.windieos.com`: Cloudflare Tunnel or origin backend service
- local tool failure after successful backend query: local-runtime
  implementation, not hosted backend

### Change VM Worker or Runs API Operations

Read:

- [Automation Hub](../automation/README.md)
- [VM Runs and Workers](../automation/vm_runs_and_workers.md)
- [Runs API Runbook](../automation/runs_api_runbook.md)
- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Operational Troubleshooting](operational_troubleshooting.md)

Likely code/config:

- `backend/src/api/routes/runs/*`
- `backend/src/services/vm_run_control.py`
- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/main/app/runtime_mode.cjs`
- `WINDIE_VM_*` and `WINDIE_RUNS_API_KEY` env vars

Validation:

- backend runs route/service tests
- frontend VM worker/runtime-mode tests
- endpoint/auth/cap docs when env behavior changes

## Operations Pages

- [Configuration](configuration.md)
- [Configuration Change Workflow](configuration_change_workflow.md)
- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Hosted Backend Auth](hosted_backend_auth.md)
- [Deployment](deployment.md)
- [Cloudflared Self-Host Runbook](cloudflared_self_host_windieos.md)
- [Remote Backend Auto Deploy](remote_backend_auto_deploy.md)
- [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md)
- [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md)
- [Release and Packaging Change Workflow](release_packaging_change_workflow.md)
- [Evidence Collection Runbook](evidence_collection_runbook.md)
- [Incident Triage Runbook](incident_triage_runbook.md)
- [Release Guide](release.md)
- [Security](security.md)
- [Multi-User Runtime Hardening](multi_user_runtime_hardening.md)
- [Performance](performance.md)
- [Operational Troubleshooting](operational_troubleshooting.md)
