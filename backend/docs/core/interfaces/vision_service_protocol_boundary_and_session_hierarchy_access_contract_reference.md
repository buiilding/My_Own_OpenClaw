---
summary: "Deep reference for the vision provider protocol boundary and session-hierarchy lookup helper: required provider/model identity, readiness + prediction/description methods, and router-based access semantics."
read_when:
  - When changing vision provider protocol fields/methods.
  - When changing vision router/provider lookup from tool preparation via session hierarchy (`VisionServiceProvider`).
title: "Vision Service Protocol Boundary and Session Hierarchy Access Contract Reference"
---

# Vision Service Protocol Boundary and Session Hierarchy Access Contract Reference

## Canonical Modules

- `backend/src/core/interfaces/vision.py`
- `backend/src/core/inference/vision_router.py`
- `backend/src/services/vision/vision_service.py`
- `backend/src/services/vision/provider.py`
- `backend/src/agent/tools/preparation/helpers/vision_service_provider.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `tests/backend/test_vision_service.py`
- `tests/backend/test_inference_routers.py`

## `IVisionProvider` Protocol Contract

`IVisionProvider` is the first-class typing Protocol for vision inference providers and requires:

- attribute: `provider_id`
- attribute: `model_id`
- attribute: `model_name`
- property: `is_initialized`
- property: `initialization_error`
- async method: `initialize() -> bool`
- async method: `predict_coordinates(image_base64, description) -> tuple[int, int] | None`
- async method: `answer_question_about_image(image_base64, prompt) -> str | None`

This is a structural typing boundary used by preparation/resolver layers without hard coupling to a concrete in-process vision host.

## Concrete Alignment (`VisionService` + `LocalVisionProvider`)

`VisionService` still owns local model lifecycle:

- model-name normalization + provider selection (InternVL/Venus)
- lock-serialized async initialize path with success/failure state tracking
- readable `model`, `is_initialized`, and `initialization_error` properties for the local host
- local model-specific inference methods remain internal to the provider adapter

`LocalVisionProvider` wraps that service behind the provider contract, and `VisionRouter` becomes the orchestration-facing boundary exposed by the container.

## Session Hierarchy Access Helper Contract

`VisionServiceProvider.get_vision_service(session)` behavior:

- tries lookup path:
  - `session.executor.tool_orchestrator.context_factory.vision_router`
  - falls back to `...vision_service`
- returns service when available
- catches `AttributeError` and returns `None`
- emits debug log with exception context on lookup failure

Design purpose:

- decouple tool preparer from deep session object graph access details.

## Resolver Consumption Contract

Prediction resolver paths rely on protocol fields:

- check `vision_service` exists
- require `vision_service.is_initialized` before prediction inference
- call `vision_service.predict_coordinates(...)` for grounding
- call `vision_service.answer_question_about_image(...)` for SDK descriptive prompts

Contract outcome:

- missing/uninitialized service fails gracefully with explicit error paths.

## Test-Backed Matrix

`tests/backend/test_vision_service.py` verifies concrete service behavior aligned with protocol expectations:

- initialize false path when dependencies unavailable
- initialize success/failure state transitions
- `is_initialized`, `model`, and `initialization_error` state correctness
- unload-model state reset behavior

Coverage note:

- `VisionServiceProvider.get_vision_service` does not currently have dedicated unit tests; behavior is simple and path-based.

## Drift Hotspots

1. Changing protocol field names can silently break structural compatibility with existing resolvers/helpers.
2. Returning the raw concrete service or raw model object to orchestration code instead of the router/provider boundary reintroduces singleton coupling.
3. Hard-failing session hierarchy lookup in helper instead of returning `None` can break non-vision tool flows.
4. Removing `initialize() -> bool` semantics or provider-level prediction methods breaks readiness and inference checks in startup/runtime guards.

## Related Pages

- [Backend Core Interfaces Docs Hub](README.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](../../services/screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../tools/tool_preparation_and_coordinate_resolution_reference.md)
