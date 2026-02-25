---
summary: "Backend services docs sub-hub for OCR/vision/embeddings/artifacts/token runtime services and storage responsibilities."
read_when:
  - When changing OCR/vision/embedding/artifact/token service behavior.
  - When debugging service initialization, storage constraints, or runtime throughput bottlenecks.
title: "Backend Services Docs Hub"
---

# Backend Services Docs Hub

## Deep Pages

- [Services and Storage](services_and_storage.md)
- [Embedding and Semantic Memory Runtime Reference](embedding_and_semantic_memory_runtime_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](artifact_screenshot_and_system_state_flow_reference.md)
- [Token Docs Hub](token/README.md)
- [Token Service Message Normalization and Fallback Reference](token/token_service_message_normalization_and_fallback_reference.md)
- [Token Calculation Docs Hub](token/calculation/README.md)
- [Token Counter Invocation, Fallback Estimation, and Tool-Call Normalization Reference](token/calculation/token_counter_invocation_fallback_estimation_and_tool_call_normalization_reference.md)
- [TTS and Wakeword Audio Runtime Reference](tts_and_wakeword_audio_runtime_reference.md)
- [Screen-Grounding Docs Hub](screen_grounding/README.md)
- [OCR and Vision Coordinate Runtime Overview](ocr_and_vision_coordinate_runtime_reference.md)
- [OCR Service and Screenshot State-Machine Reference](screen_grounding/ocr_service_and_screenshot_state_machine_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)

## Code Scope

- `backend/src/services/*`
- `backend/src/embeddings/*`
- `backend/src/api/routes/memory/*`
- `backend/src/agent/tools/preparation/screenshot/*`
- `backend/src/agent/tools/preparation/ocr/*`
- `backend/src/agent/tools/preparation/coordinate_resolution/*`
