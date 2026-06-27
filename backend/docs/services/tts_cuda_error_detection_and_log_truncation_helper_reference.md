---
summary: "Backend TTS CUDA helper reference: GPU failure keyword detection, ONNXRuntime-type matching, and bounded exception-text truncation contract used by TTSService fallback logging."
read_when:
  - When changing `backend/src/core/services/tts_cuda.py` helper behavior.
  - When debugging TTS CUDA->CPU fallback triggers or inconsistent error-log truncation in `TTSService`.
title: "TTS CUDA Error Detection and Log-Truncation Helper Reference"
---

# TTS CUDA Error Detection and Log-Truncation Helper Reference

## Canonical Modules

- `backend/src/core/services/tts_cuda.py`
- `backend/src/core/services/tts_service.py`
- `backend/src/services/ocr/helpers.py`

## Purpose

`tts_cuda.py` provides small, shared predicates/formatters for TTS GPU error handling:

- classify synthesis/load failures as CUDA-related (`is_cuda_error`)
- keep error log lines bounded (`format_truncated_error`)

`TTSService` uses these helpers in model-load and runtime synthesis fallback paths.

## `is_cuda_error(error)` Contract

Detection inputs:

- exception type name (`type(error).__name__`)
- exception message (`str(error)`)

Returns `True` when either condition matches:

1. `ONNXRuntimeError` appears in type name or message
2. message contains any keyword in `CUDA_ERROR_KEYWORDS`

Current keyword surface includes:

- general CUDA/CUDNN/CUBLAS markers (`CUDA`, `CUDNN`, `CUBLAS_STATUS`, `cuda_call`, `cublas`, `cudnn`)
- allocator/runtime failures (`Failed to allocate memory`, `RUNTIME_EXCEPTION`, `CUBLAS_STATUS_ALLOC_FAILED`)

Usage in `TTSService`:

- CUDA init failures are fail-open to CPU when predicate is `True`
- CUDA synthesis failures during runtime trigger CPU reload+retry when predicate is `True`
- non-CUDA errors are logged and skipped (no forced CPU reload path)

## `format_truncated_error(error, limit=200)` Contract

Behavior:

- returns full `str(error)` when message length `<= limit`
- otherwise returns first `limit` characters (no suffix marker)

Purpose:

- avoid oversized stackline payloads in warning/error logs
- keep fallback diagnostics stable for repeated CUDA retry loops

## TTS vs OCR CUDA Helper Boundary

OCR has a separate `is_cuda_error` helper (`services/ocr/helpers.py`) with a slightly different keyword/type surface (for OCR-engine specific failures such as BFCArena/RuntimeException variants).

Boundary rule:

- TTS must use `core/services/tts_cuda.py` helpers
- OCR must use `services/ocr/helpers.py`

Do not unify blindly without verifying both service-specific failure signatures.

## Drift Hotspots

1. Removing broad keywords like `CUDA`/`CUDNN` can reduce fallback sensitivity and leave TTS stuck failing on GPU.
2. Over-broad keyword additions can misclassify unrelated errors and force unnecessary CPU fallback.
3. Changing truncation behavior (e.g., adding suffixes or trimming whitespace) can alter log contracts relied on by diagnostics/tests.

## Related Pages

- [Backend Services Docs Hub](README.md)
- [TTS and Wakeword Audio Runtime Reference](tts_and_wakeword_audio_runtime_reference.md)
- [CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference](screen_grounding/ocr/cuda_error_detection_screenshot_decode_and_ocr_field_normalization_helper_contract_reference.md)
