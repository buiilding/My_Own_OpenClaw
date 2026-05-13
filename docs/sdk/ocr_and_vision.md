---
summary: "SDK OCR and vision guide covering OCR run/inspect/find/resolve, vision locate/describe, overlays, and artifact-backed image sources."
read_when:
  - When changing SDK OCR or vision routes.
  - When debugging coordinate grounding or perception output outside the desktop UI.
title: "OCR and Vision SDK"
---

# OCR and Vision SDK

SDK OCR and vision routes expose backend-owned perception capabilities for developer tooling. They should not require a local Electron app or sidecar process.

## Route Families

`backend/src/api/routes/sdk/router.py` exposes:

- OCR run
- OCR inspect
- OCR find text
- OCR find text candidates
- OCR resolve text
- OCR resolve candidate
- OCR overlays
- Vision locate
- Vision locate all
- Vision describe
- Vision overlays

## Image Sources

SDK routes can resolve image input through backend helpers, including artifact-backed sources. Preserve artifact identity when the image came from a screenshot or upload.

## Owner Modules

- SDK route models: `backend/src/api/routes/sdk/models.py`
- SDK services: `backend/src/api/routes/sdk/service.py`
- OCR coordinate resolver: `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- OCR/vision services: `backend/src/services/screen_grounding/*`

## Validation

Add backend route/service tests for:

- empty or invalid image source
- OCR threshold behavior
- overlay generation
- coordinate resolution failures
- vision provider unavailable/failure paths
