---
summary: "Cloudflared Self-Host Runbook for windieos.com"
read_when:
  - When exposing a self-hosted WindieOS backend through Cloudflare Tunnel.
  - When mapping `api.windieos.com` to this computer.
---

# Cloudflared Self-Host Runbook (`windieos.com`)

This runbook sets up:
- WindieOS backend as a user-level systemd service.
- Cloudflare Tunnel from this machine to `api.windieos.com`.
- Persistent startup for both services.

## Prerequisites

- Domain `windieos.com` managed in Cloudflare DNS.
- Linux machine with `systemctl --user` available.
- WindieOS repo on machine.
- Backend secrets provided through a local env file (do not commit secrets).

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

## 4) Validate remote access

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

So installers on other laptops connect to remote backend by default once tunnel + backend are healthy.
