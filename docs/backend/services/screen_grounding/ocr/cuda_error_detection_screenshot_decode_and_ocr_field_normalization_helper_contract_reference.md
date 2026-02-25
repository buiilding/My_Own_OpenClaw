---
summary: "Deep reference for OCR helper utilities: CUDA/ONNX runtime error detection heuristics, strict screenshot base64/data-URL decoding contract, and mixed-field list normalization semantics."
read_when:
  - When changing `is_cuda_error`, `decode_screenshot_payload`, or `normalize_ocr_field` in OCR helpers.
  - When debugging CPU fallback trigger misses, invalid screenshot payload handling, or OCR result field type coercion drift.
title: "CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference"
---

# CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference

## Canonical Modules

- `backend/src/services/ocr/helpers.py`
- `backend/src/services/ocr/ocr_service.py`

## `is_cuda_error(error)` Contract

Purpose:

- classify OCR/runtime exceptions that should trigger CUDA->CPU fallback path

Detection rules:

- true if exception type name contains `ONNXRuntimeError` or `RuntimeException`
- true if error message contains `ONNXRuntimeError`
- otherwise true when message contains any keyword from `CUDA_ERROR_KEYWORDS` tuple

`CUDA_ERROR_KEYWORDS` intentionally includes mixed-case variants for CUDA/CUBLAS/CUDNN and ONNX allocator failures.

## `decode_screenshot_payload(screenshot_b64, logger)` Contract

Input acceptance:

- plain base64 string
- data URL (`data:...,...`) with comma separator

Normalization path:

1. reject non-string payloads
2. trim whitespace; reject empty
3. strip data URL prefix when present
4. remove all internal whitespace/newlines
5. decode using `base64.b64decode(..., validate=True)`

Error behavior:

- logs error message and returns `None` on any invalid format/decode failure

## `normalize_ocr_field(value, numpy_available, numpy_module)` Contract

Output is always `List[Any]`.

Coercion rules:

- `None` -> `[]`
- `str` -> `[str]`
- numpy ndarray (when available) -> `tolist()`
- tuple/list -> `list(value)`
- all other values -> `[value]`

This creates one consistent list shape for downstream OCR row parsing.

## Drift Hotspots

1. Removing strict base64 validation can allow malformed screenshot payloads into OCR path.
2. Weakening CUDA keyword coverage can suppress intended CPU fallback and surface hard OCR failures.
3. Changing normalize semantics (for strings/ndarrays) can break record parser expectations in OCR service.

## Related Pages

- [Backend Screen-Grounding OCR Helpers Docs Hub](README.md)
- [OCR Service and Screenshot State-Machine Reference](../ocr_service_and_screenshot_state_machine_reference.md)
