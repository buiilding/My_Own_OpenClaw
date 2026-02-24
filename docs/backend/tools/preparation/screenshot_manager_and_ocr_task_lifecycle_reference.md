---
summary: "Deep reference for screenshot preparation runtime: current-screenshot ownership, proactive OCR task replacement, completion-event semantics, outdated-result suppression, and tool-result screenshot ingestion path."
read_when:
  - When changing screenshot state updates or OCR task scheduling in preparation/result-ingress flows.
  - When debugging blocked OCR waits, outdated OCR result races, or screenshot-id mismatches across tool turns.
title: "Screenshot Manager and OCR Task Lifecycle Reference"
---

# Screenshot Manager and OCR Task Lifecycle Reference

## Canonical Modules

- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/screenshot/state.py`
- `backend/src/agent/tools/preparation/screenshot/processor.py`
- `backend/src/agent/session/session.py`
- `backend/src/agent/tools/waiting/router.py`
- `tests/backend/test_screenshot_manager.py`
- `tests/backend/test_screenshot_state.py`

## Single-Current-Screenshot Model

`ScreenshotState` intentionally stores only one active screenshot:

- `_current_screenshot`
- `_current_screenshot_id`
- `_current_ocr_results`

Setting a new screenshot (`set_current_screenshot`) clears prior OCR results immediately.

Design intent:

- desktop actions target current UI state only
- historical screenshots are treated as obsolete for coordinate resolution

## Screenshot Availability Gate

`ScreenshotManager.ensure_screenshot(session)` requires both:

- non-empty `current_screenshot_id`
- non-empty screenshot data

Otherwise it raises `ValueError("No active screenshot available for coordinate resolution")`.

## Screenshot Processing Entry Point

`process_screenshot(session, screenshot_data, request_id)`:

1. derive deterministic 16-char id from SHA256 of first 1KB sample
2. set screenshot as current via `session.set_current_screenshot(...)`
3. trigger `_maybe_trigger_ocr(...)`
4. return screenshot id

The same entry point is reused for:

- query/user screenshot preparation paths
- tool-result screenshot ingestion via `ScreenshotProcessor.process_from_result(...)`

## OCR Task Scheduling and Replacement

`_maybe_trigger_ocr(...)` behavior:

- if OCR service missing/disabled:
- set `ocr_completion_event` to unblock waiters
- cancel stale active OCR task
- return

- if OCR enabled:
- clear `ocr_completion_event`
- cancel previously tracked OCR task
- create background OCR task
- track task + source screenshot id via session setters

Background task finalization always:

- sets `ocr_completion_event` (success or failure)
- clears active OCR task only when current task matches tracked task

## Outdated OCR Result Suppression

After OCR completes, manager commits OCR results only if:

- `session.get_current_screenshot_id() == screenshot_id` captured at task start

If screenshot changed mid-run, OCR output is ignored.

This prevents stale OCR text from polluting new-screen coordinate resolution.

## Active OCR Task Controls (`ScreenshotState`)

- `set_active_ocr_task(task, screenshot_id)`
- `get_active_ocr_task(optional_screenshot_id_filter)`
- `clear_active_ocr_task(optional_task_match)`
- `cancel_active_ocr_task()` returns bool and is idempotent
- `clear()` cancels active task then resets all screenshot/OCR fields

These controls are session-accessible via `AgentSession` wrapper methods.

## Tool-Result Ingress Coupling

`ToolResultRouter` calls `ScreenshotProcessor.process_from_result(...)` when `screenshot` or decoded `screenshot_ref` is present.

Processor delegates to screenshot manager and returns screenshot id or `None` on failure.

Effect:

- post-tool screenshots become new active screenshot baseline
- proactive OCR refresh can start before next coordinate-resolution step

## Test-Backed Invariants

`tests/backend/test_screenshot_manager.py` verifies:

- ensure_screenshot failure/success gates
- disabled OCR path sets completion event and skips task creation
- screenshot id determinism and storage updates
- OCR results persist for current screenshot
- outdated OCR results are ignored when newer screenshot replaces prior one

`tests/backend/test_screenshot_state.py` verifies:

- default empty fields
- OCR result reset on screenshot replacement
- active-task matching and selective clear semantics
- cancel + clear idempotency and task cancellation behavior

## Drift Hotspots

1. storing multiple screenshots without explicit selection rules can reintroduce stale-coordinate behavior.
2. failing to set `ocr_completion_event` on OCR exceptions can deadlock OCR-dependent preparation paths.
3. skipping screenshot-id equality check before writing OCR results can overwrite fresh OCR with stale task output.
4. bypassing manager entry point for tool-result screenshots can desynchronize active screenshot and OCR state.

## Related Pages

- [Backend Tools Preparation Docs Hub](README.md)
- [Resolved Tool-Call Storage and Session Access Contract Reference](resolved_tool_call_storage_and_session_access_contract_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](../waiting/tool_result_receiver_and_router_shared_route_mode_reference.md)
