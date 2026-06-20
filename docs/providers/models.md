---
summary: "WindieOS model catalog and LLM provider guide covering provider factory registration, model metadata, reasoning variants, and capability flags."
read_when:
  - When adding, removing, or updating model catalog entries.
  - When changing LLM provider runtime behavior, model-list responses, or capability metadata.
title: "Models and LLM Providers"
---

# Models and LLM Providers

WindieOS separates provider runtime classes from model catalog metadata.

## Runtime Providers

Provider instances are created in `backend/src/llm/providers/factory.py`. Cloud providers require API keys; local providers are always registered but can fail at runtime if their local server is not running.

| Provider | Runtime class | Default credential/config |
| --- | --- | --- |
| OpenAI | `OpenAIProvider` | `OPENAI_API_KEY` |
| Anthropic | `AnthropicProvider` | `ANTHROPIC_API_KEY` |
| Gemini | `GeminiProvider` | `GOOGLE_API_KEY` |
| OpenRouter | `OpenRouterProvider` | `OPENROUTER_API_KEY`, `https://openrouter.ai/api/v1` |
| Mistral | `MistralProvider` | `MISTRAL_API_KEY` |
| Kimi Coding | `KimiCodingProvider` | `KIMI_API_KEY`, `https://api.kimi.com/coding` |
| Scripted | `ScriptedProvider` | Dev-loop only deterministic provider; no credential |
| Ollama | `OllamaProvider` | `http://localhost:11434/v1` |
| LM Studio | `LMStudioProvider` | `http://localhost:1234/v1` |

## Model Catalog

`backend/src/llm/models/models_config.py` owns display metadata and capability flags such as:

- runtime model id
- display name
- context window
- strengths and latency labels
- thinking/reasoning variants
- native web-search support
- Codex OAuth support for supported OpenAI Codex-family models

The frontend model selector consumes model-list output from the backend. Do not hard-code new model behavior only in the renderer.

The scripted runtime is an exception for local dev-loop validation. The backend
provider is always routable as `scripted` so selected dev sessions can execute
it, but the desktop UI only appends the `Scripted Runtime` model row when
`<windie> start dev` launches Electron with `WINDIE_ENABLE_SCRIPTED_PROVIDER=1`.
The generic main-process helper reads the host-configured `scriptedProvider`
debug flag, and the WindieOS host skin maps that flag to the current
`WINDIE_ENABLE_SCRIPTED_PROVIDER` environment variable. This keeps packaged and
customer starts from surfacing the deterministic model.

Scripted chat commands are typed in the normal composer after selecting
`Scripted` / `Scripted Runtime`:

```text
@script reply Hello from scripted model
```

```text
@script tool filesystem_read {"path":"README.md"}
```

```text
@script batch [
  {"tool":"screenshot","args":{}},
  {"tool":"filesystem_read","args":{"path":"README.md"}}
]
```

```text
@script image?
```

`@script image?` reports how many `image_url` parts reached the provider prompt,
which proves attached or captured images were parsed into model-visible
multimodal input. The scripted `filesystem_read` command is a dev-parser alias
for the real `read_file` tool and normalizes `path` to `file_path`; the actual
model-visible tool surface is unchanged.

OpenAI GPT-5.4 and GPT-5.5 are represented as separate backend catalog
families. Each family exposes `none`, `low`, `medium`, `high`, and `xhigh`
reasoning presets; the provider request path reads the explicit
`reasoning_mode` metadata instead of inferring effort from display names.

## Change Path

1. Add or update provider implementation in `backend/src/llm/providers/*` only if runtime behavior changes.
2. Add or update catalog metadata in `backend/src/llm/models/models_config.py`.
3. Update config defaults in `backend/src/core/config/app_config.py` or provider models in `backend/src/core/config/models.py` if needed.
4. Update docs and tests covering model list, capability flags, provider request kwargs, streaming, and tool-call behavior.

## Deep Docs

- [Backend LLM Provider Docs Hub](../backend/llm/providers/README.md)
- [Backend LLM Base Request, Stream, and Normalization Reference](../backend/llm/providers/base_request_stream_and_normalization_reference.md)
- [Backend LLM Provider-Specific Overrides and Local Runtime Reference](../backend/llm/providers/provider_specific_overrides_and_local_runtime_reference.md)

## Provider-Specific Docs

- [OpenAI Provider](openai.md)
- [Anthropic Provider](anthropic.md)
- [Gemini Provider](gemini.md)
- [OpenRouter Provider](openrouter.md)
- [Kimi Coding Provider](kimi_coding.md)
- [Mistral Provider](mistral.md)
- [Local Providers](local.md)
