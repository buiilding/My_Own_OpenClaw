---
summary: "Backend screen-grounding OCR helper docs sub-hub for CUDA-error classification, screenshot payload decoding, OCR field normalization, and runtime-config threshold/thread selection contracts."
read_when:
  - When changing `backend/src/services/ocr/helpers.py` or `backend/src/services/ocr/runtime_config.py` helper behavior.
  - When debugging OCR fallback misclassification, screenshot base64 decode failures, mixed OCR SDK payload normalization issues, or runtime batch/thread parameter drift.
title: "Backend Screen-Grounding OCR Helpers Docs Hub"
---

# Backend Screen-Grounding OCR Helpers Docs Hub

## Deep Pages

- [CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference](cuda_error_detection_screenshot_decode_and_ocr_field_normalization_helper_contract_reference.md)
- [OCR Runtime Config Threshold and Thread Resolution Reference](runtime_config_threshold_and_thread_resolution_reference.md)

## Related Pages

- [Backend Services Screen-Grounding Docs Hub](../README.md)
- [OCR Service and Screenshot State-Machine Reference](../ocr_service_and_screenshot_state_machine_reference.md)

## Code Scope

- `backend/src/services/ocr/helpers.py`
- `backend/src/services/ocr/runtime_config.py`
- `backend/src/services/ocr/ocr_service.py`
