---
summary: "Deep reference for shared vision provider load fallback sequencing, dtype/device selection, error logging shape, and defensive model-device resolution."
read_when:
  - When changing `load_model_with_fallbacks` or `resolve_model_device` in `backend/src/services/vision/providers/base.py`.
  - When debugging GPU model-load failures that unexpectedly fall through to CPU or misreport active device.
title: "Provider Loader Device-Map, Direct, CPU Fallback, and Dtype Contract Reference"
---

# Provider Loader Device-Map, Direct, CPU Fallback, and Dtype Contract Reference

## Canonical Modules

- `backend/src/services/vision/providers/base.py`
- `backend/src/services/vision/providers/internvl.py`
- `backend/src/services/vision/providers/ui_venus.py`
- `tests/backend/test_vision_provider_loader.py`

## Dependency Gate and Base Class Contract

`VISION_MODELS_AVAILABLE` is resolved at import time:

- true only if `torch` and `transformers` imports succeed
- false path logs warning and blocks provider construction (`BaseVisionModel.__init__` raises `ImportError`)

`BaseVisionModel` invariants:

- stores `model_name`, `device`, `trust_remote_code`
- creates `_inference_lock` for provider-level request serialization
- delegates actual model/tokenizer creation to subclass `_load()`

## Shared Loader State Machine

`load_model_with_fallbacks(...)` runs a fixed three-step sequence:

1. device-map load:
   - `load_device_map_model(device_map_dtype)`
   - returns `(model, device_map_dtype)` on success
2. direct preferred-device load:
   - device chosen by `torch_module.cuda.is_available()`
   - dtype:
     - CUDA => `torch_module.float16`
     - CPU => `torch_module.float32`
   - calls `load_direct_model(direct_dtype, device)`
3. direct CPU fallback:
   - always `load_direct_model(torch_module.float32, "cpu")`

Failure envelope:

- step-1 failure logs warning with `direct_retry_message`
- step-2 failure logs warning with `cpu_retry_message`
- step-3 failure logs one consolidated error (device_map/direct/cpu errors) and raises `RuntimeError(f"{failure_message}: {cpu_error}")`

## Dtype Selection Contract

Dtype outputs are explicit and returned with model:

- device-map path uses caller-provided `device_map_dtype`
- direct CUDA path uses fp16
- direct CPU path uses fp32

Operational implication:

- downstream tensor casts can trust `dtype_used` to match chosen load path

## Defensive Device Resolution

`resolve_model_device(model)` precedence:

1. `model.device` when present
2. first parameter device from `next(model.parameters())`
3. fallback `"cpu"`

This supports accelerate/sharded wrappers that omit `.device`.

## Test-Backed Matrix

`tests/backend/test_vision_provider_loader.py` covers:

- step-1 success short-circuits without direct path
- step-1 failure + step-2 success (CUDA direct)
- step-1+step-2 failure + step-3 CPU success
- all-step failure emits wrapped `RuntimeError` with provider-specific failure prefix
- device resolution from `.device`, first param device, and CPU fallback

## Drift Hotspots

1. Reordering fallback steps can shift model memory/runtime behavior in production GPUs.
2. Changing direct-path dtype selection can regress memory footprint or inference compatibility.
3. Removing consolidated final error log obscures which fallback stage failed.
4. Weakening `resolve_model_device` fallback can break diagnostics and tensor-device alignment.

## Related Pages

- [Backend Screen-Grounding Vision Docs Hub](README.md)
- [InternVL Chat/Generate Fallback and Runtime Flash-Attention Disable Reference](internvl_chat_generate_fallback_and_runtime_flash_attention_disable_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](../vision_provider_runtime_and_coordinate_scaling_reference.md)
