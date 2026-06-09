# Sidecar Logical Screenshot Coordinate Report (2026-06-08)

Plan: `docs/plans/2026-06-08-sidecar-logical-screenshot-coordinate-plan.md`

## Status

Implementation complete; validation passed.

## Checklist

- [x] Read approved plan and current screenshot implementation.
- [x] Inspect sidecar screenshot tests and recent cursor-overlay context.
- [x] Add explicit screenshot geometry object and resize policy.
- [x] Move macOS cursor compositing after model-frame resize.
- [x] Update sidecar screenshot tests.
- [x] Update docs and changelog.
- [x] Run validation commands.
- [x] Commit completed work.

## Decisions

- Keep backend coordinate normalization unchanged. The sidecar should make the
  common screenshot frame match desktop coordinates, but the backend remains the
  authority for model-image-to-desktop coordinate mapping.
- Treat `capture_meta.source_w/source_h` as the final model-facing image size,
  never the raw native capture size.
- Keep this implementation scoped to sidecar computer screenshots and
  post-action screenshots.

## Validation Log

- `./scripts/python-in-env sidecar pytest tests/sidecar/test_screenshot_tool.py -q`
  - passed, 17 tests.
- `python -m py_compile frontend/src/main/python/tools/computer/screenshot_tool.py`
  - passed.
- `bin/windie docs list`
  - passed, docs navigation validated.
- `git diff --check`
  - passed.

## Inspection Notes

- Current sidecar screenshot path captures the OS image, optionally crops it,
  overlays cursor pixels, then records `source_w/source_h` from the captured
  image size.
- The approved target requires resolving the final model-facing image frame
  before metadata and macOS cursor compositing.
- Added `ScreenshotGeometry` so the sidecar names raw capture size, desktop
  rectangle, and model-facing image size before encoding.
- The capture path now resizes to the desktop-coordinate model frame before
  cursor overlays; metadata is taken from the final returned image and the
  desktop rectangle.
- Full-virtual-desktop crops now map desktop crop rectangles into raw image
  pixels first, so scaled raw captures can still crop the correct monitor before
  the model-facing resize.

## Commits

- `911440aea` - `fix(sidecar): normalize screenshots to desktop coordinates`
