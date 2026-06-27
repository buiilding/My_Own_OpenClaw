---
summary: "Provider credential guide covering environment variables, renderer-managed overrides, OAuth entries, and hosted install authentication."
read_when:
  - When changing API key loading, frontend provider settings, OAuth credential behavior, or hosted install auth.
  - When debugging provider availability caused by missing credentials.
title: "Provider Credentials"
---

# Provider Credentials

WindieOS supports environment-variable credentials, renderer-managed provider overrides, and hosted install authentication. Never commit real credentials in docs, tests, or config.

For code-owner routing and validation commands across install tokens, runs keys,
provider keys, local-runtime remote-client auth headers, and logging, start with
[Credential and Token Change Workflow](../security/credential_token_change_workflow.md).

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

## Renderer-Managed Provider Overrides

`ProviderApiKeys` in `backend/src/core/config/models.py` defines
renderer-managed key overrides accepted through the client settings patch
contract. SDK clients sanitize the credential map generically by provider-key
syntax and entry shape, while backend validation decides which provider ids are
supported and ignores unsupported provider entries. Provider aliases normalize
`gemini` to `google`. Kimi key overrides use the canonical config field
`kimi_coding`; other Kimi spellings are unavailable for credential lookup.

Use these overrides only through the config/settings path. Do not bypass the backend config service.

`update-settings` may carry raw provider API keys into backend session config. `load-settings` must not echo those secrets back to clients; it returns the provider entries with `api_key` redacted to an empty string while preserving non-secret state such as `enabled`. Backend credential resolution treats an enabled override with an empty key as redacted or incomplete state and falls back to the provider's configured environment variable instead of using it as an explicit empty credential.

## Hosted Install Auth

Hosted installs use install-token authentication when enabled. Relevant code lives in:

- `backend/src/core/config/app_config.py`
- `frontend/src/main/python/windie/_auth.py`
- `frontend/src/main/python/windie/_remote_api_client_base.py`
- Electron main websocket/API client paths

## Debugging

- Check config resolution before editing provider code.
- Check whether the provider factory actually registered the provider.
- Check renderer overrides only after confirming environment variables are absent or intentionally overridden.
- Check hosted auth headers when a remote REST route works locally but fails through the packaged app.
- Check [Credential and Token Change Workflow](../security/credential_token_change_workflow.md) when a symptom could belong to install auth, runs auth, provider credentials, sidecar header propagation, or secret logging.
