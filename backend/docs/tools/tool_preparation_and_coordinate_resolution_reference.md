---
summary: "Backend tool-preparation runtime reference for mouse coordinate resolution, execution refs, metadata contracts, and SDK/main local-runtime dispatch behavior for single and bundle tool calls."
read_when:
  - When changing `ToolPreparer` behavior, coordinate normalization, or tool-call metadata emitted for SDK/main local-runtime dispatch.
  - When debugging coordinate-resolution failures, stale-screen safety stops, or bundle preparation short-circuit behavior.
title: "Tool Preparation and Coordinate Resolution Reference"
---

# Tool Preparation and Coordinate Resolution Reference

## Canonical Modules

- `backend/src/agent/tools/preparation/preparer.py`
- `backend/src/agent/tools/preparation/helpers/preparation_helper.py`
- `backend/src/agent/tools/preparation/helpers/coordinate_resolution_helper.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `backend/src/agent/tools/preparation/ocr/coordinator.py`
- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/helpers/coordinate_contract.py`
- `backend/src/agent/tools/preparation/helpers/image_dimensions.py`
- `backend/src/agent/tools/preparation/types/execution_ref.py`
- `backend/src/agent/tools/preparation/types/resolved_tool_call.py`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`

## Preparation Stage Ownership

`ToolPreparer` is the resolver/orchestration layer before SDK/main local-runtime execution.

Responsibilities:

- assign stable execution identifiers (`request_id` for single, `bundle_id` for bundle)
- resolve OCR/prediction coordinates for grounded desktop tools (`mouse_control`, `scroll_control`) when needed
- normalize all grounding coordinates from screenshot space to desktop space
- rewrite resolved grounded tool calls to manual `x/y` parameters
- attach transparency/diagnostic metadata
- register resolved single-call payloads in session runtime for later stale-screen checks
- return `PreparationResult(resolved_calls=[], errors=[])` for empty parsed
  tool-call batches without assigning a bundle id or indexing the call list

Non-responsibilities:

- no frontend IPC dispatch
- no tool-result wait resolution

## ExecutionRef and Metadata Contract

`ExecutionRef` rules:

- single call -> metadata includes `request_id`
- bundle call -> metadata includes `bundle_id`

`ToolSender` and downstream wait paths rely on these metadata keys for correlation and future resolution.

## Coordinate Resolution Trigger Conditions

`tool_call_needs_coordinate_resolution(...)` is true only when:

- source grounding is supported and `find_coordinates_by` is `ocr` or `prediction`
- or drag-destination grounding is supported, `action` is `drag`, and
  `drag_to_find_coordinates_by` is `ocr` or `prediction`

`manual` mode bypasses backend OCR/vision resolution and screenshot-frame
normalization. Manual `x/y` and `drag_to_x/drag_to_y` values are treated as
local-runtime executable desktop coordinates and do not require an active
screenshot frame.

## Coordinate Resolution Pipeline

For a qualifying call:

1. ensure active screenshot exists (`ScreenshotManager.ensure_screenshot`)
2. fetch screenshot bytes + screenshot id from session
3. resolve source coordinates via shared helper when source grounding needs OCR/prediction
- OCR path -> `OcrCoordinator.get_ocr_results(...)` + fuzzy text matching
- prediction path -> vision service model inference
4. resolve drag-destination coordinates independently when destination grounding needs OCR/prediction
5. optional screenshot->display coordinate normalization
6. rewrite prepared source calls to manual `x/y` and drag destinations to manual `drag_to_x/drag_to_y`
7. persist metadata (`coordinate_method`, `coordinate_resolution_screenshot_id`, `coordinate_contract`, and drag-destination equivalents)

If no current image is available for OCR/prediction grounding, preparation
returns the tool error `No active grounding frame`.

For OCR candidate retries (`find_coordinates_by='ocr'` + `candidate_id`):

1. use current session frame id for candidate lookup/normalization
2. reject any caller-provided `screenshot_id`; preparation always uses the active frame
3. fail fast with `frame changed, re-ground required` when execution-time frame check detects drift
4. validate the selected candidate bbox before returning coordinates; candidates with missing or malformed bbox data produce a controlled re-grounding error instead of a raw key/indexing failure

Manual `x/y` calls do not enter the coordinate-resolution pipeline. Preparation
passes them through with execution metadata, strips backend-only grounding
fields during sanitization, and leaves local-runtime validation/execution as the
authority for the direct coordinate payload.

## Coordinate Normalization Contract

`CoordinateContract` converts screenshot-space coordinates into desktop-space coordinates using frame-local `capture_meta`.

Inputs:

- resolved coordinate pair in screenshot pixel space
- capture metadata from the same frame:
  - `source_w` / `source_h`
  - `crop_x` / `crop_y` / `crop_w` / `crop_h`
  - optional `desktop_virtual_bounds`, `monitor_id`, `timestamp`

Statuses include:

- `already_desktop_space`
- `missing_capture_meta`
- `invalid_source_dimensions`
- `invalid_crop_dimensions`
- `source_equals_crop`
- `scaled_to_desktop`
- `scaled_to_desktop_clamped`

Canonical transform:

- `desktop_x = crop_x + round(x * crop_w / source_w)`
- `desktop_y = crop_y + round(y * crop_h / source_h)`

Input `x/y` are clamped to `[0, source_w-1]` and `[0, source_h-1]` before mapping.

## Rewritten Call Shape

After successful resolution:

- `parameters.x` / `parameters.y` are concrete coordinates
- `find_coordinates_by` and backend-only `model_name` fields are removed
- model-generated targeting context (`ocr_text` / `source_description`) is preserved for transparency

Metadata additions:

- `coordinate_method`: original user/model intent (`manual|ocr|prediction`)
- `coordinate_resolution_screenshot_id` for OCR/prediction-prepared coordinates
- `coordinate_contract`: source coordinates, clamped source coordinates, source image size, capture crop, normalized desktop coordinates, normalization status

## Single vs Bundle Preparation Behavior

Single:

- one `request_id`
- resolved call registered in session via `register_resolved_tool_call(request_id, resolved_call)`
- failure returns preparation error for synthetic handling

Bundle:

- one `bundle_id` across all steps
- steps prepare sequentially
- first coordinate-resolution failure short-circuits remaining bundle preparation
- if the full bundle prepares without errors, each resolved step is stored in session runtime under `<bundle_id>:step:<1-based-index>`
- bundle steps intentionally do not receive `request_id`, preserving atomic bundle detection and `bundle_id` wait routing

## Local-Runtime Dispatch Behavior (`ToolSender`)

After preparation:

- successful single -> emits one `ToolCallEvent`
- successful bundle -> emits one `ToolBundleEvent` with prepared tool list

On preparation error:

- emits synthetic `ToolCallEvent` + `ToolOutputEvent` pair for failed single calls
- marks metadata `coordinate_resolution_failed` and `skip_local_execution`
- stores synthetic pending result so orchestration loop can proceed without a local-runtime round trip
- validation-backed failures include backend-generated guidance when the model-facing wrapper shape is wrong (for example missing top-level `system_use.explanation` or malformed `computer_use` metadata), so the synthetic tool output tells the model how to re-emit the call

Bundle preparation failure:

- stores one synthetic bundled failure result with per-step error/skipped outputs
- resolves bundle future immediately when waiting

## Stale-Screen Safety Guard (Execution Time)

`execute_single_tool(...)` verifies prepared screenshot identity before waiting:

- compares `coordinate_resolution_screenshot_id` in resolved metadata vs current session screenshot id
- mismatch returns immediate failure result (`frame changed, re-ground required`) to prevent dangerous clicks on changed UI

This guard is independent of renderer behavior and protects local automation safety.
Only OCR/prediction-prepared calls participate because preparation writes
`coordinate_resolution_screenshot_id` only for coordinates resolved against a
frame. Manual coordinates are direct local-runtime coordinates and are not
blocked by missing or changed screenshot state. Tool args must not provide
`screenshot_id`.

## Wait Path Coupling

Prepared metadata contracts are consumed later by wait paths:

- single: request-id future map in result storage
- bundle: bundle-id future map

If synthetic preparation failures already populated storage, waits complete immediately.

## Debug Checklist

If `mouse_control` executes wrong location:

1. inspect `coordinate_contract` metadata (source, crop, normalized coords, status)
2. verify click used the same `coordinate_resolution_screenshot_id` as current frame
3. verify local-runtime screenshot result included frame-local `capture_meta`

If OCR ambiguity retries are inconsistent:

1. verify retry used `candidate_id` from `ambiguity_payload_json` (not free-typed)
2. verify no stale frame change occurred between ambiguity response and retry

If OCR says text was not found:

1. inspect the top-3 fuzzy candidates listed in the no-match error
2. select one of those `candidate_id` values
3. retry with `find_coordinates_by='ocr'` and `candidate_id`

If prepared call never reaches the SDK/main local-runtime lane:

1. inspect preparation errors from `ToolSender`
2. check `coordinate_resolution_failed` metadata flags
3. verify synthetic result path was stored in session result storage

If execution fails with stale-screen error:

1. compare `coordinate_resolution_screenshot_id` and current screenshot id
2. verify screenshot changed between prepare and execute phases
3. re-run query/tool call to regenerate coordinates on current screen

## Cross-Doc References

- preparation screenshot/OCR state hub: `docs/backend/tools/preparation/README.md`
- screenshot + OCR task lifecycle deep dive: `docs/backend/tools/preparation/screenshot_manager_and_ocr_task_lifecycle_reference.md`
- resolved-call storage/session execution contract: `docs/backend/tools/preparation/resolved_tool_call_storage_and_session_access_contract_reference.md`
- OCR/vision runtime details: `docs/backend/services/ocr_and_vision_coordinate_runtime_reference.md`
- tool-result ingress and wait storage: `docs/backend/tools/tool_result_ingress_and_storage_reference.md`
