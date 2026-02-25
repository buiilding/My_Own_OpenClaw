---
summary: "Deep reference for OCR runtime-config helpers: hardware probe defaults, batch-threshold normalization/selection, and thread-count + param payload assembly contracts."
read_when:
  - When changing OCR GPU/CPU batch-size threshold behavior or thread-count resolution.
  - When debugging OCR runtime parameter drift between config values and engine initialization payloads.
title: "OCR Runtime Config Threshold and Thread Resolution Reference"
---

# OCR Runtime Config Threshold and Thread Resolution Reference

## Canonical Modules

- `backend/src/services/ocr/runtime_config.py`
- `backend/src/services/ocr/ocr_service.py`
- `tests/backend/test_ocr_runtime_config.py`
- `tests/backend/test_ocr_service.py`

## Hardware Probe Helpers

- `detect_gpu_memory_gb()`:
  - returns primary GPU memory in GB when `torch.cuda.is_available()` succeeds
  - returns `None` on import/runtime probe failures
- `detect_cpu_cores()`:
  - derives from `os.cpu_count()`
  - returns `max(4, cpu_count - 1)` when available
  - falls back to `4` if probe fails or API missing

## Batch Threshold Normalization + Selection

- `normalized_batch_thresholds(thresholds)`:
  - accepts only 3-item rows (`min_gpu`, `rec_batch`, `cls_batch`)
  - coerces to `(float, int, int)` tuples
  - ignores malformed rows
  - falls back to default `[(0.0, 6, 4)]` when no valid rows remain
  - returns thresholds sorted by descending `min_gpu`
- `resolve_batch_sizes(use_cuda, gpu_memory_gb, sorted_thresholds)`:
  - CUDA path picks first threshold where `gpu_memory_gb >= min_gpu`
  - CPU path uses lowest threshold entry
  - default fallback remains `(6, 4)`

## Thread Count and Params Assembly

- `resolve_thread_counts(config, cpu_cores)`:
  - config-driven mode (`use_cpu_cores_for_threads=true`):
    - `intra = cpu_cores`
    - `inter = clamp(cpu_cores // 2, min=config.inter_op_threads_min, max=config.inter_op_threads_max)`
  - default mode:
    - `intra = cpu_cores`
    - `inter = clamp(cpu_cores // 2, min=2, max=4)`
- `build_ocr_params_payload(...)`:
  - assembles full RapidOCR param payload
  - owns runtime fields:
    - `EngineConfig.onnxruntime.use_cuda`
    - `EngineConfig.onnxruntime.intra_op_num_threads`
    - `EngineConfig.onnxruntime.inter_op_num_threads`
    - `Rec.rec_batch_num`
    - `Cls.cls_batch_num`

## Service Integration Boundary

`OcrService._build_ocr_params(...)` remains compatibility surface while delegating:

1. hardware probes to runtime-config helpers
2. threshold normalization + batch selection to runtime-config helpers
3. thread-count and param payload assembly to runtime-config helpers

Service-level logging and CUDA/CPU fallback sequencing remain in `ocr_service.py`.

## Related Pages

- [Backend Screen-Grounding OCR Helpers Docs Hub](README.md)
- [OCR Service and Screenshot State-Machine Reference](../ocr_service_and_screenshot_state_machine_reference.md)
- [CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference](cuda_error_detection_screenshot_decode_and_ocr_field_normalization_helper_contract_reference.md)
