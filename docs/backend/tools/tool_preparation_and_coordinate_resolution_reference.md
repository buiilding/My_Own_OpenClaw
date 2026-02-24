---
summary: "Backend tool-preparation runtime reference for mouse coordinate resolution, execution refs, metadata contracts, and frontend dispatch behavior for single and bundle tool calls."
read_when:
  - When changing `ToolPreparer` behavior, coordinate normalization, or tool-call metadata emitted to frontend.
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

`ToolPreparer` is the resolver/orchestration layer before frontend execution.

Responsibilities:

- assign stable execution identifiers (`request_id` for single, `bundle_id` for bundle)
- resolve OCR/prediction coordinates for `mouse_control` when needed
- rewrite resolved mouse calls to manual `x/y` parameters
- attach transparency/diagnostic metadata
- register resolved single-call payloads in session runtime for later stale-screen checks

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

- tool name is `mouse_control`
- `find_coordinates_by` is `ocr` or `prediction`

`manual` mode bypasses resolution and keeps original coordinates.

## Coordinate Resolution Pipeline

For a qualifying call:

1. ensure active screenshot exists (`ScreenshotManager.ensure_screenshot`)
2. fetch screenshot bytes + screenshot id from session
3. resolve coordinates via shared helper:
- OCR path -> `OcrCoordinator.get_ocr_results(...)` + fuzzy text matching
- prediction path -> vision service model inference
4. optional screenshot->display coordinate normalization
5. rewrite prepared call to manual `x/y`
6. persist metadata (`coordinate_method`, `coordinate_resolution_screenshot_id`, `coordinate_contract`)

## Coordinate Normalization Contract

`CoordinateContract` converts screenshot-space coordinates into display-space coordinates.

Inputs:

- resolved coordinate pair in screenshot pixel space
- source screenshot dimensions
- target display resolution from runtime system state

Statuses include:

- `scaled_to_display`
- `source_equals_target`
- `missing_source_image_size`
- `missing_target_display_size`
- `invalid_dimensions`
- `already_display_space`

Platform rule:

- normalization is disabled on Linux (`disabled_on_linux` metadata status) to avoid known mismatch behavior.

## Rewritten Call Shape

After successful resolution:

- `parameters.x` / `parameters.y` are concrete coordinates
- `find_coordinates_by` and backend-only `model_name` fields are removed
- model-generated targeting context (`ocr_text` / `description`) is preserved for transparency

Metadata additions:

- `coordinate_method`: original user/model intent (`manual|ocr|prediction`)
- `coordinate_resolution_screenshot_id`
- `coordinate_contract`: source/target sizes, normalization status, normalized coordinates

## Single vs Bundle Preparation Behavior

Single:

- one `request_id`
- resolved call registered in session via `register_resolved_tool_call(request_id, resolved_call)`
- failure returns preparation error for synthetic handling

Bundle:

- one `bundle_id` across all steps
- steps prepare sequentially
- first coordinate-resolution failure short-circuits remaining bundle preparation

## Frontend Dispatch Behavior (`ToolSender`)

After preparation:

- successful single -> emits one `ToolCallEvent`
- successful bundle -> emits one `ToolBundleEvent` with prepared tool list

On preparation error:

- emits synthetic `ToolCallEvent` + `ToolOutputEvent` pair for failed single calls
- marks metadata `coordinate_resolution_failed` and `skip_frontend_execution`
- stores synthetic pending result so orchestration loop can proceed without frontend round-trip

Bundle preparation failure:

- stores one synthetic bundled failure result with per-step error/skipped outputs
- resolves bundle future immediately when waiting

## Stale-Screen Safety Guard (Execution Time)

`execute_single_tool(...)` verifies prepared screenshot identity before waiting:

- compares `coordinate_resolution_screenshot_id` in resolved metadata vs current session screenshot id
- mismatch returns immediate failure result (`Screen changed before tool execution`) to prevent dangerous clicks on changed UI

This guard is independent of frontend behavior and protects local automation safety.

## Wait Path Coupling

Prepared metadata contracts are consumed later by wait paths:

- single: request-id future map in result storage
- bundle: bundle-id future map

If synthetic preparation failures already populated storage, waits complete immediately.

## Debug Checklist

If `mouse_control` executes wrong location:

1. inspect `coordinate_contract` metadata (source/target sizes + normalization status)
2. verify runtime `screen_resolution` exists in system state
3. verify normalization disabled/enabled status for current OS

If prepared call never reaches frontend:

1. inspect preparation errors from `ToolSender`
2. check `coordinate_resolution_failed` metadata flags
3. verify synthetic result path was stored in session result storage

If execution fails with stale-screen error:

1. compare `coordinate_resolution_screenshot_id` and current screenshot id
2. verify screenshot changed between prepare and execute phases
3. re-run query/tool call to regenerate coordinates on current screen

## Cross-Doc References

- OCR/vision runtime details: `docs/backend/services/ocr_and_vision_coordinate_runtime_reference.md`
- tool-result ingress and wait storage: `docs/backend/tools/tool_result_ingress_and_storage_reference.md`
