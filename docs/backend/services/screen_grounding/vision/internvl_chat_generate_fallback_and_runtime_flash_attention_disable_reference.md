---
summary: "Deep reference for InternVL runtime prediction path: chat-first generation, CUDA kernel-image retry with flash-attn disable, generate fallback wrapping, and failure diagnostics."
read_when:
  - When changing `_run_chat_with_fallbacks`, `_disable_flash_attention_runtime`, or `_run_generate_fallback_with_chat_error` in `internvl.py`.
  - When changing fallback/helper orchestration in `internvl_runtime_helpers.py`.
  - When debugging InternVL failures tied to CUDA kernel-image mismatch, flash-attn runtime flags, or dual chat/generate fallback failures.
title: "InternVL Chat/Generate Fallback and Runtime Flash-Attention Disable Reference"
---

# InternVL Chat/Generate Fallback and Runtime Flash-Attention Disable Reference

## Canonical Modules

- `backend/src/services/vision/providers/internvl.py`
- `backend/src/services/vision/providers/internvl_runtime_helpers.py`
- `backend/src/services/vision/providers/base.py`
- `backend/src/services/vision/coordinates.py`
- `tests/backend/test_vision_provider_loader.py`

## Runtime Prediction Skeleton

`predict_click_coordinates(...)`:

- acquires `_inference_lock`
- offloads blocking path to executor via `_predict_sync(...)`

`_predict_sync(...)` high-level sequence:

1. build safe log metadata:
   - bounded instruction preview (`50` chars max)
   - stable short hash (`sha256` first 8 chars)
2. decode image from base64 and open with PIL
3. build InternVL question using `<image>` + grounding prompt
4. preprocess image tiles to `pixel_values` and patch counts
5. cast tensors to resolved model dtype/device
6. run `_run_chat_with_fallbacks(...)`
7. parse first point or bbox-center and scale (`scale_norm_to_pixels`)

Failure path:

- catches all exceptions
- logs timing/device/image/CUDA diagnostics through `_log_failure_context(...)`
- returns `None` (non-raising API contract)

## Chat-First Fallback State Machine

`_run_chat_with_fallbacks(...)` flow:

1. attempt `_run_chat_generation(...)`
2. if chat throws and error matches CUDA kernel-image signature:
   - call `_disable_flash_attention_runtime()`
   - if any flags were disabled:
     - retry `_run_chat_generation(...)`
     - retry failure falls to generate fallback using retry error
3. all other chat failures:
   - directly call `_run_generate_fallback_with_chat_error(...)`

Implementation note:

- `internvl.py` keeps class methods as compatibility wrappers.
- runtime orchestration logic is single-sourced in `internvl_runtime_helpers.py`.

Helper error classifiers:

- `_is_cuda_kernel_image_error(...)` detects:
  - `"no kernel image is available for execution on the device"`
  - `"cudaErrorNoKernelImageForDevice"`

## Flash-Attention Runtime Disable Contract

`_disable_flash_attention_runtime()` mutates all discovered switches:

- `model.config.use_flash_attn` (if present)
- `model.config.vision_config.use_flash_attn` (if present)
- every module returned by `self.model.modules()` with `use_flash_attn=True`

Return value:

- `True` only if at least one flag changed
- `False` means no retry-via-flash-disable branch should run

## Generate Fallback Wrapper Contract

`_run_generate_fallback_with_chat_error(...)`:

- attempts `_run_generate_fallback(...)`
- if generate also fails:
  - logs both chat and generate errors
  - raises wrapped `RuntimeError("Vision model inference failed on CUDA: ...")`
  - chains from original chat error (`from chat_error`)

Operational implication:

- callers observe one normalized runtime error for dual-failure, not two independent exceptions

## Test-Backed Matrix

`tests/backend/test_vision_provider_loader.py` covers:

- meta-tensor load retry in `_load_model(...)` (`low_cpu_mem_usage=True -> False`)
- non-meta load errors do not retry
- flash-attn runtime disable flips config/module flags
- `_run_generate_fallback_with_chat_error` success and dual-failure wrapping
- `_run_chat_with_fallbacks` branches:
  - direct chat success
  - kernel-image retry success after disable
  - non-kernel chat error -> generate fallback
  - kernel-image retry failure -> generate fallback with retry error

## Drift Hotspots

1. Changing kernel-image match strings can silently skip intended flash-disable retry.
2. Returning `False` incorrectly from `_disable_flash_attention_runtime` can bypass viable chat retry.
3. Removing error chaining in dual-failure wrapper reduces root-cause debuggability.
4. Altering `_predict_sync` to raise instead of returning `None` changes upstream resolver/runtime expectations.

## Related Pages

- [Backend Screen-Grounding Vision Docs Hub](README.md)
- [Provider Loader Device-Map, Direct, CPU Fallback, and Dtype Contract Reference](provider_loader_device_map_direct_cpu_fallback_and_dtype_contract_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](../vision_provider_runtime_and_coordinate_scaling_reference.md)
