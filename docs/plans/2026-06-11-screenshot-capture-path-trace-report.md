---
summary: "Implementation report for adding durable screenshot.capture path traces to query screenshot capture."
read_when:
  - When reviewing or continuing the screenshot.capture path trace implementation.
  - When validating durable trace rows for query screenshot capture across SDK, Electron main, and sidecar boundaries.
title: "Screenshot Capture Path Trace Report"
---

# Screenshot Capture Path Trace Report

Plan: `docs/plans/2026-06-11-screenshot-capture-path-trace-plan.md`

Status: complete.

## Checklist

- [x] Plan approved.
- [x] Create SDK trace plumbing for turn resource resolution.
- [x] Instrument query screenshot resource resolution under `screenshot.capture`.
- [x] Surface Electron main screenshot-prep metadata without renderer invention.
- [x] Add sidecar screenshot trace helper metadata.
- [x] Keep trace rows sanitized.
- [x] Update docs and changelog.
- [x] Add focused tests.
- [x] Run validation.
- [x] Reinspect final code paths against the plan.
- [x] Commit completed changes.

## Design Notes

- The implementation must keep SDK as the durable trace event writer.
- Renderer remains a diagnostics reader and request-handle producer only.
- Electron main and sidecar expose sanitized producer metadata back through the
  existing local tool execution path.
- Backend artifact storage tracing remains out of scope; SDK records only the
  artifact upload outcome it observes while resolving the query screenshot.
- SDK turn resource resolver context now carries a trace callback. The
  `query_screenshot_request` resolver emits all durable rows through the SDK
  `TraceRecorder`.
- Electron main screenshot leases attach safe metadata to the existing release
  function: platform, lease mode, visible capture window count, and duration.
- Sidecar screenshot capture returns a diagnostic-only `path_trace` object built
  by `path_trace.py`. SDK tool-result normalization strips `path_trace` so it
  does not become model-facing tool output.
- Artifact upload failure rows use a fixed sanitized error summary so local temp
  paths from filesystem exceptions are not persisted.

## Validation Log

- Passed: `npm run build:cjs` from `packages/windie-sdk-js`.
  - Note: the build repeatedly rewrote unrelated `SidecarConversationStore`
    method names from an existing source/generated mismatch. Those unrelated
    hunks were removed after each build and are not part of this implementation.
- Passed: `bin/windie test frontend -- WindieSdkConversationRuntime.test.ts SurfaceRuntime.test.cjs ToolOutputContent.test.ts`
- Passed: `./scripts/python-in-env sidecar pytest tests/sidecar/test_screenshot_tool.py -q`
- Failed with unrelated existing/parity issue: `bin/windie test sidecar tests/sidecar/test_screenshot_tool.py -q`
  - The wrapper ran the broader sidecar suite and failed
    `tests/sidecar/test_tool_manifest.py::test_generated_builtin_manifest_matches_sidecar_source`.
  - The direct touched screenshot test file passed.
- Passed: `./scripts/python-in-env sidecar python -m py_compile frontend/src/main/python/path_trace.py frontend/src/main/python/tools/computer/screenshot_tool.py`
- Passed: `bin/windie test frontend -- DesktopConversationContinuityService.test.ts LocalBackendBridge.rpc.test.cjs`
- Passed: `bin/windie test frontend -- WindieSdkConversationRuntime.test.ts ToolOutputContent.test.ts`
- Passed: `bin/windie docs list`
- Passed: `git diff --check`

## Inspection Pass

- `rg "screenshot\\.capture|path_trace|surface_prepare|sidecar_capture|query_payload_applied"` found the new durable path only in SDK runtime/CJS mirrors, docs, and focused tests.
- `path_trace` is produced only by the sidecar screenshot helper and stripped by
  SDK local tool result normalization before model-facing tool output.
- Trace rows persist ids, booleans, counts, modes, dimensions, content type,
  duration, and short sanitized error summaries. They do not persist screenshot
  bytes, screenshot paths, screenshot URLs, user text, file content, auth
  headers, credentials, or stack traces.
- No in-scope renderer truth source was added.

## Commits

- `bf0cf285a feat(sdk): trace query screenshot capture`

## Deviations

- The approved plan mentioned an example skip row for clipboard-image-present
  sends. That branch does not create a `query_screenshot_request` resource, so
  this implementation does not emit `screenshot.capture` rows when the path is
  not entered. The traced path remains scoped to actual query screenshot
  resource resolution.
