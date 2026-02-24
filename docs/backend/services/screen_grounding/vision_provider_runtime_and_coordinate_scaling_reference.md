---
summary: "Deep reference for vision service/provider initialization fallback, inference serialization and runtime retries, plus coordinate extraction/scaling and resolver routing contracts."
read_when:
  - When changing vision model selection, initialization/unload behavior, or provider-specific inference fallback.
  - When debugging unparseable model coordinate output, scaling drift, or prediction-method routing failures.
title: "Vision Provider Runtime and Coordinate-Scaling Reference"
---

# Vision Provider Runtime and Coordinate-Scaling Reference

## Canonical Modules

- `backend/src/services/vision/vision_service.py`
- `backend/src/services/vision/providers/base.py`
- `backend/src/services/vision/providers/internvl.py`
- `backend/src/services/vision/providers/ui_venus.py`
- `backend/src/services/vision/coordinates.py`
- `backend/src/services/vision/utils.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `tests/backend/test_vision_service.py`
- `tests/backend/test_vision_utils.py`
- `tests/backend/test_vision_coordinates.py`
- `tests/backend/test_ocr_coordinate_resolver.py`

## VisionService Selection and Lifecycle

Model-name normalization:

- `normalize_model_name(...)` strips `huggingface-local/` prefix (case-insensitive) and falls back to default `OpenGVLab/InternVL3_5-4B`

Provider selection:

- model names starting with `inclusionai/ui-venus` (casefold) select `VenusVisionModel`
- all others select `InternVLModel`

Lifecycle contracts:

- `initialize()` is lock-serialized (`asyncio.Lock`) to avoid double initialization
- model construction runs in executor (`run_in_executor`) to avoid blocking event loop
- `unload_model()` clears model refs, resets state, forces GC, optionally empties CUDA cache

Test-backed behavior:

- dependency-unavailable path sets `initialization_error` and returns `False`
- provider selection by prefix and case-insensitive normalized names
- unload path clears initialized/error/model state and calls cleanup hooks

## Shared Provider Fallback Contract

`load_model_with_fallbacks(...)` in `providers/base.py` applies common sequence:

1. device-map loading attempt
2. direct load on preferred device (`cuda` when available)
3. CPU fallback load

Failure behavior:

- logs all intermediate errors
- raises wrapped runtime error when all paths fail

Inference safety:

- each provider inherits `_inference_lock` from `BaseVisionModel` to serialize inference calls and reduce GPU thrash/race overlap

## InternVL Provider Runtime

Model load specifics:

- checks FlashAttention availability
- uses shared `load_model_with_fallbacks(...)`
- handles meta-tensor init failures by retrying with `low_cpu_mem_usage=False`
- loads tokenizer with `trust_remote_code` and `use_fast=False`

Inference flow:

1. decode base64 image and preprocess into patches
2. cast to resolved model dtype/device
3. generate with chat path first
4. if chat fails, fallback to generate path
5. if CUDA kernel-image mismatch appears, runtime disables flash-attn flags and retries chat before generate fallback
6. parse model text for coordinates and scale normalized values to pixels

Failure diagnostics:

- logs timing, traceback, image dimensions, model device, and CUDA memory metrics when prediction fails

## Venus Provider Runtime

Model load specifics:

- uses `AutoModelForVision2Seq` + `AutoProcessor`
- shares base fallback sequence (`device_map -> direct -> CPU`)
- keeps tokenizer compatibility via `processor.tokenizer` when available

Inference flow:

1. decode base64 image
2. apply chat template with image + grounding prompt
3. run `generate(...)`
4. decode continuation text
5. parse point/bbox-center from text
6. scale coordinates with `scale_model_point_to_pixels(...)`

Scaling difference:

- Venus path supports mixed coordinate spaces (`0..1`, `0..1000`, or absolute pixel-like values) before clamping

## Coordinate Extraction and Scaling Contract

`coordinates.py` parsing rules:

- `extract_first_point(...)` returns first `[[x,y]]` match
- `extract_last_bbox(...)` returns last `[[x1,y1,x2,y2]]` match
- `extract_point_or_bbox_center(...)` prefers explicit point, else bbox center

Scaling rules:

- `scale_norm_to_pixels(...)` assumes 0..1000 normalized coordinates, floors and clamps to bounds
- `scale_model_point_to_pixels(...)`:
  - scales unit range [0,1] into [0,1000]
  - treats >1000 values as absolute pixel-like and clamps
  - otherwise delegates to normalized scaling

Test-backed behavior:

- signed/decimal coordinate parsing
- last-bbox precedence + explicit-point precedence
- bounds clamping and non-positive dimension guards

## Resolver Routing Contract

`CoordinateResolver.resolve(...)` dispatches by `find_coordinates_by`:

- `ocr`:
  - requires OCR results + `ocr_text`
  - uses fuzzy matching resolver
- `prediction`:
  - requires initialized vision service + description
  - delegates to provider prediction
- other values raise explicit unknown-method error

`OcrCoordinateResolver` ambiguity behavior:

- multiple fuzzy matches above threshold emit actionable error instructing manual coordinates
- error payload lists top matches with centers and scores, caps list length, and reports hidden-count suffix

Test-backed behavior:

- OCR and prediction routing success/failure branches
- missing input validation errors
- actionable ambiguous OCR error wording and manual fallback guidance

## Debug Sequence

If prediction method reports service unavailable:

1. inspect `VisionService.is_initialized` and `initialization_error`
2. confirm startup gating (`ToolPolicy.should_initialize_vision`) if dev selection is active
3. inspect provider dependencies (`transformers`, model class availability)

If coordinates parse but click lands in wrong place:

1. inspect raw model output pattern (`[[x,y]]` vs bbox)
2. verify scaling path used (`scale_norm_to_pixels` vs `scale_model_point_to_pixels`)
3. verify screenshot dimensions used for pixel conversion

If InternVL fails only on certain GPUs:

1. inspect kernel-image mismatch logs
2. verify runtime flash-attn disable retry path
3. inspect fallback progression to generate path and CPU/device fallback loads

## Related Pages

- [Backend Services Screen-Grounding Docs Hub](README.md)
- [OCR Service and Screenshot State-Machine Reference](ocr_service_and_screenshot_state_machine_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../tools/tool_preparation_and_coordinate_resolution_reference.md)
