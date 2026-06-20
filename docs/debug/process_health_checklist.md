---
summary: "Process health checklist for WindieOS backend, Electron main, renderer, local-runtime Python process, wakeword service, VM worker, Cloudflare tunnel, and packaged app failures."
read_when:
  - When a WindieOS process exits, hangs, fails readiness, or appears healthy while another runtime cannot reach it.
  - When debugging startup, shutdown, packaged app, local-runtime Python readiness, wakeword, VM worker, or Cloudflare user-service issues.
title: "Process Health Checklist"
---

# Process Health Checklist

Use this checklist before editing code when a runtime appears dead, stuck, or disconnected.

## Backend

Healthy signs:

- `<windie> start backend` starts without lifespan/init errors.
- concrete health route responds, such as `/api/embeddings/health`.
- websocket `/ws` accepts a valid authenticated handshake when hosted auth is enabled.

First checks:

- backend startup logs,
- install auth service initialization,
- provider health/circuit-breaker logs,
- route registration in `backend/src/api/routes/__init__.py`.

## Electron Main

Healthy signs:

- `<windie> start desktop` launches app windows.
- IPC status reaches renderer.
- backend endpoint snapshot shows expected HTTP/WS URLs.
- local runtime bridge reaches ready state.

First checks:

- Electron stdout/stderr,
- `frontend/src/main/app/backend_endpoints.cjs`,
- `frontend/src/main/ipc.cjs`,
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`,
- debug flags in [Diagnostic Flags](diagnostic_flags.md).

## Renderer

Healthy signs:

- providers mount without React error boundary fallback.
- SDK projection events and typed backend side-channel events are consumed by
  the expected listener.
- transcript session state has conversation/user identity before writes flush.

First checks:

- DevTools console,
- SDK backend-event type guard and typed renderer fan-out channel,
- chat stream hook/store tests,
- dashboard resume/rehydrate flow.

## Local-Runtime Python Process

Healthy signs:

- local runtime bridge readiness probe succeeds.
- Local-runtime Python stdout is valid JSON-RPC only.
- Local-runtime Python stderr has no startup import/runtime errors.
- `tools/registry.py` exposes expected tool names.

First checks:

- `WINDIE_SIDECAR_LOG_LEVEL=DEBUG`,
- local-runtime stderr forwarding,
- bundled runtime path in packaged app,
- `frontend/src/main/python/local_backend.py`,
- focused local-runtime Python pytest for the failing tool.

## Wakeword Service

Healthy signs:

- wakeword status reaches renderer.
- audio frames are accepted by the wakeword subprocess.
- detection events are cooldown-gated and not repeated continuously.

First checks:

- `frontend/src/main/wakeword/wakeword_bridge*.cjs`,
- `frontend/src/main/python/wakeword_service.py`,
- renderer wakeword controller state,
- wakeword bridge/service tests.

## VM Worker

Healthy signs:

- worker heartbeat reaches `/api/runs/workers/heartbeat`.
- assignment changes run from `awaiting_worker` to `queued`/`running`.
- worker dispatches via normal websocket query path.
- run timeline receives `worker-stream` events.

First checks:

- `WINDIE_VM_MODE`,
- `WINDIE_VM_WORKER_MODE`,
- workspace/worker/vm env ids,
- runs API key,
- `frontend/src/main/app/vm_worker_runtime.cjs`.

## Cloudflare and Origin Services

Healthy signs:

- local origin responds at `127.0.0.1:8765`.
- hosted route responds through `api.windieos.com`.
- user services are enabled/running.

First checks:

```sh
systemctl --user status windieos-backend.service --no-pager
systemctl --user status windieos-cloudflared.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

## Related Docs

- [Runtime Nodes Hub](../nodes/README.md)
- [Endpoint and Network Debugging](endpoint_and_network_debugging.md)
- [Logging](logging.md)
- [Operational Troubleshooting](../operations/operational_troubleshooting.md)
- [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md)
