---
summary: "Backend OCR/vision coordinate runtime overview with links to focused screen-grounding deep references."
read_when:
  - When changing backend screen-grounding behavior and deciding between OCR-state or vision-provider deep docs.
  - When tracing coordinate preparation failures across OCR lifecycle, model inference, and scaling/parser boundaries.
title: "OCR and Vision Coordinate Runtime Overview"
---

# OCR and Vision Coordinate Runtime Overview

## Scope

This page is the entrypoint for backend OCR and vision coordinate behavior. Detailed runtime docs now live in the `screen_grounding/` subfolder.

## Screen-Grounding Docs (Detailed)

- [Backend Services Screen-Grounding Docs Hub](screen_grounding/README.md)
- [OCR Service and Screenshot State-Machine Reference](screen_grounding/ocr_service_and_screenshot_state_machine_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)

## Condensed Runtime Boundary

The OCR/vision coordinate pipeline covers:

1. startup policy-gated service initialization
2. per-session screenshot + OCR task state tracking
3. proactive OCR scheduling and stale-result guards
4. coordinate resolver routing (`ocr` vs `prediction`)
5. vision provider model loading and inference fallback
6. coordinate parsing/scaling from model output to pixel click targets

## Canonical Modules

- `backend/src/core/container/initializer.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/services/ocr/ocr_service.py`
- `backend/src/agent/tools/preparation/screenshot/state.py`
- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/ocr/coordinator.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `backend/src/services/vision/vision_service.py`
- `backend/src/services/vision/providers/base.py`
- `backend/src/services/vision/providers/internvl.py`
- `backend/src/services/vision/providers/ui_venus.py`
- `backend/src/services/vision/coordinates.py`
- `backend/src/services/vision/utils.py`

## Related Pages

- [Tool Preparation and Coordinate Resolution Reference](../tools/tool_preparation_and_coordinate_resolution_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](artifact_screenshot_and_system_state_flow_reference.md)

## Legacy Note

Earlier revisions kept OCR + vision runtime detail in this single page. The content now lives in `services/screen_grounding/` so OCR-state behavior and vision-provider behavior can evolve independently without a monolithic reference.
