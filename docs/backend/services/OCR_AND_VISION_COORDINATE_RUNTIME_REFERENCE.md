---
summary: "Backend OCR and vision coordinate runtime reference: startup gating, screenshot-triggered OCR lifecycle, coordinate resolver behavior, and vision provider fallback logic."
read_when:
  - When changing `mouse_control` OCR/prediction coordinate behavior or screenshot-to-coordinate preparation flow.
  - When debugging OCR timeouts, stale OCR results, or vision model initialization/inference fallback issues.
title: "OCR and Vision Coordinate Runtime Reference"
---

# OCR and Vision Coordinate Runtime Reference

## Canonical Modules

- `backend/src/core/container/initializer.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/services/ocr/ocr_service.py`
- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/ocr/coordinator.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `backend/src/services/vision/vision_service.py`
- `backend/src/services/vision/providers/base.py`
- `backend/src/services/vision/providers/internvl.py`
- `backend/src/services/vision/providers/ui_venus.py`
- `backend/src/services/vision/coordinates.py`
- `backend/src/services/vision/utils.py`

## Startup Initialization and Policy Gates

`ContainerInitializer.initialize()` handles cold-start preload for OCR/vision.

Gating source:

- `ToolPolicy.should_initialize_ocr()`
- `ToolPolicy.should_initialize_vision()`

Policy implication:

- if dev tool selection disables OCR method for `mouse_control`, startup OCR init is skipped and OCR service is explicitly disabled
- if dev tool selection disables prediction method, startup vision model preload is skipped

This keeps optional heavy services off when coordinate methods are intentionally disabled.

## OCR Service Runtime (`OcrService`)

Initialization strategy:

1. try CUDA RapidOCR engine
2. on CUDA-class failure, fallback to CPU engine
3. if both fail, service remains unavailable

Runtime behavior:

- OCR execution runs off event loop (`asyncio.to_thread`)
- hardware-aware batch/thread params are derived from OCR config + detected GPU memory/CPU cores
- CUDA runtime failures during analysis trigger one-time CPU engine reload + retry

Output normalization:

- raw OCR engine output is normalized into records:
- `id`
- `text`
- `confidence`
- `bbox` (`x`, `y`, `width`, `height`)

## Screenshot-Triggered OCR Lifecycle

`ScreenshotManager.process_screenshot(...)` is the single screenshot ingest path used by query and tool-result flows.

On each new screenshot:

1. screenshot is stored as current in session state
2. stale OCR task is cancelled
3. background proactive OCR task is scheduled
4. OCR completion event is cleared then set on completion/failure
5. OCR results are committed only if screenshot ID still matches current screenshot

Race guard:

- outdated OCR task completions are ignored when screenshot has already changed

## On-Demand OCR Coordination (`OcrCoordinator`)

When a tool needs OCR coordinates:

1. attempt to await active OCR task for requested screenshot (bounded wait, shielded from cancellation)
2. reuse cached OCR results if screenshot IDs still match
3. fallback to direct OCR execution if proactive result unavailable/timed out/stale

Failure modes surfaced as `ValueError`:

- OCR service unavailable/disabled
- OCR produced no usable results
- screenshot mismatch requiring rerun without successful output

## Coordinate Method Routing

`CoordinateResolver` dispatches by `find_coordinates_by`:

- `manual`: coordinates already supplied (outside resolver)
- `ocr`: fuzzy OCR text match
- `prediction`: vision model grounding

### OCR method specifics

`OcrCoordinateResolver.resolve(...)`:

- fuzzy match via `difflib.SequenceMatcher` (default threshold `0.8`)
- returns bbox center for single qualifying match
- throws actionable ambiguity error when multiple matches exceed threshold
- ambiguity error suggests explicit manual coordinates for disambiguation

### Prediction method specifics

`VisionCoordinateResolver.resolve(...)`:

- requires initialized vision service + screenshot + description
- delegates to model `predict_click_coordinates(...)`
- raises explicit error if service unavailable or model fails to identify target

## Vision Service Runtime (`VisionService`)

Provider selection:

- model name normalized (`huggingface-local/` prefix stripped)
- `inclusionai/ui-venus...` -> `VenusVisionModel`
- otherwise -> `InternVLModel`

Initialization:

- thread-safe serialized via async lock
- startup preload attempts model construction for fast first prediction
- initialization failure is stored in service state (`initialization_error`)

Unload:

- `unload_model()` clears model ref, runs GC, empties CUDA cache when available

## Provider Fallback and Coordinate Extraction

Shared provider base:

- `load_model_with_fallbacks`: `device_map` load -> direct load -> CPU fallback
- inference serialized per-model with `_inference_lock`

InternVL path:

- image tile preprocessing + grounding chat prompt
- response parsed for `[[x,y]]` or `[[x1,y1,x2,y2]]`
- normalized coordinates scaled to pixels (`scale_norm_to_pixels`)
- runtime fallback attempts include chat->generate path and flash-attention disable retry for CUDA kernel-image mismatch

UI-Venus path:

- Qwen2.5-VL style processor + generate flow
- decoded output parsed with same coordinate extraction helpers
- coordinate scaling supports unit-normalized, 0-1000 normalized, or absolute pixel-like outputs (`scale_model_point_to_pixels`)

## Debug Checklist

If OCR coordinates are stale/wrong:

1. verify screenshot ID continuity across screenshot manager and OCR coordinator
2. verify stale OCR task cancellation is happening on new screenshot
3. inspect OCR timeout logs (proactive wait fallback path)

If OCR service never starts:

1. check dev tool selection policy (`should_initialize_ocr`)
2. verify RapidOCR dependency availability
3. inspect CUDA init fallback logs

If prediction method fails but OCR works:

1. verify prediction method allowed by tool policy (`should_initialize_vision`)
2. verify vision service initialization status/error
3. inspect raw model response logs for unparseable coordinate format

## Cross-Doc References

- screenshot ingest + session propagation: `docs/backend/services/ARTIFACT_SCREENSHOT_AND_SYSTEM_STATE_FLOW_REFERENCE.md`
- tool-result wait/storage lifecycle: `docs/backend/tools/TOOL_RESULT_INGRESS_AND_STORAGE_REFERENCE.md`
