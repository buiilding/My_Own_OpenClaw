---
summary: "Backend endpoint setup guide for WindieOS source and packaged installs, including hosted defaults, explicit local backend origins, local-runtime propagation, and self-host checks."
read_when:
  - When WindieOS should connect to a local, staging, hosted, or self-hosted backend.
  - When changing backend endpoint defaults, packaged endpoint overrides, local-runtime backend URL propagation, or Cloudflare tunnel setup.
title: "Backend Endpoint Setup"
---

# Backend Endpoint Setup

WindieOS defaults to Peter-hosted backend routes when no endpoint override is set:

- HTTP: `https://api.windieos.com`
- WebSocket: `wss://api.windieos.com/ws`

Source development and packaged installs use the same endpoint-selection contract. A local backend origin is explicit; it is not an automatic fallback.

## Override Order

Electron main resolves backend endpoints in this order:

1. `BACKEND_HTTP_URL` and `BACKEND_WS_URL`
2. `BACKEND_HOST` and `BACKEND_PORT`
3. `WINDIE_DEFAULT_BACKEND_HTTP_URL` and `WINDIE_DEFAULT_BACKEND_WS_URL`
4. hosted default

The local-runtime Python process receives the resolved HTTP URL as `WINDIE_BACKEND_HTTP_URL`. If renderer websocket traffic reaches one backend while local-runtime memory/API calls reach another, debug Electron main env injection before changing local-runtime hosted helper clients.

## Explicit Local Backend Origin

Start the backend:

```bash
<windie> start backend
```

Launch Electron against it:

```bash
BACKEND_HTTP_URL=http://127.0.0.1:8765 \
BACKEND_WS_URL=ws://127.0.0.1:8765/ws \
<windie> start dev
```

Health check:

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
```

## Hosted Backend

Launch with no endpoint overrides to use the default hosted backend, or set explicit hosted URLs:

```bash
BACKEND_HTTP_URL=https://api.windieos.com \
BACKEND_WS_URL=wss://api.windieos.com/ws \
<windie> start dev
```

If a hosted route returns auth errors, confirm that the install token or runs API key belongs to the same backend host the app is using.

## Hosted Defaults

Hosted defaults can be overridden without replacing high-priority `BACKEND_*` variables:

```bash
export WINDIE_DEFAULT_BACKEND_HTTP_URL=https://your-api.example.com
export WINDIE_DEFAULT_BACKEND_WS_URL=wss://your-api.example.com/ws
```

Use hosted defaults for install-specific routing. Use `BACKEND_HTTP_URL` and `BACKEND_WS_URL` when you need a hard override for the current launch.

## Self-Hosted Origin And Tunnel

The self-host path uses a local backend origin plus a Cloudflare tunnel. The install docs do not replace the operations runbook; use this as the quick route map:

| Need | Start here |
| --- | --- |
| bootstrap backend user service | `scripts/cloudflared/bootstrap-windieos-host.sh` |
| install backend service | `scripts/cloudflared/install-backend-user-service.sh` |
| install cloudflared user service | `scripts/cloudflared/install-cloudflared-user.sh` |
| configure WindieOS tunnel | `scripts/cloudflared/setup-windieos-tunnel.sh` |
| debug hosted 502/tunnel failures | [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md) |

User-service checks:

```bash
systemctl --user status windieos-backend.service --no-pager
systemctl --user status windieos-cloudflared.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

## Related Docs

- [Endpoint and Network Debugging](../debug/endpoint_and_network_debugging.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)
