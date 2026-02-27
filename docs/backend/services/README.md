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
- [Artifact Service Docs Hub](artifacts/README.md)
- [Embedding and Semantic Memory Runtime Reference](embedding_and_semantic_memory_runtime_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](artifact_screenshot_and_system_state_flow_reference.md)
- [Artifact Store Upload Streaming, ID Validation, and Base64 Lookup Contract Reference](artifacts/artifact_store_upload_streaming_id_validation_and_base64_lookup_contract_reference.md)
- [Artifact HTTP Route Error Mapping and URL Construction Reference](artifacts/artifact_http_route_error_mapping_and_url_construction_reference.md)
- [Token Docs Hub](token/README.md)
- [Token Service Message Normalization and Fallback Reference](token/token_service_message_normalization_and_fallback_reference.md)
- [Token Calculation Docs Hub](token/calculation/README.md)
- [Token Counter Invocation, Fallback Estimation, and Tool-Call Normalization Reference](token/calculation/token_counter_invocation_fallback_estimation_and_tool_call_normalization_reference.md)
- [TTS and Wakeword Audio Runtime Reference](tts_and_wakeword_audio_runtime_reference.md)
- [TTS CUDA Error Detection and Log-Truncation Helper Reference](tts_cuda_error_detection_and_log_truncation_helper_reference.md)
- [Screen-Grounding Docs Hub](screen_grounding/README.md)
- [OCR and Vision Coordinate Runtime Overview](ocr_and_vision_coordinate_runtime_reference.md)
- [OCR Service and Screenshot State-Machine Reference](screen_grounding/ocr_service_and_screenshot_state_machine_reference.md)
- [Screen-Grounding OCR Helpers Docs Hub](screen_grounding/ocr/README.md)
- [CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference](screen_grounding/ocr/cuda_error_detection_screenshot_decode_and_ocr_field_normalization_helper_contract_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)
- [Screen-Grounding Vision Docs Hub](screen_grounding/vision/README.md)
- [Provider Loader Device-Map, Direct, CPU Fallback, and Dtype Contract Reference](screen_grounding/vision/provider_loader_device_map_direct_cpu_fallback_and_dtype_contract_reference.md)
- [InternVL Chat/Generate Fallback and Runtime Flash-Attention Disable Reference](screen_grounding/vision/internvl_chat_generate_fallback_and_runtime_flash_attention_disable_reference.md)

## Code Scope

- `backend/src/services/*`
- `backend/src/embeddings/*`
- `backend/src/api/routes/memory/*`
- `backend/src/agent/tools/preparation/screenshot/*`
- `backend/src/agent/tools/preparation/ocr/*`
- `backend/src/agent/tools/preparation/coordinate_resolution/*`
