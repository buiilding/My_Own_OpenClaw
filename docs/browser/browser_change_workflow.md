---
summary: "Workflow for changing WindieOS browser automation across backend schema, shared contract, Python sidecar runtime, CDP launch, Electron bridge, renderer browser session readiness UI, files, and tests."
read_when:
  - When adding, removing, renaming, or changing browser actions, browser schemas, CDP launch behavior, browser profile isolation, snapshots, refs, extraction, browser files, downloads, browser session readiness, or session controls.
  - When debugging browser actions that parse in the backend but fail in the sidecar, browser UI state that is stale, wrong-profile launches, CDP connection failures, snapshot/ref drift, or browser-local file path issues.
title: "Browser Change Workflow"
---

# Browser Change Workflow

Use this workflow when a browser change could cross the backend model-facing tool, shared browser contract, sidecar action runtime, Electron tool bridge, renderer browser controls, or browser-owned file/profile state.

WindieOS currently adapts its canonical browser tool contract to the maintained Browser Use CLI daemon through the Python sidecar. WindieOS owns the agent loop, policy, transport, and result normalization; Browser Use owns browser sessions, CDP/Playwright action mechanics, DOM state, element indexes, and daemon lifecycle. Future extension auto-attach remains a separate design boundary covered by [ADR 004](../adr/004-browser-extension-auto-attach.md).

## Runtime Invariants

- The backend owns model-facing browser tool exposure and validation.
- The shared Python browser contract is the schema source used by the backend
  remote browser tool and Python sidecar runtime validation.
- The Python sidecar owns Browser Use invocation, browser-local file helpers, and WindieOS result normalization.
- Browser Use owns Playwright/CDP objects, browser sessions, tabs, numeric element indexes, snapshots, and browser action mechanics.
- Electron main relays `execute_tool` requests and does not inspect Playwright objects.
- Renderer browser controls call the scoped `RUN_BROWSER_ACTION` IPC channel;
  Electron main maps that to the local browser tool.
- Browser automation uses a generic desktop-runtime Browser Use session by default, not the user's default Chrome profile.
- Browser file actions resolve through the browser file store instead of arbitrary filesystem helper paths.

## Fast Owner Map

| Change shape | First owner | Code roots | Tests to inspect or add | Start docs |
| --- | --- | --- | --- | --- |
| Browser tool visible/missing from model | Backend tool catalog/policy | `backend/src/tools/tool_catalog.py`, `backend/src/tools/remote_tools/browser.py`, `backend/src/tools/tool_policy.py`, `backend/src/tools/browser/**` | `tests/backend/test_browser_remote_tool.py`, tool policy/schema tests | [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md) |
| Browser action schema, fields, or action literals | Shared browser contract plus backend remote tool | `frontend/src/main/python/windie_shared/browser_contract*.py`, `backend/src/tools/browser/shared_contract_loader.py`, `backend/src/tools/remote_tools/browser.py`, `frontend/src/main/python/tools/browser/browser_tool.py` | `tests/backend/test_browser_remote_tool.py`, `tests/sidecar/tools/test_browser_schemas.py`, Browser Use engine tests | [Browser Action Surface](browser_action_surface.md) |
| Browser action runtime behavior | Sidecar Browser Use engine adapter | `frontend/src/main/python/tools/browser/browser_use_engine.py`, `browser_tool.py` | `tests/sidecar/tools/test_browser_tool.py`, `test_browser_use_engine.py` | [Browser Control](browser_control.md) |
| CDP launch, executable detection, or profile path | Sidecar Chrome launcher/detection | `frontend/src/main/python/tools/browser/chrome_launcher.py`, `chrome_detection.py`, `browser_use_engine.py` | `tests/sidecar/tools/test_chrome_launcher.py`, `test_chrome_detection.py`, `test_browser_use_engine.py` | [Dedicated Browser Runtime](dedicated_browser_runtime.md) |
| Snapshot text and Browser Use element indexes | Sidecar Browser Use engine adapter | `frontend/src/main/python/tools/browser/browser_use_engine.py` | `tests/sidecar/tools/test_browser_use_engine.py` | [Browser Action Surface](browser_action_surface.md) |
| Browser session header/status UI | Renderer browser session store and chat control | `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js`, `useBrowserSessionControl.js`, `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx` | `tests/frontend/ChatBrowserSessionControl.test.jsx` | [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md) |
| Browser permission/readiness/onboarding | Electron permission service and settings UI | `frontend/src/main/permissions/permission_service_browser.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs`, `frontend/src/renderer/features/dashboard/components/sections/settings/BrowserSettingsTab.jsx` | frontend permission/settings tests | [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md) |
| Browser file or download behavior | Sidecar browser file store and Browser Use engine adapter | `frontend/src/main/python/tools/browser/file_store.py`, `browser_use_engine.py` | sidecar browser tool/action tests | [Browser Troubleshooting](browser_troubleshooting.md) |
| Browser execution bridge timeout/result shape | SDK local-runtime bridge and sidecar browser execution | `packages/windie-sdk-js/src/runtime/Agent.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`, `frontend/src/main/sidecar/local_runtime_timeout_policy.cjs` | SDK client/runtime tests, browser/session tests | [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md) |

## End-to-End Action Flow

1. Backend exposes the model-facing `browser` tool through `RemoteBrowserTool`.
2. Backend browser schema wrappers import the shared browser contract and emit grouped action parameters.
3. The model emits a `browser` tool call with an action-specific payload.
4. Backend validation accepts or rejects the action before dispatch.
5. SDK/main tool routing receives the remote tool call and invokes the local
   execute-tool runtime directly.
6. SDK local runtime invokes the Python sidecar executable tool path, with Electron main supplying display/window context.
7. Python sidecar `ToolRegistry` resolves `"browser"` to `execute_browser`.
8. `execute_browser` validates the payload with `BrowserControlArgs`.
9. `BrowserUseEngineRuntime.execute()` maps the canonical action to Browser Use CLI daemon commands.
10. Browser Use performs CDP/Playwright work and the Python sidecar normalizes the result into a `ToolResult`.
11. SDK/main relays the result back to the backend tool-result path and renderer receives display projections.

If a payload parses in the backend but fails in the Python sidecar, compare the shared contract import path, backend schema wrapper, Python sidecar validation entrypoint, and Python sidecar runtime supported-action registry before changing renderer code.

## Change Paths

### Add or remove a browser action

Read:

- [Browser Action Surface](browser_action_surface.md)
- [Backend Browser Schema Parity Reference](../backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md)

Edit:

- `frontend/src/main/python/windie_shared/browser_contract_models.py` for action literals and pydantic argument model shape.
- `frontend/src/main/python/windie_shared/browser_contract_catalog.py` for action contract registration.
- `frontend/src/main/python/windie_shared/browser_contract_schema.py` if grouped schema emission needs new field handling.
- `backend/src/tools/browser/**` wrappers only if backend-specific adaptation changes.
- `frontend/src/main/python/tools/browser/browser_use_engine.py` for runtime handlers and WindieOS result normalization.
- `frontend/src/main/python/tools/browser/browser_tool.py` only if validation or error mapping changes.
- renderer browser session controls only if users need a visible control for the action.

Validate:

- backend schema includes or removes the action as intended.
- sidecar schema accepts the same action/fields and rejects removed fields.
- `BrowserUseEngineRuntime.execute()` covers the canonical runtime action set or returns explicit unsupported-action errors for Browser Use CLI gaps.
- connected-page actions require an active browser session.
- model-visible docs and prompt/tool-schema snapshots are updated when the visible schema changes.
- sidecar browser registry tests skip only when Playwright itself is missing; WindieOS browser module import failures should fail collection.

### Change action payload fields

Read:

- [Browser Action Surface](browser_action_surface.md)
- [Tool Contract Map](../tools/tool_contracts.md)
- [Backend-Sidecar Browser Schema Parity Reference](../backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)

Edit:

- shared contract model for type/default/validation changes.
- shared schema builder if JSON schema shape changes.
- Python sidecar runtime handler if execution semantics change.
- backend tests if model-facing schema output changes.
- renderer tests only for UI-triggered action payloads such as `connect`, `status`, `get_tabs`, `switch`, or `close`.

Validate:

- old unsupported fields fail where they should fail.
- required fields produce clear validation errors.
- defaulted fields do not make model-facing schema ambiguous.
- Python sidecar runtime ignores only intentionally optional fields.

### Change CDP launch or dedicated profile behavior

Read:

- [Dedicated Browser Runtime](dedicated_browser_runtime.md)
- [ADR 004: Browser Extension Auto-Attach Boundary](../adr/004-browser-extension-auto-attach.md)
- [Platform Change Workflow](../platforms/platform_change_workflow.md) if OS paths/process behavior changes.

Edit:

- `frontend/src/main/python/tools/browser/chrome_detection.py` for executable search order.
- `frontend/src/main/python/tools/browser/chrome_launcher.py` for CDP URL/port, process args, startup probes, and profile directory.
- `frontend/src/main/python/tools/browser/browser_use_engine.py` for Browser Use session attachment and status payloads.
- permission/readiness UI only if the user-visible setup flow changes.

Validate:

- default CDP host stays localhost-only.
- `WINDIE_BROWSER_CDP_PORT` override is parsed and tested.
- profile path remains Windie-owned and separate from the user's normal browser profile.
- failed launch tears down partial processes cleanly.
- status/connect payloads still include enough data for renderer session controls.

### Change browser snapshots or element indexes

Read:

- [Browser Action Surface](browser_action_surface.md)
- [Browser Troubleshooting](browser_troubleshooting.md)

Edit:

- `frontend/src/main/python/tools/browser/browser_use_engine.py` for snapshot pagination, result fields, and numeric index validation.
- shared browser schemas only if accepted action fields change.

Validate:

- Browser Use state text is preserved in the model-visible result output.
- numeric indexes from the latest snapshot are accepted where Browser Use actions require them.
- `ref` aliases and role refs produce validation errors.
- snapshot limits protect output size but preserve useful interactive elements.
- click/input tests cover numeric indexes and reject legacy refs.

### Change browser extraction or long-content behavior

Read:

- [Browser Action Surface](browser_action_surface.md)
- [Local Runtime Sidecar Browser Stack](../frontend/sidecar/browser_automation_stack.md)

Edit:

- `frontend/src/main/python/tools/browser/content_extraction.py` for HTML capture, markdown conversion, scoped extraction, offsets, and max chars.
- `frontend/src/main/python/tools/browser/browser_use_engine.py` for action-level result fields and bounds.
- provider/config docs only if extraction starts depending on an LLM provider.

Validate:

- extraction does not mutate page state.
- long-content offsets allow continuation.
- max character bounds cannot be bypassed by action payloads.
- missing optional packages degrade with clear error messages.

### Change browser file or download behavior

Read:

- [Browser Troubleshooting](browser_troubleshooting.md)
- [Filesystem and Shell Tools](../tools/filesystem_shell.md) for contrast with non-browser file tools.

Edit:

- `frontend/src/main/python/tools/browser/file_store.py` for browser-owned root resolution.
- `frontend/src/main/python/tools/browser/browser_use_engine.py` for `write_file`, `replace_file`, `read_file`, `read_long_content`, `upload_file`, and screenshot/file result fields.
- browser-use download helpers only when a current code path still owns the behavior.

Validate:

- relative paths resolve under the browser file root.
- absolute paths and parent-directory escapes are rejected.
- parent directories are created only through the file-store helper when intended.
- file reads preserve offsets/limits where long reads are supported.
- browser file actions do not silently become general filesystem tools.

### Change renderer browser session controls

Read:

- [Renderer State Change Workflow](../frontend/renderer/renderer_state_change_workflow.md)
- [Browser Troubleshooting](browser_troubleshooting.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Edit:

- `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js` for polling, busy actions, tab normalization, and stale-request handling.
- `frontend/src/renderer/infrastructure/hooks/useBrowserSessionControl.js` for React subscription behavior.
- `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx` for visible controls.
- Electron bridge only if action invocation/result shape changes.

Validate:

- controls use `INVOKE_CHANNELS.RUN_BROWSER_ACTION`.
- `connect`, `status`, `get_tabs`, `switch`, and `close` payloads remain canonical browser actions.
- polling starts only while subscribed and connected.
- stale async status responses cannot overwrite newer state, and disconnect
  invalidates in-flight syncs before stale `get_tabs` results can reapply a
  connected snapshot.
- UI handles local-runtime not-ready state without pretending the browser is connected.

### Change browser permission/readiness behavior

Read:

- [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Dedicated Browser Runtime](dedicated_browser_runtime.md)

Edit:

- `frontend/src/main/permissions/permission_service_browser.cjs` for feature-pack/readiness probes and install actions.
- `frontend/src/main/permissions/permission_ipc_runtime.cjs` for permission IPC wiring.
- renderer onboarding/settings browser surfaces if visible state changes.
- sidecar requirements/runtime docs if browser feature-pack markers or dependencies change.

Validate:

- readiness reflects real import/runtime capability.
- onboarding does not claim OS permissions WindieOS cannot actually register or probe.
- packaged runtime dependencies and feature-pack docs stay aligned.
- first explicit browser setup action can actually launch/connect the browser.

## Debug Routing

| Symptom | First checks | Likely owner |
| --- | --- | --- |
| Model never sees `browser` | tool policy/profile, model-visible schema, provider projection | backend tool catalog/policy |
| Backend rejects browser payload | action literal, grouped schema, removed fields, model-facing parameters | shared contract/backend schema wrapper |
| Backend accepts payload but Python sidecar rejects it | shared contract import drift, Python sidecar validation entrypoint, runtime supported actions | shared contract or Python sidecar validation |
| `connect` launches wrong profile | CDP URL/port, profile path, Chrome launch args, extension-mode assumptions | sidecar Chrome launcher |
| `connect` times out | executable detection, port already in use, `/json/version`, feature-pack deps | sidecar Chrome launcher/controller |
| `status` works but renderer shows disconnected | renderer polling snapshot, stale request id, result normalization | renderer browser session store |
| `click` or `input` hits wrong element | fresh snapshot, role-ref disambiguation, action executor locator resolution | sidecar snapshot/ref/action executor |
| snapshot misses interactive elements | DOM/AX collection, ref registry, snapshot limit, page load timing | sidecar enhanced CDP pipeline |
| browser files land in the wrong path | file-store root, relative path resolution, upload/read action payload | sidecar browser file store |
| browser action hangs at desktop bridge | Electron execute-tool timeout, Python sidecar JSON-RPC availability, action runtime hang | Electron bridge or Python sidecar runtime |

## Validation Matrix

| Changed boundary | Minimum focused validation |
| --- | --- |
| Backend browser schema/tool exposure | `./scripts/python-in-env backend pytest tests/backend/test_browser_remote_tool.py` |
| Shared browser contract or Python sidecar validation | `./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_schemas.py tests/sidecar/tools/test_browser_use_engine_runtime.py` |
| Python sidecar runtime action | `./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine.py` |
| CDP launch/session lifecycle | `./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_chrome_launcher.py tests/sidecar/tools/test_chrome_detection.py tests/sidecar/tools/test_browser_use_engine.py` |
| Snapshot/index behavior | `./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_use_engine.py` |
| Renderer browser session UI | `bin/windie test frontend -- ChatBrowserSessionControl.test.jsx` |
| Browser permission/readiness UI | focused frontend permission/settings tests plus sidecar import/readiness smoke where dependencies changed |
| Docs-only browser changes | `bin/windie docs list`, `git diff --check`, and a focused Markdown link check over touched docs |

## Review Checklist

Before committing a browser change:

1. Confirm whether the change is schema, runtime, CDP/profile, renderer UI, permission/readiness, or file/download behavior.
2. Confirm the backend and sidecar still share the same canonical browser action contract.
3. Confirm dedicated browser profile isolation remains intact.
4. Confirm renderer controls still use `RUN_BROWSER_ACTION`, not generic
   renderer `execute-tool`.
5. Confirm browser file behavior stays browser-owned and does not bypass filesystem-tool boundaries.
6. Confirm stale renderer polling and disconnected-browser states are tested when UI state changes.
7. Confirm future extension/auto-attach behavior remains in ADR or planning docs unless implemented with permissions and tests.
8. Update the related docs below when behavior or public integration shape changes.

## Related Docs

- [Browser Hub](README.md)
- [Dedicated Browser Runtime](dedicated_browser_runtime.md)
- [Browser Action Surface](browser_action_surface.md)
- [Browser Troubleshooting](browser_troubleshooting.md)
- [Browser Tool](../tools/browser.md)
- [Local Runtime Sidecar Browser Stack](../frontend/sidecar/browser_automation_stack.md)
- [ADR 004: Browser Extension Auto-Attach Boundary](../adr/004-browser-extension-auto-attach.md)
- [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md)
- [Sidecar Runtime Change Workflow](../frontend/sidecar/sidecar_runtime_change_workflow.md)
