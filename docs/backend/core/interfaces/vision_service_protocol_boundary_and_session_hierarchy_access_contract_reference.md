---
summary: "Deep reference for `IVisionService` protocol boundary and vision service access helper: required model/is_initialized/error/initialize surface and session-hierarchy lookup fallback semantics."
read_when:
  - When changing `IVisionService` protocol fields/methods.
  - When changing vision service lookup from tool preparation via session hierarchy (`VisionServiceProvider`).
title: "Vision Service Protocol Boundary and Session Hierarchy Access Contract Reference"
---

# Vision Service Protocol Boundary and Session Hierarchy Access Contract Reference

## Canonical Modules

- `backend/src/core/interfaces/vision.py`
- `backend/src/services/vision/vision_service.py`
- `backend/src/agent/tools/preparation/helpers/vision_service_provider.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `tests/backend/test_vision_service.py`

## `IVisionService` Protocol Contract

`IVisionService` (typing Protocol) requires:

- attribute: `model_name`
- property: `model`
- property: `is_initialized`
- property: `initialization_error`
- async method: `initialize() -> bool`

This is a structural typing boundary used by preparation/resolver layers without hard coupling to concrete class.

## Concrete Alignment (`VisionService`)

`VisionService` satisfies the protocol surface:

- model-name normalization + provider selection (InternVL/Venus)
- lock-serialized async initialize path with success/failure state tracking
- readable `model`, `is_initialized`, and `initialization_error` properties

This makes it usable through protocol-typed call sites while retaining concrete internals in services layer.

## Session Hierarchy Access Helper Contract

`VisionServiceProvider.get_vision_service(session)` behavior:

- tries lookup path:
  - `session.executor.tool_orchestrator.context_factory.vision_service`
- returns service when available
- catches `AttributeError` and returns `None`
- emits debug log with exception context on lookup failure

Design purpose:

- decouple tool preparer from deep session object graph access details.

## Resolver Consumption Contract

Prediction resolver paths rely on protocol fields:

- check `vision_service` exists
- require `vision_service.is_initialized` before prediction inference
- call through service `model` for coordinate prediction runtime

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
2. Hard-failing session hierarchy lookup in helper instead of returning `None` can break non-vision tool flows.
3. Removing `initialize() -> bool` semantics from service breaks readiness checks in startup/runtime guards.

## Related Pages

- [Backend Core Interfaces Docs Hub](README.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](../../services/screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../tools/tool_preparation_and_coordinate_resolution_reference.md)
