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
- Optional backend startup as a separate user-level systemd service when you explicitly want that.

## Prerequisites

- Domain `windieos.com` managed in Cloudflare DNS.
- Linux machine with `systemctl --user` available.
- WindieOS repo on machine.
- Backend secrets provided through your shell env or a local env file (do not commit secrets).

## Preferred mode: tunnel on startup, backend started manually

This is the preferred local-dev setup for this repo:
- keep `windieos-cloudflared.service` enabled at startup
- start the backend manually only when you want it public:

```bash
cd /path/to/windieos
python -m backend.src.main
```

When the backend is not running, `https://api.windieos.com` stays routed to this machine but requests fail because nothing is listening on `127.0.0.1:8765`.

## 1) Optional: install backend user service

Skip this section if you do not want the backend to start automatically.

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
scripts/cloudflared/install-backend-user-service \
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
scripts/cloudflared/install-cloudflared-user
```

If needed, add `~/.local/bin` to `PATH`.

## 3) Create tunnel + DNS route for `api.windieos.com`

```bash
cd /path/to/windieos
scripts/cloudflared/setup-windieos-tunnel \
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

If you are using the preferred manual-backend flow, start the backend first:

```bash
cd /path/to/windieos
python -m backend.src.main
```

Then validate remote access:

```bash
curl -fsSL https://api.windieos.com/api/embeddings/health
```

Service diagnostics:

```bash
systemctl --user status windieos-backend.service --no-pager
systemctl --user status windieos-cloudflared.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

If you skipped the optional backend service install, ignore the `windieos-backend.service` checks and just inspect the manual backend terminal plus `windieos-cloudflared.service`.

## 5) Optional one-shot bootstrap

For fresh setup on one machine:

```bash
cd /path/to/windieos
scripts/cloudflared/bootstrap-windieos-host
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

So installers on other laptops connect to the remote backend by default whenever the tunnel is up and your manually started local backend is healthy.
