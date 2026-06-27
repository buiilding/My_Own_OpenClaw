---
summary: "Inference provider guide for OCR, vision, embeddings, STT, TTS, provider health, and capability gating."
read_when:
  - When changing OCR, vision, embedding, STT, TTS, or provider-health behavior.
  - When debugging unavailable capabilities hidden from model-visible tools.
title: "Inference Providers"
---

# Inference Providers

WindieOS routes non-chat inference through explicit provider settings so hosted deployments can use local, remote, vendor, or disabled capabilities.

For provider factory, router, health gate, SDK, sidecar, STT, and TTS changes,
start with [Inference Capability Change Workflow](inference_capability_change_workflow.md).

## Configured Backends

private backend implementation and private backend implementation define provider mode fields:

| Capability | Config fields | Modes |
| --- | --- | --- |
| Embeddings | `embedding_backend`, `embedding_model`, `embedding_remote_service_url`, `embedding_api_key_env` | `local`, `remote-http`, `vendor`, `disabled` |
| OCR | `ocr_backend`, `ocr_model`, `ocr_remote_service_url`, `ocr_remote_health_url` | `local`, `remote-http`, `disabled` |
| Vision | `vision_backend`, `vision_model_name`, `vision_remote_service_url`, `vision_remote_health_url` | `local`, `remote-http`, `disabled` |
| STT | `stt_provider`, `openai_realtime_transcription_model`, `nova_voice_gateway_url` | `openai`, `nova` |
| TTS | `speech_provider`, ElevenLabs fields, local TTS fields | provider-specific |

Provider health and circuit breakers should hide or fail capabilities predictably rather than letting the agent repeatedly call dead paths.

## Owner Modules

- Provider health/capability policy: private backend implementation
- OCR/vision services: private backend implementation
- Embedding routes/services: private backend implementation
- STT gateway: private backend implementation
- TTS stream processing: private backend implementation
- Sidecar remote clients: `frontend/src/main/python/core/remote_*_client.py`

## Implementation Rules

- Keep local heavyweight imports lazy where possible so disabled/remote modes can start without local model dependencies.
- Preserve structured provider errors for tool turns.
- Router execution must reject unavailable providers before invocation. For OCR,
  disabled, not-ready, and circuit-open states return structured provider
  unavailability instead of calling the provider implementation directly.
- Concrete remote OCR adapters must also fail closed after a failed health probe
  so direct adapter calls cannot bypass router readiness checks and post work to
  an unhealthy service.
- Keep health probes bounded by timeout config.
- Update capability gating when a new provider mode changes model-visible tools.

## Deep Docs

- [Inference Capability Change Workflow](inference_capability_change_workflow.md)
- Backend Screen-Grounding Docs Hub (private backend docs)
- Backend Embedding + Semantic Memory Runtime Reference (private backend docs)
- Backend TTS + Wakeword Audio Runtime Reference (private backend docs)
