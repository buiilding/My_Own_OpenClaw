---
summary: "Backend services screen-grounding docs sub-hub for OCR service lifecycle, screenshot/OCR session state, vision provider loading fallback, and coordinate scaling/parsing contracts."
read_when:
  - When changing OCR/vision behavior used by `mouse_control` coordinate preparation.
  - When debugging screenshot-to-coordinate races, OCR fallback behavior, or model coordinate parsing failures.
title: "Backend Services Screen-Grounding Docs Hub"
---

# Backend Services Screen-Grounding Docs Hub

## Deep Pages

- [OCR Service and Screenshot State-Machine Reference](ocr_service_and_screenshot_state_machine_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](vision_provider_runtime_and_coordinate_scaling_reference.md)
- [Screen-Grounding Vision Docs Hub](vision/README.md)
- [Provider Loader Device-Map, Direct, CPU Fallback, and Dtype Contract Reference](vision/provider_loader_device_map_direct_cpu_fallback_and_dtype_contract_reference.md)
- [InternVL Chat/Generate Fallback and Runtime Flash-Attention Disable Reference](vision/internvl_chat_generate_fallback_and_runtime_flash_attention_disable_reference.md)

## Related Pages

- [OCR and Vision Coordinate Runtime Overview](../ocr_and_vision_coordinate_runtime_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../tools/tool_preparation_and_coordinate_resolution_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](../artifact_screenshot_and_system_state_flow_reference.md)

## Code Scope

- `backend/src/core/container/initializer.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/services/ocr/ocr_service.py`
- `backend/src/agent/tools/preparation/screenshot/state.py`
- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/ocr/coordinator.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `backend/src/services/vision/vision_service.py`
- `backend/src/services/vision/providers/base.py`
- `backend/src/services/vision/providers/internvl.py`
- `backend/src/services/vision/providers/ui_venus.py`
- `backend/src/services/vision/coordinates.py`
- `backend/src/services/vision/utils.py`
