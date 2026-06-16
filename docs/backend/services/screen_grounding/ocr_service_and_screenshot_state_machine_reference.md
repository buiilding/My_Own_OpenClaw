---
summary: "Deep reference for OCR startup gating, screenshot/OCR task state machine, proactive OCR race guards, and OCR engine CUDA->CPU fallback plus result normalization behavior."
read_when:
  - When changing OCR startup initialization policy, screenshot processing, or OCR task lifecycle.
  - When debugging stale OCR results, OCR timeout/fallback behavior, or missing OCR output for coordinate resolution.
title: "OCR Service and Screenshot State-Machine Reference"
---

# OCR Service and Screenshot State-Machine Reference

## Canonical Modules

- `backend/src/core/container/initializer.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/services/ocr/ocr_service.py`
- `backend/src/services/ocr/helpers.py`
- `backend/src/agent/tools/preparation/screenshot/state.py`
- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/ocr/coordinator.py`
- `tests/backend/test_container_initializer_dev_selection.py`
- `tests/backend/test_screenshot_manager.py`
- `tests/backend/test_screenshot_state.py`
- `tests/backend/test_ocr_service.py`

## Startup Gating and Service Enablement

`ContainerInitializer` runs the `ocr_router` startup step against the configured
OCR provider through `OcrRouter`, not the concrete OCR model directly.
For `ocr_backend="local"`, the router delegates to the RapidOCR adapter. For
`ocr_backend="remote-http"`, it probes the remote service health endpoint. For
`ocr_backend="disabled"` or missing remote URL, no OCR provider is exposed.

Startup path:

1. resolves policy via `ToolPolicy.should_initialize_ocr()`
2. if disabled:
   - sets `ocr_service.enabled = False` when field exists
   - skips startup engine initialization
3. if enabled:
   - runs `ocr_service.initialize()` through the router/provider boundary
   - logs whether the engine is ready, still enabled-but-not-ready, or disabled

Policy source:

- `ToolPolicy.should_initialize_ocr()` returns true only when agent capability policy allows the `mouse_control` OCR method

Test-backed behavior:

- startup skip disables service and avoids `initialize(...)` call
- startup enable path invokes initialization exactly once

## Session Screenshot/OCR State Machine

`ScreenshotState` owns per-session screenshot/OCR state:

- current screenshot data + screenshot ID
- current OCR results (for current screenshot only)
- active OCR task + originating screenshot ID

State transition contracts:

1. `set_current_screenshot(...)` replaces current screenshot and clears old OCR results
2. `set_active_ocr_task(task, screenshot_id)` tracks in-flight OCR task
3. `clear_active_ocr_task(task?)` clears only when task matches (or unconditional when omitted)
4. `cancel_active_ocr_task()` cancels running task, clears task tracking, returns bool
5. `clear()` cancels active task and clears screenshot/OCR fields

Test-backed behavior:

- task retrieval supports screenshot-ID matching guard
- non-matching task clear does not erase active task
- clear/reset behavior is idempotent when no active task remains

## ScreenshotManager Processing Flow

`ScreenshotManager.process_screenshot(session, screenshot_data, request_id)`:

1. generates screenshot ID via SHA256 hash of first 1024 chars (first 16 hex chars retained)
2. stores screenshot as the only current screenshot
3. triggers `_maybe_trigger_ocr(...)`

`_maybe_trigger_ocr(...)` behavior:

- if OCR disabled/unavailable:
  - sets `ocr_completion_event`
  - cancels any stale active OCR task
  - returns without creating new task
- if OCR enabled:
  - cancels stale OCR task
  - clears `ocr_completion_event` synchronously before returning from scheduling
  - schedules background task
  - sets completion event in `finally` only when the finishing task is still
    the active task for that screenshot ID
  - stores OCR results only when screenshot ID still matches current screenshot ID

Race guard:

- outdated OCR completion is ignored when a newer screenshot replaced the current screenshot
- canceled or stale OCR tasks cannot signal readiness for a newer screenshot
  through the shared completion event

Test-backed behavior:

- disabled OCR path does not schedule task and keeps completion event set
- new screenshot supersedes old results when first OCR completes late
- completion event remains unset until the active OCR task for the current
  screenshot finishes

## OcrCoordinator Wait/Fallback Behavior

`OcrCoordinator.get_ocr_results(...)` coordination order:

1. resolves target screenshot ID (argument or current session screenshot ID)
2. fetches active OCR task for that screenshot ID
3. waits up to 5.0s with `asyncio.wait_for(asyncio.shield(task), timeout=5.0)`
4. if timed out or the proactive task fails, falls back to on-demand OCR execution
5. rejects cached OCR reuse when screenshot ID changed
6. executes `ocr_router.perform_ocr(...)` when cache is absent/stale
7. stores fresh OCR results back into session current OCR slot

Failure semantics:

- raises `ValueError` when OCR service unavailable/disabled
- raises `ValueError` when OCR returns no usable results
- provider router failures include `provider_error_json={...}` in the error text
  so synthetic tool output can return structured provider details to the model
- repeated provider failures open the OCR router circuit breaker; while open,
  provider health hides the OCR capability before prompt construction

Coverage note:

- `OcrCoordinator` direct behavior is covered by `tests/backend/test_ocr_coordinator.py`

## OcrService Engine Lifecycle and Fallbacks

`OcrService.initialize(...)`:

1. exits disabled if RapidOCR import unavailable
2. no-op when engine already exists
3. attempts CUDA engine creation first
4. on CUDA-class init failure (`is_cuda_error`) retries CPU engine
5. leaves engine unset on non-recoverable dual failure

`perform_ocr(...)` offloads sync OCR work with `asyncio.to_thread(...)`.

Synchronous runtime flow (`_perform_ocr_sync`):

1. ensures engine exists (lazy init under lock if needed)
2. decodes screenshot payload
3. runs OCR engine
4. maps raw OCR outputs into normalized records

Runtime CUDA fallback:

- `_run_ocr_engine(...)` retries once with CPU reloaded engine when CUDA runtime error is detected during inference

Normalization details:

- `_parse_bbox(...)` converts OCR polygon points to axis-aligned min/max box
- raw text, score, and box rows are processed by original index; an invalid box
  skips only that row so later valid boxes stay attached to their matching text
- `_build_ocr_record(...)` emits:
  - `id` string
  - normalized `text`
  - `confidence` (default 0.9 when missing)
  - `bbox` with `x/y/width/height`

RapidOCR parameter policy:

- WindieOS uses an explicit quality-first RapidOCR profile instead of bare library defaults.
- Detection and recognition are pinned to ONNX Runtime `PP-OCRv5` `server` models with RapidOCR `LangDet.CH` / `LangRec.CH` enum values (string fallback only when the installed RapidOCR build does not expose those enums).
- Engine creation still toggles `EngineConfig.onnxruntime.use_cuda` so OCR prefers CUDA first and falls back to CPU by recreating the same quality-first profile with `use_cuda=false`.

Test-backed behavior:

- base64/data-url decode rules and invalid payload rejection
- engine params pin the quality-first ONNX Runtime PP-OCRv5 server profile
- CUDA runtime error retry path and non-CUDA error propagation
- invalid OCR rows are skipped while valid rows remain in output

## Debug Sequence

If OCR never initializes:

1. inspect agent capability policy (`should_initialize_ocr`)
2. inspect RapidOCR import/dependency availability
3. inspect container initializer logs for service disablement

If OCR results look stale:

1. confirm current screenshot ID at tool-preparation time
2. confirm stale active OCR task cancellation on new screenshot
3. confirm results were written only when screenshot IDs matched

If OCR waits block too long:

1. inspect active OCR task association for screenshot ID
2. verify 5s wait timeout fallback is reached
3. inspect service enabled flag and on-demand OCR fallback path

## Related Pages

- [Backend Services Screen-Grounding Docs Hub](README.md)
- [Screen-Grounding OCR Helpers Docs Hub](ocr/README.md)
- [CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference](ocr/cuda_error_detection_screenshot_decode_and_ocr_field_normalization_helper_contract_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](vision_provider_runtime_and_coordinate_scaling_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../tools/tool_preparation_and_coordinate_resolution_reference.md)
