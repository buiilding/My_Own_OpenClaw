# Backend Prompt Image Preprocessing Plan

Date: 2026-06-10

## Goal

Move user image attachment hydration out of query input shaping and into the backend model-history projection so `screenshot_refs` remain durable handles while provider prompt images are bounded, model-ready projections.

## Scope

- Keep SDK and renderer transport/display behavior unchanged.
- Store backend user-message image refs separately from inline image data.
- Resolve artifact refs during provider prompt construction.
- Preprocess prompt images before validation: decode, resize/compress when needed, and apply image-specific limits.
- Validate text content separately from image payload size so multi-image turns are not rejected by serialized multimodal JSON size alone.
- Add focused backend tests and update documentation.

## Checklist

- [x] Preserve `screenshot_refs` through query execution without loading artifact base64.
- [x] Add stored user-message image refs and owner metadata.
- [x] Add prompt-time image preprocessing and clear image-specific failures.
- [x] Update prompt validation to count multimodal text separately from image bytes.
- [x] Add focused tests for two-image refs, oversized text, and oversized/unusable image failures.
- [x] Update docs and changelog.
- [x] Run focused backend tests, docs listing, formatting, and diff checks.

## Risk

Prompt size can still grow with multiple images, but that growth is now governed by explicit image policy and the existing aggregate prompt limit rather than a misleading per-message text limit.
