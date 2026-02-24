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
- [TTS and Wakeword Audio Runtime Reference](tts_and_wakeword_audio_runtime_reference.md)
- [OCR and Vision Coordinate Runtime Reference](ocr_and_vision_coordinate_runtime_reference.md)

## Code Scope

- `backend/src/services/*`
- `backend/src/embeddings/*`
- `backend/src/api/routes/memory/*`
