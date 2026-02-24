---
summary: "Backend services docs sub-hub for OCR/vision/embeddings/artifacts runtime services and storage responsibilities."
read_when:
  - When changing OCR/vision/embedding/artifact service behavior.
  - When debugging service initialization, storage constraints, or runtime throughput bottlenecks.
title: "Backend Services Docs Hub"
---

# Backend Services Docs Hub

## Deep Pages

- [Services and Storage](SERVICES_AND_STORAGE.md)
- [Embedding and Semantic Memory Runtime Reference](EMBEDDING_AND_SEMANTIC_MEMORY_RUNTIME_REFERENCE.md)
- [Artifact, Screenshot, and System-State Flow Reference](ARTIFACT_SCREENSHOT_AND_SYSTEM_STATE_FLOW_REFERENCE.md)
- [TTS and Wakeword Audio Runtime Reference](TTS_AND_WAKEWORD_AUDIO_RUNTIME_REFERENCE.md)
- [OCR and Vision Coordinate Runtime Reference](OCR_AND_VISION_COORDINATE_RUNTIME_REFERENCE.md)

## Code Scope

- `backend/src/services/*`
- `backend/src/embeddings/*`
- `backend/src/api/routes/memory/*`
