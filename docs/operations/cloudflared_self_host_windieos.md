---
summary: "Cloudflared Self-Host Runbook for windieos.com"
read_when:
  - When exposing a self-hosted WindieOS backend through Cloudflare Tunnel.
  - When mapping `api.windieos.com` to this computer.
---

# Cloudflared Self-Host Runbook (`windieos.com`)

This runbook sets up:
- Cloudflare Tunnel from this machine to `api.windieos.com`.
- Persistent startup for the tunnel service.
- Persistent backend startup as a separate user-level systemd service so the origin stays available when the tunnel is up.

## Prerequisites

- Domain `windieos.com` managed in Cloudflare DNS.
- Linux machine with `systemctl --user` available.
- WindieOS repo on machine.
- Backend secrets provided through your shell env or a local env file (do not commit secrets).

## Preferred mode: tunnel on startup, backend as a user service

For a hosted `api.windieos.com` endpoint, the preferred setup is:
- keep `windieos-cloudflared.service` enabled at startup
- keep the backend available through `windieos-backend.service`

If the tunnel stays up while the backend is started manually and stops listening on `127.0.0.1:8765`, hosted clients can see intermittent `502` responses even though the process may appear healthy at other times.

## 1) Install backend user service

Create a local env file for backend secrets:

```bash
mkdir -p ~/.config/windieos
cat > ~/.config/windieos/backend.env <<'EOF'
OPENAI_API_KEY=replace_me
# Add other provider keys if used:
# ANTHROPIC_API_KEY=
# GOOGLE_API_KEY=
EOF
chmod 600 ~/.config/windieos/backend.env
```

Install/start backend service:

```bash
cd /path/to/windieos
scripts/cloudflared/install-backend-user-service.sh \
  --repo-root "$(pwd)" \
  --backend-env jarvis \
  --env-file "$HOME/.config/windieos/backend.env"
```

Health check:

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
```

## 2) Install cloudflared

```bash
cd /path/to/windieos
scripts/cloudflared/install-cloudflared-user.sh
```

If needed, add `~/.local/bin` to `PATH`.

## 3) Create tunnel + DNS route for `api.windieos.com`

```bash
cd /path/to/windieos
scripts/cloudflared/setup-windieos-tunnel.sh \
  --domain windieos.com \
  --hostname api.windieos.com \
  --tunnel-name windieos-backend \
  --backend-origin http://127.0.0.1:8765
```

Notes:
- First run opens Cloudflare login (`cloudflared tunnel login`) if `~/.cloudflared/cert.pem` is missing.
- Script writes:
  - `~/.cloudflared/windieos-config.yml`
  - `~/.config/systemd/user/windieos-cloudflared.service`
- Script enables/starts `windieos-cloudflared.service`.
- This tunnel service can stay enabled even if you prefer to launch the backend manually with `python -m backend.src.main`.

## 4) Validate remote access

Validate both the local origin and hosted route:

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
curl -fsSL https://api.windieos.com/api/embeddings/health
```

Service diagnostics:

```bash
systemctl --user status windieos-cloudflared.service --no-pager
systemctl --user status windieos-backend.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

Developer live logs from your local checkout:

```bash
WINDIE_BACKEND_SSH_HOST=windie-prod <windie> logs backend
<windie> logs backend --service tunnel
<windie> logs backend --service both --tail 500
<windie> logs backend --scope user --service both
```

`<windie> logs backend` is intentionally SSH-only and allowlists the backend
and Cloudflare Tunnel services. It defaults to system services for the hosted
DigitalOcean droplet and supports `--scope user` for the user-service runbook
setup. Do not expose live backend logs through a
WindieOS HTTP or WebSocket route.

Automatic deploys from GitHub pushes are covered by
`docs/operations/remote_backend_auto_deploy.md`. That workflow updates the
remote checkout over SSH and restarts the same `windieos-backend.service`
described here.

If hosted clients still see intermittent `502` errors, compare tunnel logs with the backend memory-route ingress logs for `/api/embeddings`, `/api/semantic/summarize`, and `/api/semantic/title`:
- no matching backend route log usually means the request never reached FastAPI
- matching route start/failure logs mean the origin app received the request and failed it

## 5) Optional one-shot bootstrap

For fresh setup on one machine:

```bash
cd /path/to/windieos
scripts/cloudflared/bootstrap-windieos-host.sh
```

## 6) Keep running after logout/reboot

If user services stop after logout, enable linger for your Linux user:

```bash
sudo loginctl enable-linger "$USER"
```

## 7) Frontend packaged apps

Current WindieOS packaged defaults already target:
- `https://api.windieos.com`
- `wss://api.windieos.com/ws`

So installers on other laptops connect to the remote backend by default whenever both the tunnel and backend service are healthy.
