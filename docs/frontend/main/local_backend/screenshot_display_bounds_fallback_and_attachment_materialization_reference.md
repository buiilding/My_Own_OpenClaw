---
summary: "Deep reference for local-backend screenshot routing in Electron main: display-bounds fallback resolution, screenshot-path artifact materialization, inline fallback behavior, and temp-file cleanup guarantees."
read_when:
  - When changing screenshot tool routing in `frontend/src/main/local_backend_bridge*.cjs`.
  - When debugging missing `screenshot_ref`/`screenshot_url`, wrong monitor capture, or leaked temporary screenshot files.
title: "Screenshot Display-Bounds Fallback and Attachment Materialization Reference"
---

# Screenshot Display-Bounds Fallback and Attachment Materialization Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_display_bounds.cjs`
- `frontend/src/main/local_backend_bridge_tool_args.cjs`
- `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs`
- `frontend/src/main/display_affinity_runtime.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/LocalBackendBridgeDisplayBounds.test.cjs`
- `tests/frontend/LocalBackendBridgeToolArgs.test.cjs`

## Runtime Ownership

For `execute-tool` calls where `toolName === "screenshot"`, Electron main owns two contracts before returning to renderer:

1. resolve fallback `display_bounds` for monitor-targeted capture
2. materialize sidecar `screenshot_path` into durable attachment fields (`screenshot_ref`/`screenshot_url`) or inline fallback (`screenshot`)

This behavior is local-backend bridge specific; non-screenshot tools do not run these paths.

## Display-Bounds Fallback Resolution

`resolveScreenshotToolDisplayBounds(...)` (`local_backend_bridge_display_bounds.cjs`) resolves fallback bounds with strict precedence:

1. call `resolveActiveSurfaceDisplayAffinityForWindows(...)` with:
  - sender `webContents`
  - `getWindows()` adapter returning chat/main windows
  - stored affinity getter fallback
2. inside that resolver: sender visible surface affinity (when sender is chat/main and visible), then visible chat/main surface affinity, then stored active display affinity

Returned affinity is converted with `toScreenshotDisplayBounds(...)` and includes:

- `x`, `y`, `width`, `height`
- optional `monitor_id`
- optional `desktop_virtual_bounds`

## Tool-Arg Injection Boundary

`resolveToolArgs("screenshot", args, ..., { displayBounds })` (`local_backend_bridge_tool_args.cjs`) applies fallback only when caller args do not already contain valid explicit bounds.

Normalization rules:

- valid bounds require finite numeric `x/y/width/height` with positive `width/height`
- optional `monitor_id` is trimmed non-empty string
- optional nested `desktop_virtual_bounds` is normalized recursively

Precedence:

1. preserve valid explicit `args.display_bounds`
2. otherwise inject normalized fallback `options.displayBounds`
3. if neither is valid, omit `display_bounds`

## Screenshot Path Materialization Contract

`materializeScreenshotAttachment(result, backendHttpUrl, ...)` runs after sidecar execution in `execute-tool`.

It only runs when all are true:

- `result.success !== false`
- `result.data` is an object
- `result.data.screenshot_path` is a non-empty string

### Upload path

`uploadScreenshotArtifactFromPath(...)`:

- reads file bytes from `screenshot_path`
- constructs multipart form upload (`file`) to `${backendHttpUrl}/api/artifacts/`
- content type resolution precedence:
  1. `screenshot_content_type` (image/*)
  2. `image_content_type` (image/*)
  3. `compression` / `format` (`png`/`webp`)
  4. default `image/jpeg`
- filename resolution:
  - existing basename with extension from `screenshot_path`
  - fallback by content type (`screenshot.png` / `screenshot.webp` / `screenshot.jpg`)

If upload response contains `artifact_id`:

- set `data.screenshot_ref = artifact_id`
- set `data.screenshot_url` from response `url` or fallback `${backendHttpUrl}/api/artifacts/${artifact_id}`

If upload succeeds but response lacks `artifact_id`, bridge falls back to inline base64 `data.screenshot`.

### Failure fallback path

On upload failure:

- warning log is emitted
- bridge tries to read file and set inline `data.screenshot` base64
- if inline read also fails, second warning is emitted and no screenshot payload is added

### Cleanup guarantee

`finally` block always:

- attempts file deletion (`unlinkQuietly`)
- removes `data.screenshot_path`

This guarantee applies to success and failure paths to prevent temp-file leaks.

## Test-Backed Invariants

`tests/frontend/LocalBackendBridgeDisplayBounds.test.cjs`:

- prefers visible sender-window affinity over active query fallback
- falls back to active query affinity when sender window is hidden

`tests/frontend/LocalBackendBridge.rpc.test.cjs`:

- successful artifact upload returns `screenshot_ref` + `screenshot_url`
- failed upload falls back to inline base64 screenshot
- temporary screenshot file is deleted after handling

`tests/frontend/LocalBackendBridgeToolArgs.test.cjs`:

- screenshot args preserve explicit `display_bounds`
- screenshot args inject fallback bounds only when explicit bounds are absent/invalid

## Drift Hotspots

1. Removing `requireVisible:true` for sender affinity can route hidden-window captures to stale displays.
2. Overwriting explicit `args.display_bounds` with fallback affinity can break intentional monitor targeting.
3. Returning `screenshot_path` to renderer instead of materializing attachments leaks local temp-path internals.
4. Skipping cleanup in failure paths can leak temporary screenshot files.

## Related Pages

- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](rpc_handler_registry_and_payload_mapper_reference.md)
- [Tool Arg Sudo-Auth Mode Resolution and Config-Guard Contract Reference](tool_arg_sudo_auth_mode_resolution_and_config_guard_contract_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](../display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
