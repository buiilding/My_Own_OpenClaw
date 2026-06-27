---
summary: "SDK OCR and vision guide covering OCR run/inspect/find/resolve, vision locate/describe, overlays, and artifact-backed image sources."
read_when:
  - When changing SDK OCR or vision routes.
  - When debugging coordinate grounding or perception output outside the desktop UI.
title: "OCR and Vision SDK"
---

# OCR and Vision SDK

SDK OCR and vision routes expose backend-owned perception capabilities for developer tooling. They should not require a local Electron app or local-runtime process.

## Route Families

private backend implementation exposes:

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

`/ocr/find-text` and `/ocr/find-text-candidates` both honor the request
`threshold` before applying `max_results`. The candidates route returns the
ranked candidate list that remains after threshold filtering.

## Image Sources

SDK routes can resolve image input through backend helpers, including artifact-backed sources. Preserve artifact identity when the image came from a screenshot or upload.

OCR inspect returns `resolution_error` only for expected coordinate-resolution
misses, ambiguous matches, stale-frame candidates, or malformed OCR rows that
the resolver reports as `ValueError`. Unexpected resolver/runtime failures must
propagate as route errors so monitoring and SDK callers do not treat backend
failures as normal no-match results.

OCR run and OCR overlay require an authenticated install identity before
resolving image sources, running OCR, or writing overlay artifacts.

Vision locate-all requires an authenticated install identity before resolving
image sources or invoking provider-backed vision work.

Vision describe region responses are crop-relative when a region is supplied:
the backend rejects origins outside the source image, trims partial overflow at
the image edge, and returns cropped-image metadata with the region origin
normalized to `x=0, y=0`.

## Owner Modules

- SDK route models: private backend implementation
- SDK services: private backend implementation
- OCR coordinate resolver: private backend implementation
- OCR/vision services: private backend implementation

## Validation

Add backend route/service tests for:

- empty or invalid image source
- OCR threshold behavior
- overlay generation
- coordinate resolution failures
- vision provider unavailable/failure paths
