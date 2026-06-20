---
summary: "Workflow for changing WindieOS backend services across artifacts, OCR, vision, embeddings, semantic memory, TTS/wakeword audio, token counting, and VM run-control support without confusing route, agent-loop, and service ownership."
read_when:
  - When changing `backend/src/services`, `backend/src/embeddings`, `backend/src/core/inference`, backend artifact storage, OCR/vision coordinate services, embedding or semantic memory services, TTS/wakeword audio helpers, token counting, or VM run-control support services.
  - When a backend route, agent tool, SDK call, sidecar remote client, or renderer symptom depends on a backend service and you need to route the actual service owner before editing.
title: "Backend Service Change Workflow"
---

# Backend Service Change Workflow

Use this workflow when the behavior is a backend service capability rather than route parsing, websocket transport, or agent-loop orchestration. Services own reusable runtime behavior used by routes, tools, SDK helpers, and operational flows: artifact storage, OCR, vision coordinate grounding, embeddings, semantic summarization, TTS audio, token counting, and VM run-control state.

Do not put service policy into API route functions or renderer code. Routes should validate and call services; agent code should orchestrate services through clear interfaces; desktop client/local-runtime Python code should consume stable route/tool contracts.

## Fast Owner Map

| Symptom or request | Service owner | First source roots | First tests | First docs |
| --- | --- | --- | --- | --- |
| Artifact upload, fetch, ID validation, base64 lookup, or artifact URL changes | Artifact store and artifact route helpers | `backend/src/services/artifacts`, `backend/src/api/routes/artifacts` | `tests/backend/test_artifacts_store.py`, `tests/backend/test_artifact_routes.py` | [Artifact Service Hub](artifacts/README.md), [Artifact Store Contract](artifacts/artifact_store_upload_streaming_id_validation_and_base64_lookup_contract_reference.md) |
| Screenshot artifact, system-state, or tool-result image flow changes | Artifact plus screenshot/system-state preparation services | `backend/src/services/artifacts`, `backend/src/agent/tools/preparation/screenshot`, `backend/src/agent/tools/preparation/ocr`, `backend/src/agent/tools/preparation/coordinate_resolution` | artifact tests, screenshot manager/state tests | [Artifact, Screenshot, and System-State Flow](artifact_screenshot_and_system_state_flow_reference.md), [Artifact Change Workflow](../../desktop/artifact_change_workflow.md) |
| OCR extraction, OCR health, text box normalization, or OCR provider mode changes | OCR provider/router/service | `backend/src/services/ocr`, `backend/src/core/inference/ocr_router.py`, `backend/src/agent/tools/preparation/ocr` | `tests/backend/test_ocr_service.py`, `tests/backend/test_ocr_coordinate_resolver.py`, `tests/backend/test_remote_ocr_vision_providers.py` | [Inference Capability Change Workflow](../../providers/inference_capability_change_workflow.md), [OCR Service and Screenshot State Machine](screen_grounding/ocr_service_and_screenshot_state_machine_reference.md), [Inference Providers](../../providers/inference.md) |
| Vision locate/describe, coordinate scaling, provider loading, or model fallback changes | Vision provider/router/service | `backend/src/services/vision`, `backend/src/core/inference/vision_router.py`, `backend/src/agent/tools/preparation/coordinate_resolution` | `tests/backend/test_vision_service.py`, `tests/backend/test_vision_coordinates.py`, `tests/backend/test_vision_provider_loader.py` | [Inference Capability Change Workflow](../../providers/inference_capability_change_workflow.md), [Vision Provider Runtime](screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md), [OCR and Vision Coordinate Runtime](ocr_and_vision_coordinate_runtime_reference.md) |
| Embedding generation, embedding identity, health, provider mode, or import latency changes | Embedding provider/router/service | `backend/src/embeddings`, `backend/src/core/inference/embedding_router.py`, `backend/src/api/routes/memory/embeddings` | `tests/backend/test_embeddings_*.py`, `tests/backend/test_remote_embedding_provider.py`, `tests/backend/test_openai_embedding_provider.py` | [Inference Capability Change Workflow](../../providers/inference_capability_change_workflow.md), [Embedding and Semantic Memory Runtime](embedding_and_semantic_memory_runtime_reference.md), [Inference Providers](../../providers/inference.md) |
| Semantic summarize/title parser quality or memory route fallback changes | Semantic memory route service/parser | `backend/src/api/routes/memory/semantic`, `backend/src/services`, `backend/src/llm/providers` when provider interaction changes | `tests/backend/test_semantic_parser_service.py`, memory route tests | [Embedding and Semantic Memory Runtime](embedding_and_semantic_memory_runtime_reference.md), [Memory Route Validation](../api/memory_route_validation_and_fallback_reference.md) |
| TTS chunking, provider failure, CUDA error detection, or audio stream cleanup changes | TTS manager/session/service helpers | `backend/src/api/processing/tts`, `backend/src/api/services/tts_session.py`, TTS service modules | `tests/backend/test_tts_manager.py`, `tests/backend/test_tts_session.py`, `tests/backend/test_elevenlabs_tts_service.py` | [TTS and Wakeword Audio Runtime](tts_and_wakeword_audio_runtime_reference.md), [Voice Audio Change Workflow](../../channels/voice_audio_change_workflow.md) |
| Token count, fallback estimation, tool-call normalization, or usage diagnostics changes | Token service | `backend/src/services/token_service.py`, token docs/tests | `tests/backend/test_token_service_fallback.py`, token/count formatter tests | [Token Service Docs Hub](token/README.md), [Token Counter Invocation Reference](token/calculation/token_counter_invocation_fallback_estimation_and_tool_call_normalization_reference.md) |
| VM run assignment, event log, pending controls, transitions, or bulk stop changes | VM run-control service and support modules | `backend/src/services/vm_run_control.py`, `backend/src/services/vm_run_control_support/*`, `backend/src/api/routes/runs` | `tests/backend/test_vm_run_control_*.py`, run route tests | [VM Run Control Service](vm_run_control_service_runtime_reference.md), [Runs API Runbook](../../automation/runs_api_runbook.md) |
| Provider health/capability gating for OCR, vision, embedding, web-search exposure, or tool visibility changes | Inference routers and provider health policy | `backend/src/core/inference`, `backend/src/tools/provider_health.py`, service providers | `tests/backend/test_inference_routers.py`, `tests/backend/test_provider_health_policy.py` | [Inference Capability Change Workflow](../../providers/inference_capability_change_workflow.md), [Inference Providers](../../providers/inference.md), [Tool Policy Profiles](../../tools/tool_policy_profiles_and_capabilities.md) |

## Boundary Rules

- API routes validate HTTP/websocket payloads and call services; services own reusable behavior and provider details.
- Agent-loop code orchestrates tool turns and prompt context; it should not duplicate service internals.
- Frontend and sidecar consume hosted route contracts; they must not import backend services.
- Keep heavyweight model imports lazy enough that disabled or remote modes can start without local model dependencies.
- Provider health and circuit breakers should fail capabilities predictably instead of repeatedly invoking dead local/remote providers.
- Service errors returned to clients should be structured and sanitized while logs retain enough evidence for debugging.
- Keep provider identity metadata stable when local-runtime memory or hosted helper clients use it to detect embedding-space changes.

## Change Sequence

1. **Classify the capability.** Decide whether the owner is artifact, OCR, vision, embedding, semantic, TTS, token, VM run-control, or provider-health service.
2. **Read the service leaf doc.** Start with this workflow, the backend services hub, and the matching owner doc in the map.
3. **Trace callers.** Identify API route, agent tool preparation, SDK route, sidecar remote client, or VM worker consumer before editing.
4. **Edit service behavior behind the stable interface.** Prefer service/provider/router changes over duplicating behavior in API handlers.
5. **Update route or formatter contracts only when the public payload changes.** Then follow [API Route Change Workflow](../api/api_route_change_workflow.md).
6. **Update provider health/capability gates when availability changes.** Tool visibility and route health should agree with actual runtime behavior.
7. **Add focused service tests plus caller tests when payloads change.**
8. **Update docs and changelog.** Link new service surfaces from the hub and relevant capability docs.

## Provider and Inference Checklist

When changing OCR, vision, embeddings, STT, or TTS provider behavior:

- Preserve config-driven mode selection (`local`, `remote-http`, `vendor`, `disabled`, or provider-specific modes).
- Keep timeout and circuit-breaker behavior bounded.
- Return structured provider errors for tool turns and route responses.
- Keep health probes cheap and useful; do not trigger expensive model loads unnecessarily unless the health contract requires it.
- Update capability gating when provider availability affects model-visible tools.
- Add tests for local mode, remote/disabled mode, failure mode, and health behavior when feasible.

## Artifact and Storage Checklist

When changing artifact storage:

- Keep artifact IDs validated before filesystem lookup.
- Preserve content type, byte size, sha256, absolute URL, and lookup behavior when route contracts depend on them.
- Keep upload streaming bounded and avoid loading unbounded files into memory.
- Update artifact route tests when store error mapping or URL construction changes.
- Validate screenshot/artifact references still rehydrate through transcript and SDK clients when the artifact shape changes.

## Memory and Embedding Checklist

When changing embedding or semantic memory services:

- Preserve embedding provider/model/version metadata and `embedding_space_version` semantics.
- Keep disabled/remote embedding deployments lightweight by avoiding eager local model imports.
- Keep local-runtime remote-client behavior in mind: local-runtime memory may treat embedding unavailability as non-fatal.
- Test health routes, route serialization, provider failure, and config rebind behavior.
- Update memory route and local-runtime memory docs if the route response or failure behavior changes.

## Audio and Token Checklist

When changing TTS or token counting:

- Keep streaming audio cleanup deterministic on disconnect, cancellation, or provider error.
- Preserve CUDA/provider error truncation helpers so logs stay useful without flooding clients.
- Keep token fallback estimation deterministic when provider/native counts are unavailable.
- Update websocket formatter contracts when token-count or audio event payloads change.

## VM Run-Control Checklist

When changing VM run-control support:

- Preserve run status transitions and event sequence numbers.
- Keep worker assignment, heartbeat, pending controls, and stop-all behavior deterministic.
- Update API route models and response builders when route payloads change.
- Add tests for active-run caps, assignment, control commands, event polling, and terminal transitions.

## Validation Matrix

| Changed surface | Focused validation |
| --- | --- |
| Artifacts | `./scripts/python-in-env backend pytest tests/backend/test_artifacts_store.py tests/backend/test_artifact_routes.py` |
| OCR/vision | `./scripts/python-in-env backend pytest tests/backend/test_ocr_service.py tests/backend/test_vision_service.py tests/backend/test_vision_coordinates.py tests/backend/test_remote_ocr_vision_providers.py` |
| Embeddings/semantic | `./scripts/python-in-env backend pytest tests/backend/test_embeddings_*.py tests/backend/test_semantic_parser_service.py tests/backend/test_memory_routes.py` |
| Provider health/inference routing | `./scripts/python-in-env backend pytest tests/backend/test_inference_routers.py tests/backend/test_provider_health_policy.py` |
| TTS/audio | `./scripts/python-in-env backend pytest tests/backend/test_tts_manager.py tests/backend/test_tts_session.py tests/backend/test_elevenlabs_tts_service.py` |
| Token counting | `./scripts/python-in-env backend pytest tests/backend/test_token_service_fallback.py` plus formatter tests when events change |
| VM run control | `./scripts/python-in-env backend pytest tests/backend/test_vm_run_control_*.py tests/backend/test_run_control_routes.py` |
| Docs-only service workflow updates | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

## Review Checklist

Before committing service work:

- Did the change belong in a service/provider/router rather than API handler, agent loop, renderer, or sidecar?
- Did callers still see the same contract unless a contract change was intentional and documented?
- Did provider health, capability gating, and tool visibility stay aligned?
- Did tests cover success, unavailable provider, remote/disabled mode, and sanitized failure behavior where relevant?
- Did docs and `CHANGELOG.md` move with behavior or contract changes?

## Related Docs

- [Backend Services Docs Hub](README.md)
- [Inference Capability Change Workflow](../../providers/inference_capability_change_workflow.md)
- [Inference Providers](../../providers/inference.md)
- [API Route Change Workflow](../api/api_route_change_workflow.md)
- [Artifact Change Workflow](../../desktop/artifact_change_workflow.md)
- [Voice Audio Change Workflow](../../channels/voice_audio_change_workflow.md)
- [Runs API Runbook](../../automation/runs_api_runbook.md)
