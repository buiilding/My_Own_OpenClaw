---
summary: "Backend screen-grounding vision docs sub-hub for provider loader fallback contracts and InternVL runtime chat/generate recovery behavior."
read_when:
  - When changing `backend/src/services/vision/providers/base.py` loader fallback sequencing or device resolution rules.
  - When changing InternVL runtime fallback behavior in `backend/src/services/vision/providers/internvl.py` or `internvl_runtime_helpers.py`.
title: "Backend Screen-Grounding Vision Docs Hub"
---

# Backend Screen-Grounding Vision Docs Hub

## Deep Pages

- [Provider Loader Device-Map, Direct, CPU Fallback, and Dtype Contract Reference](provider_loader_device_map_direct_cpu_fallback_and_dtype_contract_reference.md)
- [InternVL Chat/Generate Fallback and Runtime Flash-Attention Disable Reference](internvl_chat_generate_fallback_and_runtime_flash_attention_disable_reference.md)

## Related Pages

- [Backend Services Screen-Grounding Docs Hub](../README.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](../vision_provider_runtime_and_coordinate_scaling_reference.md)
- [OCR and Vision Coordinate Runtime Overview](../../ocr_and_vision_coordinate_runtime_reference.md)

## Code Scope

- `backend/src/services/vision/providers/base.py`
- `backend/src/services/vision/providers/internvl.py`
- `backend/src/services/vision/providers/internvl_runtime_helpers.py`
- `tests/backend/test_vision_provider_loader.py`
