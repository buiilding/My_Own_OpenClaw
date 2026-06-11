# Sidecar Logical Screenshot Coordinate Plan (2026-06-08)

## User Intent

Make the sidecar computer screenshot path return screenshots whose image pixel
dimensions match the desktop coordinate dimensions used by pyautogui, so normal
LLM-emitted manual coordinates can be passed through the existing normalizer as
an identity mapping.

The user explicitly does not want to remove coordinate normalization. The goal
is to make the common single-display path produce `source_w/source_h` equal to
`crop_w/crop_h`, while preserving the normalizer for crops, multi-monitor
offsets, mixed-DPI, and fallback capture engines.

## Owning Runtime

Owner: Python sidecar computer screenshot tool.

Adjacent consumers:

- Backend coordinate preparation reads `capture_meta` and should keep using the
  existing screenshot-pixel-to-desktop-coordinate normalizer.
- SDK/main local tool execution and post-action screenshots should continue to
  receive the same result fields.
- Renderer display only consumes the image/result; it should not own coordinate
  conversion.

## Scope

In scope:

- `frontend/src/main/python/tools/computer/screenshot_tool.py`
- `tests/sidecar/test_screenshot_tool.py`
- Sidecar screenshot runtime docs and changelog
- Post-action screenshot behavior that reuses the same sidecar screenshot tool

Out of scope:

- Renderer query screenshot attachment pipeline
- Backend coordinate normalizer deletion or rewrite
- OCR/vision service internals
- OpenAI provider image detail settings
- Dual full-resolution-plus-normalized artifact architecture from
  the previous screenshot-normalization planning track

## Target Behavior

For a full macOS Retina capture after "More Space":

```text
pyautogui.size() -> 1710 x 1112
native screenshot capture may produce -> 3420 x 2224
sidecar model-facing screenshot returns -> 1710 x 1112
capture_meta.source_w/source_h -> 1710 x 1112
capture_meta.crop_w/crop_h -> 1710 x 1112
backend normalizer -> identity for normal full-screen coordinates
```

For a bounded monitor/region capture:

```text
display_bounds.width/height -> crop_w/crop_h
model-facing screenshot size -> crop_w/crop_h
capture_meta.source_w/source_h -> crop_w/crop_h
capture_meta.crop_x/crop_y -> desktop offset
backend normalizer -> applies crop offset, but no DPI scale inside the crop
```

If the screenshot already matches desktop dimensions, no resize should happen.

## Foundational Geometry Contract

The implementation must treat the screenshot returned to the model as a
`model_image_frame`, not as "whatever the native capture backend happened to
produce."

Frame concepts:

- `raw_capture_frame`: the image produced by the OS/backend before normalization
  (for example `3420x2224` on a Retina panel).
- `desktop_frame`: the pyautogui coordinate space and crop rectangle
  (for example `1710x1112`, with optional `crop_x/crop_y` offsets).
- `model_image_frame`: the final image sent to the LLM and stored in
  `capture_meta.source_w/source_h`.

Default policy:

- set `model_image_frame` to the matching `desktop_frame` dimensions when those
  dimensions are known.

Required invariant:

- `capture_meta.source_w/source_h` always describe the final model-facing image,
  not the raw capture.
- `capture_meta.crop_x/crop_y/crop_w/crop_h` always describe the desktop-space
  rectangle represented by that model-facing image.
- Backend coordinate normalization remains the only authority that maps from
  model-image coordinates into executable desktop coordinates.

Future compatibility:

- If a future path deliberately sends non-desktop-sized screenshots, it can set
  `model_image_frame` to that image size and keep `crop_w/crop_h` as the desktop
  rectangle; the existing normalizer will scale.
- If multi-monitor capture returns a region with a desktop offset, `crop_x` and
  `crop_y` remain the offset source of truth.
- If mixed-DPI or provider-side resizing appears, the invariant still works as
  long as `source_w/source_h` match the actual model-facing image.

## Design

1. Capture the screenshot with the existing capture engine selection.
2. Determine the intended desktop-coordinate image size:
   - region capture: `region.width x region.height`
   - full desktop capture: `pyautogui.size()`
   - fallback: current captured image size when no desktop size is available
3. Resolve a named geometry object containing:
   - raw capture size
   - desktop rectangle
   - model-facing image size
   - whether resize is required
4. Resize the captured screenshot to the model-facing image size before JPEG
   encoding and before macOS built-in cursor compositing.
5. Composite the macOS fake cursor into the final model-facing image coordinate
   space.
6. Set `capture_meta.source_w/source_h` from the final image size, not the raw
   native capture size.
7. Keep `capture_meta.crop_w/crop_h` as desktop-coordinate bounds.
8. Preserve `capture_meta.capture_engine` and existing result fields.

## Workflow

1. Inspect current screenshot capture, cursor overlay, capture metadata, and
   tests.
2. Add a small helper that resolves target desktop-coordinate image dimensions.
3. Add a resize helper that uses a high-quality Pillow resampling filter and
   never changes the image when dimensions already match.
4. Move macOS cursor overlay after resizing so the built-in cursor keeps logical
   UI size instead of being downscaled from a Retina pixel image.
5. Update sidecar tests:
   - full desktop Retina image is resized from `3420x2224` to `1710x1112`
   - capture metadata reports logical/source dimensions
   - region Retina image is resized to `display_bounds.width/height`
   - identity-sized captures do not change dimensions
   - macOS cursor overlay still lands correctly after resize
6. Update sidecar screenshot docs and changelog.
7. Run focused validation.

## Success Criteria

- Sidecar screenshots returned to the model use desktop-coordinate dimensions
  when pyautogui desktop size or display bounds are available.
- Existing backend coordinate normalization remains unchanged and becomes an
  identity scale in the common same-size case.
- macOS fake cursor is drawn in the final screenshot coordinate space.
- Existing Linux/Windows cursor paths continue to pass focused tests.
- Docs describe the final model-facing screenshot dimensions and cursor order.

## Validation Commands

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_screenshot_tool.py -q
python -m py_compile frontend/src/main/python/tools/computer/screenshot_tool.py
bin/windie docs list
git diff --check
```

## Reread Anchors

- `frontend/src/main/python/tools/computer/screenshot_tool.py`
- `tests/sidecar/test_screenshot_tool.py`
- `docs/frontend/sidecar/tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md`
- previous screenshot-normalization planning notes

## Assumptions

- The request is about sidecar computer-use screenshots and post-action
  screenshots, not the renderer query-screenshot attachment pipeline.
- It is acceptable for the model-facing sidecar screenshot to be downscaled from
  native Retina pixels to desktop-coordinate dimensions.
- Full-resolution screenshots for a future OCR/grounding split remain out of
  scope for this implementation.
