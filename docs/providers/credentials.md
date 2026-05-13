---
summary: "Provider credential guide covering environment variables, frontend-managed overrides, OAuth entries, and hosted install authentication."
read_when:
  - When changing API key loading, frontend provider settings, OAuth credential behavior, or hosted install auth.
  - When debugging provider availability caused by missing credentials.
title: "Provider Credentials"
---

# Provider Credentials

WindieOS supports environment-variable credentials, frontend-managed provider overrides, limited OAuth credential entries, and hosted install authentication. Never commit real credentials in docs, tests, or config.

## Environment Variables

Default provider env vars are defined in `backend/src/core/config/models.py`:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `OPENROUTER_API_KEY`
- `MISTRAL_API_KEY`
- `KIMI_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `ELEVENLABS_API_KEY`

Embedding vendor mode also defaults to `OPENAI_API_KEY`.

## Frontend-Managed Provider Overrides

`ProviderApiKeys` in `backend/src/core/config/models.py` defines frontend-managed key overrides. Provider aliases are normalized, including `gemini` to `google` and `kimi-code` to `kimi_coding`.

Use these overrides only through the config/settings path. Do not bypass the backend config service.

## OAuth Entries

The current OAuth config surface includes `openai_codex`. The main-process OAuth helper lives at `frontend/src/main/openai_codex_oauth.cjs`. Renderer controls may not expose every compatible backend setting, so verify current UI before documenting a user-visible OAuth flow.

## Hosted Install Auth

Hosted installs use install-token authentication when enabled. Relevant code lives in:

- `backend/src/core/config/app_config.py`
- `frontend/src/main/python/core/install_auth_state.py`
- `frontend/src/main/python/core/remote_api_client_base.py`
- Electron main websocket/API client paths

## Debugging

- Check config resolution before editing provider code.
- Check whether the provider factory actually registered the provider.
- Check frontend overrides only after confirming environment variables are absent or intentionally overridden.
- Check hosted auth headers when a remote REST route works locally but fails through the packaged app.
