---
summary: "Symptom-to-owner troubleshooting map for WindieOS hosted backend, packaged desktop, local-runtime implementation, Cloudflare Tunnel, auth, and VM worker operations."
read_when:
  - When debugging production, packaged-app, hosted-backend, tunnel, install-auth, or VM-worker failures.
  - When deciding whether an issue belongs to backend operations, Electron
    endpoint routing, local-runtime implementation, release packaging, or
    platform setup.
title: "Operational Troubleshooting"
---

# Operational Troubleshooting

Use this page when a problem crosses feature boundaries. The goal is to identify the failing owner quickly, then switch to the focused docs and tests for that owner.

## First Split

| Question | If yes | If no |
| --- | --- | --- |
| Does the source app work but installed app fails? | Start with packaging/reinstall docs. | Continue. |
| Does `/api/embeddings/health` fail locally on the backend host? | Backend process/config issue. | Continue. |
| Does local origin work but `https://api.windieos.com/...` fails? | Cloudflare Tunnel/DNS/service issue. | Continue. |
| Does HTTP work but websocket closes during connect? | Websocket auth/handshake/schema issue. | Continue. |
| Does backend query stream work but tool execution fails? | Local-runtime implementation or Electron tool bridge issue. | Continue. |
| Does only one OS fail? | Platform adapter, permission, packaging, or OS dependency issue. | Use debug docs by subsystem. |

## Hosted Backend and Tunnel

### `api.windieos.com` returns `502`

Likely owner:

- Cloudflare Tunnel cannot reach the local backend origin, or the backend is not listening on `127.0.0.1:8765`.

Check:

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
curl -fsSL https://api.windieos.com/api/embeddings/health
systemctl --user status windieos-backend.service --no-pager
systemctl --user status windieos-cloudflared.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

Read:

- [Cloudflared Self-Host Runbook](cloudflared_self_host_windieos.md)
- [Deployment](deployment.md)

### Hosted endpoint works sometimes and fails sometimes

Likely owner:

- Tunnel is persistent but backend process is manually started/stopped.

Fix direction:

- Keep both `windieos-cloudflared.service` and `windieos-backend.service` enabled as user services.
- If user services stop after logout, enable linger for the Linux user.

### Requests never appear in backend logs

Likely owner:

- DNS, tunnel, or edge routing before FastAPI.

Check:

- Cloudflare Tunnel logs.
- `cloudflared tunnel route dns` setup.
- Whether `~/.cloudflared/windieos-config.yml` maps `api.windieos.com` to the expected origin.

## Auth and Identity

### REST `/api/*` returns `401`

Likely owner:

- Missing or invalid install bearer token.

Check:

- Request has `Authorization: Bearer <install_token>`.
- Token came from `POST /api/install/register` against the same backend/auth database.
- `install_auth_enabled` was not changed unexpectedly.

Read:

- [Hosted Backend Auth](hosted_backend_auth.md)
- [Security](security.md)

### REST `/api/*` returns `503` with install auth service unavailable

Likely owner:

- Backend container/app startup did not initialize `InstallAuthService`.

Check:

- Backend startup logs.
- Config value for install-auth database path.
- Container wiring around auth service initialization.

### WebSocket closes with policy violation

Likely owner:

- Handshake JSON/schema failure, missing bearer token, invalid token, or install-auth service failure.

Check:

- First websocket message is a valid handshake object.
- Websocket headers include `Authorization: Bearer <install_token>` when hosted auth is required.
- Backend logs around `Handshake validation failed`, `missing install bearer token`, or `invalid install bearer token`.

### Log says claimed user id mismatch was ignored

Likely owner:

- Frontend local identity is stale, but hosted auth succeeded.

Expected behavior:

- Backend uses authenticated install identity and ignores the client claim.
- Treat this as a frontend identity persistence issue only if it causes user-visible state mismatch.

## Endpoint Resolution

### App connects to hosted backend when you expected local

Likely owner:

- Endpoint env defaults.

Current default:

- `https://api.windieos.com`
- `wss://api.windieos.com/ws`

Fix direction:

- Set `BACKEND_HTTP_URL` and `BACKEND_WS_URL`, or set `BACKEND_HOST`/`BACKEND_PORT` explicitly.
- Do not assume development falls back to local `127.0.0.1:8765`.

Read:

- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Configuration](configuration.md)

### Local-runtime memory/API calls hit a different backend than renderer websocket

Likely owner:

- Electron main local-runtime env injection or local-runtime backend URL
  resolution.

Check:

- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/python/windie/_backend_config.py`
- `WINDIE_BACKEND_HTTP_URL` in local-runtime env

## Packaged App

### Source app works, packaged app cannot run local tools

Likely owner:

- Bundled Python runtime or packaged runtime path.

Check:

- package contains `resources/python-runtime`
- local-runtime launch path from Electron logs
- `WINDIE_SIDECAR_LOG_LEVEL=DEBUG` for a focused local run
- platform package dependencies such as Linux `xdotool`

Read:

- [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md)
- [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md)
- [Debug Logging](../debug/logging.md)

### macOS app does not appear in Screen Recording or Accessibility permissions

Likely owner:

- macOS TCC registration path or app bundle identity.

Check:

- local reinstall helper reset behavior
- bundle id used by `WINDIE_BUNDLE_ID`
- real capture/probe path that registers the app with TCC

Read:

- [macOS Platform Notes](../platforms/macos.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)

### Windows packaging fails before installer creation

Likely owner:

- Node/Electron Builder prerequisites, Git Bash, Python build interpreter, or symlink permission.

Check:

- `npm` exists.
- Bash exists or Git Bash can be discovered.
- `WINDIE_PYTHON_BUILD` points to Python 3.11 when conda is unavailable.
- Developer Mode or elevated shell allows symlink creation.

Read:

- [Packaging and Reinstall Runbooks](packaging_and_reinstall_runbooks.md)
- [Windows Platform Notes](../platforms/windows.md)

### Linux installed app cannot perform window probes

Likely owner:

- Missing OS tool dependency.

Check:

- `xdotool` is installed.
- DEB/RPM package dependency was installed.
- AppImage users installed `xdotool` manually.

Read:

- [Linux Platform Notes](../platforms/linux.md)
- [Bundled Python Runtime Packaging](sidecar_runtime_packaging.md)

## VM Worker and Runs API

### `/api/runs/*` returns `409`

Likely owner:

- Active run cap per workspace.

Check:

- `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`
- active runs in statuses `awaiting_worker`, `queued`, `running`, `paused`

### Worker never picks up runs

Likely owner:

- VM worker mode, workspace id, endpoint routing, or runs API key.

Check:

- `WINDIE_VM_MODE=1` or `WINDIE_VM_WORKER_MODE=1`
- `WINDIE_VM_WORKSPACE_ID`
- `WINDIE_RUNS_API_KEY` or `WINDIE_VM_RUNS_API_KEY`
- backend endpoint resolution from Electron main

Read:

- [Runtime Configuration Matrix](runtime_configuration_matrix.md)
- [Backend Runtime Surface](../backend/runtime/backend_runtime_surface_query_tool_loop_and_vm_runs_reference.md)
- [Frontend Runtime Surface](../frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md)

## Validation Routing

| Changed area | Minimum validation |
| --- | --- |
| Endpoint resolver | frontend endpoint tests, local-runtime env propagation tests, `<windie> docs list` |
| Install auth | backend auth middleware tests, websocket handshake tests, frontend/SDK token propagation tests |
| Cloudflare runbook/scripts | shellcheck/manual dry run where possible, origin and hosted health checks |
| Packaging config | package on target OS, smoke helper, installed-app launch |
| Reinstall helper | run only on target OS; verify old state reset, package build, install, launch |
| Runtime docs only | `<windie> docs list`, markdown link check, `git diff --check` |
