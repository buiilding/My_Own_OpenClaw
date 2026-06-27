---
summary: "Local provider guide for WindieOS covering Ollama, LM Studio, model discovery, credential-free local requests, base URLs, and tests."
read_when:
  - When changing local model behavior, Ollama or LM Studio discovery, model_mode local behavior, or local provider base URLs.
  - When debugging local models that do not list, fail completion, or drift from online provider request behavior.
title: "Local Providers"
---

# Local Providers

WindieOS supports local LLM providers for Ollama and LM Studio. They are registered without API keys but can fail at runtime if their local servers are unavailable.

## Code Ownership

| Concern | Files |
| --- | --- |
| Local provider base class | private backend implementation |
| Provider factory registration | private backend implementation |
| Config defaults | private backend implementation |
| Runtime API key policy | private backend implementation |
| Model listing service | private backend implementation |
| Dashboard model UI | `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx` |

## Providers

| Provider | Factory key | Default base URL | Notes |
| --- | --- | --- | --- |
| Ollama | `ollama` | `http://localhost:11434/v1` | Model discovery uses Ollama-compatible local endpoints. |
| LM Studio | `lmstudio` | `http://localhost:1234/v1` | Model discovery reads local server model list payloads. |

Local providers do not require API keys. Do not require credentials for local model mode.

## Runtime Behavior

The provider factory always attempts to register local providers. Availability is checked later by model discovery or request execution.

`load_api_key_for_provider` returns `api_key=None` when `model_mode == "local"`.

`LocalLLMProvider` manages a shared `httpx.AsyncClient` per provider instance so repeated local requests reuse connections. Keep cleanup logic intact when changing provider caching.

## Model Discovery

Local model discovery belongs in the backend model service, not the renderer. The dashboard should consume backend model-list output.

If local models are missing:

- Confirm the local server is running.
- Confirm the configured base URL points at the local server.
- Check `get_local_models` behavior in backend model service.
- Check provider payload normalization before changing dashboard display logic.

## Tests

Focused backend tests:

```bash
private backend tests private backend tests -q
private backend tests private backend tests -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- ChatInterfaceWiring.test.jsx ModelSelectionUtils.test.js ModelsSection.test.jsx
```

