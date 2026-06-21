---
summary: "Doctor-style checklist for collecting WindieOS environment, endpoint, process, permission, provider, sidecar, packaging, and test evidence."
read_when:
  - When collecting enough evidence to debug a WindieOS issue without guessing.
  - When preparing a reproducible report before touching code or escalating an environment-specific failure.
title: "Doctor Checklist"
---

# Doctor Checklist

WindieOS does not currently have one canonical `doctor` command. Use this checklist as the manual doctor flow and prefer the narrowest checks for the failing boundary.

## Baseline

```bash
git status --short --branch
<windie> docs list
node --version
python --version
```

If Python dependencies matter, use the environment launcher instead of the ambient shell:

```bash
./scripts/python-in-env backend python --version
./scripts/python-in-env frontend python --version
```

## Endpoint And Backend

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
curl -fsSL https://api.windieos.com/api/embeddings/health
```

Check these env vars when routing is wrong:

- `BACKEND_HTTP_URL`
- `BACKEND_WS_URL`
- `BACKEND_HOST`
- `BACKEND_PORT`
- `WINDIE_DEFAULT_BACKEND_HTTP_URL`
- `WINDIE_DEFAULT_BACKEND_WS_URL`

## Source Runtime

Backend:

```bash
./scripts/python-in-env backend python -m backend.src.main
```

Frontend:

```bash
cd frontend
npm install
<windie> start desktop
```

Focused tests:

```bash
<windie> test backend
<windie> test local-runtime
<windie> test frontend
```

## Sidecar

Use debug logging only while collecting evidence:

```bash
cd frontend
WINDIE_SIDECAR_LOG_LEVEL=DEBUG <windie> start desktop
```

Confirm:

- local-runtime Python process starts
- stdout remains JSON-RPC protocol traffic only
- stderr contains no import/runtime startup failure
- the failing tool is registered in `frontend/src/main/python/tools/registry.py`
- Electron main sends the expected JSON-RPC method/payload

## Permissions And Platform

Read the platform matrix first:

- [Platform Permission Matrix](../platforms/permission_matrix.md)
- [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md)
- [Window and Input Matrix](../platforms/window_input_matrix.md)

Collect:

- OS name/version
- source vs packaged app
- permission status payload from settings/onboarding
- whether the probe or request path failed
- whether the issue reproduces after local reinstall/reset

## Packaged App

Check:

- installed app launches
- package contains `resources/python-runtime`
- packaged log path from `WINDIE_LOG_FILE` if set
- bundled local-runtime Python starts without system Python/conda
- backend endpoint snapshot matches expectation
- one local runtime-backed tool succeeds

Use:

- [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md)
- [Install Troubleshooting](../install/install_troubleshooting.md)

## Hosted/Tunnel

For self-host or hosted failures:

```bash
systemctl --user status windieos-backend.service --no-pager
systemctl --user status windieos-cloudflared.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

For auth, record:

- target host
- route path
- HTTP status or websocket close code
- whether an install bearer token was present
- whether `/api/install/register` was called against the same backend

## Related Docs

- [Diagnostic Flags](../debug/diagnostic_flags.md)
- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)
- [Process Health Checklist](../debug/process_health_checklist.md)
- [Evidence Packet](evidence_packet.md)
