---
summary: "Real-time completion report for the remaining architecture refactor plan."
read_when:
  - When reviewing which remaining architecture refactor checklist items have been implemented, verified, and committed.
  - When continuing the deletion-first runtime ownership cleanup after a partial refactor pass.
title: "Remaining Architecture Refactor Real-Time Report"
---

# Remaining Architecture Refactor Real-Time Report

This report is append-only during the refactor pass. Each entry records the
implemented fix, previous behavior, current behavior, validation, and any debt
left behind.

## Move Final Query Prompt Assembly To The Backend

Status: completed.

Commit: included in the same commit as this fix.

Implementation:

- Added backend-owned query-context rendering in
  `backend/src/llm/prompts/query_context.py`.
- Added `query_context` to the backend websocket `QueryPayload` schema so
  desktop clients can send structured memory and attachment context instead of
  final model-visible XML/text.
- Updated backend query input shaping to render `query_context` into
  `message_content` before the agent session/executor sees it.
- Updated Electron main query payload building to send structured
  `query_context` and stop sending `payload.content` for desktop query sends.
- Updated frontend query payload and IPC bridge tests to assert structured
  context instead of main-process XML.
- Added backend rendering tests for memory sections, attachment context, query
  escaping, disabled memory retrieval, and legacy `content` compatibility.
- Added backend query-input and websocket schema coverage for structured
  `query_context`.
- Escaped attachment context during backend prompt rendering so attached file
  text cannot close the `<attached_file_context>` wrapper.

Previous behavior:

- Electron main collected local memory and attachment context, then assembled
  the final model-visible `<episodic_memory>`, `<semantic_memory>`,
  `<attached_file_context>`, and `<user_query>` text before sending the backend
  websocket query.
- Backend accepted that pre-rendered `content` and mostly treated it as final
  user message content, so prompt ownership was split between Electron main and
  backend prompt construction.

Current behavior:

- Electron main still collects local memory, attachment context, and system
  state, but sends memory and attachment data as `query_context`.
- Backend owns the final model-visible query text rendering.
- Legacy websocket clients that still send `content` without `query_context`
  remain compatible through the backend renderer fallback.

Success criteria:

- Main sends structured context for desktop query turns: completed.
- Backend owns model-visible query/memory/attachment formatting: completed.
- Memory-enabled, memory-disabled, attachment, escaping, and legacy fallback
  behavior are covered by tests: completed.

Validation:

- `./scripts/python-in-env backend pytest tests/backend/test_query_context_prompt_rendering.py tests/backend/test_query_execution_inputs.py tests/backend/test_websocket_message_handler.py tests/backend/test_api_handlers.py -q`
- `cd frontend && npm run test -- IpcMainBridge.query IpcMainBridge.lifecycle IpcQueryRuntime QueryPayloadBuilder --runInBand`
- `./bin/docs-list`

Skipped or failed validation:

- Initial backend focused command used a stale test id,
  `tests/backend/test_validation_utils.py::test_validate_frontend_config_patch_accepts_provider_credentials`,
  which failed collection. I reran the backend settings payload,
  load-settings redaction, and full frontend config validation tests
  successfully with the command listed above.

## Put Dashboard Memory Actions Behind A Runtime Client

Status: completed.

Commit: included in the same commit as this report entry.

Implementation:

- Added `DesktopMemoryRuntimeClient` under the renderer app runtime boundary
  with typed methods for listing episodic memory, listing semantic memory,
  deleting episodic or semantic memory items, clearing local memory, and
  clearing chat history.
- Updated `MemorySection` to load and delete memory through the runtime client
  instead of importing IPC bridge channels directly.
- Updated dashboard memory settings actions to run destructive memory and chat
  clear operations through the same runtime client.
- Added runtime-client unit coverage for list, delete, clear, and IPC error
  handling.
- Added a dashboard boundary test that fails if memory-specific IPC channel
  names return to dashboard feature code.

Previous behavior:

- Dashboard memory components and hooks invoked sidecar-shaped memory IPC
  channels directly.
- Feature code knew about list, delete, clear-memory, and clear-chat channel
  names, so renderer UI code owned transport details that should sit below a
  runtime facade.

Current behavior:

- Dashboard feature code calls `DesktopMemoryRuntimeClient` methods.
- IPC channel names and sidecar result normalization are contained in the
  renderer app runtime client.
- Memory UI still uses the same sidecar-backed behavior, but the feature
  boundary no longer imports memory IPC constants.

Success criteria:

- Renderer memory UI imports no IPC channel constants for sidecar memory
  behavior: completed.
- Sidecar RPC details are contained below the facade: completed.
- Memory list, delete, clear, and error handling are covered by focused tests:
  completed.

Validation:

- `cd frontend && npm run test -- DesktopMemoryRuntimeClient MemorySection SettingsSection RendererDashboardRuntimeBoundary --runInBand`
- `cd frontend && npm run test -- RendererChatRuntimeBoundary --runInBand`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `./bin/docs-list`
- `git diff --check`

Skipped or failed validation:

- Sidecar memory tests were not run because this slice did not change sidecar
  storage or sidecar RPC behavior.

## Move Provider Secret Persistence Out Of Renderer-Shaped Config

Status: completed.

Commit: included in the same commit as this report entry.

Implementation:

- Added a renderer persistence payload builder that redacts provider API keys
  and OAuth access/refresh tokens before localStorage or Electron disk saves.
- Updated `AppConfigProvider` so renderer persistence receives the redacted
  payload while live backend settings sync still receives the unredacted
  provider credential update.
- Added Electron main redaction on `save-frontend-config` and
  `load-frontend-config` so legacy disk config and defensive save handling do
  not expose raw provider secrets.
- Updated frontend config persistence docs and runtime-path docs to state the
  persistence boundary and backend live-sync boundary explicitly.
- Added renderer and main-process IPC tests for redacted persistence, redacted
  legacy load, defensive disk-save redaction, and continued backend settings
  sync with live credential updates.

Previous behavior:

- Renderer config state with `provider_api_keys` or `provider_oauth` could be
  passed directly to the Electron `save-frontend-config` IPC handler.
- Electron main wrote whatever renderer config payload it received into
  `frontend-config.json`, so raw provider credentials could persist to disk
  even though localStorage redaction existed.

Current behavior:

- Renderer localStorage and Electron disk config persistence both receive a
  redacted provider credential payload.
- Electron main also redacts provider secrets on load and save, protecting
  legacy files and any accidental raw renderer payload.
- Backend settings sync remains the live credential delivery path for provider
  updates.

Success criteria:

- Renderer persisted config payloads do not contain raw provider API keys or
  OAuth access/refresh tokens: completed.
- Electron frontend-config disk writes and legacy disk loads are redacted:
  completed.
- Provider settings UI can still send live credential updates to backend
  settings: completed.

Validation:

- `cd frontend && npm run test -- AppConfigPersistence AppConfigProvider.storageAndIpc IpcMainBridge.lifecycle configStorage configFilter ModelsSection --runInBand`
- `./scripts/python-in-env backend pytest tests/backend/test_settings_payload_builder.py tests/backend/test_api_handlers.py::test_load_settings_handler_redacts_provider_api_keys tests/backend/test_validation_utils.py -q`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `./bin/docs-list`
- `git diff --check`

Skipped or failed validation:

- None for this slice.

## Split Sidecar Capability Manifests From Final Model-Facing Tool Projection

Status: completed.

Commit: included in the same commit as this report entry.

Implementation:

- Renamed the sidecar manifest schema builder from generic/model-facing terms
  to `build_sidecar_capability_schema(...)`.
- Renamed the grounding helper so sidecar source now describes backend
  grounding capability metadata rather than final provider-facing overrides.
- Added explicit `schema_role: "backend_validation"` and `executable_schema`
  metadata to generated built-in sidecar manifest entries.
- Updated backend client-manifest validation to validate and preserve optional
  `executable_schema` metadata for diagnostics.
- Updated backend client-manifest normalization so built-in sidecar tool names
  validate client capability but return canonical backend catalog tool specs as
  `accepted_tool_schemas`.
- Kept dynamic/plugin client tools on the existing path where their manifest
  schema and description become the backend-normalized function schema.
- Regenerated the built-in sidecar manifest after the source/schema drift check
  exposed a stale generated `process.action` enum.
- Updated tool-contract docs to state that built-in sidecar manifests prove
  executable capability while backend catalog specs remain provider-visible
  authority.

Previous behavior:

- Sidecar manifest source used `model_facing` naming and exported schemas that
  backend accepted as final prompt/tool schemas for built-in tool names.
- Accepted client manifests could replace backend catalog descriptions for
  built-in tools, blurring local capability reporting with provider-visible
  tool authority.
- Grounded tools had one built-in manifest `schema` field that mixed backend
  grounding inputs with direct sidecar executable arguments.

Current behavior:

- Sidecar built-in manifests are capability and argument-resolution input.
- Backend validation still accepts/rejects the client manifest, but built-in
  provider-visible schemas come from the backend tool catalog.
- Built-in manifest entries expose backend-validation `schema` separately from
  direct sidecar `executable_schema`.
- Dynamic client tools still use their manifest schema because no backend
  catalog entry exists for them.

Success criteria:

- Sidecar source no longer uses ambiguous `model_facing` naming for manifest
  schema construction: completed.
- Built-in provider-visible tool schemas are backend catalog owned after client
  manifest validation: completed.
- The sidecar generated manifest matches sidecar source and remains capability
  input for Electron handshakes: completed.
- Manifest fields now distinguish backend validation metadata from executable
  sidecar arguments: completed.

Validation:

- `./scripts/python-in-env sidecar pytest tests/sidecar/test_tool_manifest.py tests/sidecar/test_shared_tool_schema_parity.py tests/sidecar/test_tool_registry.py -q`
- `./scripts/python-in-env backend pytest tests/backend/test_client_tool_manifest.py tests/backend/test_remote_tool_contract.py tests/backend/test_tool_registry_schema.py -q`
- `./scripts/python-in-env backend pytest tests/backend/test_prompt_constructor_utils.py::test_build_prompt_openai_projection_filters_grounded_tools_after_projection tests/backend/test_computer_use_schema_contract.py::test_provider_projection_is_noop_for_openai_computer_tools tests/backend/test_computer_use_schema_contract.py::test_provider_projection_keeps_direct_computer_tools_even_with_prompt_images tests/backend/test_computer_use_schema_contract.py::test_provider_projection_applies_config_disabled_tools tests/backend/test_computer_use_schema_contract.py::test_provider_projection_applies_available_tools_allowlist -q`
- `cd frontend && npm run test -- AgentCapabilityHandshake WindieSdkMainRuntime WindieSdkClient McpRuntime --runInBand`
- `cd frontend && npm run lint`
- `./bin/docs-list`
- `git diff --check`

Skipped or failed validation:

- None for this slice.

## Remove Hand-Maintained SDK CommonJS Source Mirrors

Status: completed.

Commit: included in the same commit as this report entry.

Implementation:

- Added a package-owned CommonJS build output under
  `packages/windie-sdk-js/cjs` with its own `package.json` declaring
  `type: commonjs`.
- Added `tsconfig.cjs.json` and `scripts/write-cjs-package.mjs` so the CJS
  output is generated from TypeScript source instead of hand-maintained.
- Added TypeScript source for the current-turn backend-event projector so it can
  participate in both ESM and CJS builds.
- Updated Electron main SDK imports to consume generated
  `packages/windie-sdk-js/cjs/**` modules.
- Deleted the old hand-maintained SDK source `.cjs` modules from
  `packages/windie-sdk-js/src`.
- Updated boundary tests to assert Electron main consumes generated CJS output.

Previous behavior:

- Electron main imported SDK internals from `.cjs` files under
  `packages/windie-sdk-js/src`.
- Several SDK runtime, transport, tool, and projection modules had TypeScript
  source plus manually maintained CommonJS source copies.
- One projection helper existed only as CommonJS, which blocked a pure generated
  CJS strategy.

Current behavior:

- SDK TypeScript source is the source of truth for ESM and CommonJS consumers.
- Electron main still runs as CommonJS, but it imports package-generated CJS
  output rather than source mirrors.
- The package build command now builds both ESM and CJS outputs.

Success criteria:

- One SDK source of truth produces consumed module formats: completed.
- Main process imports come from generated build output: completed.
- Hand-maintained `.cjs` SDK mirrors are deleted from source: completed.

Validation:

- `npm --prefix packages/windie-sdk-js run build`
- `cd frontend && npm run test -- WindieSdkMainRuntime IpcSdkToolRouter IpcMainSdkRuntimeBoundary ModularRefactorCompletionBoundary WindieSdkConversationRuntime --runInBand`
- `node -e "const router=require('./packages/windie-sdk-js/cjs/tools/ElectronToolEventRouter.js'); const sdk=require('./packages/windie-sdk-js/cjs'); const projector=require('./packages/windie-sdk-js/cjs/projections/currentTurnProjection.js'); console.log(Boolean(router.routeSdkToolEventToLocalRuntime), Boolean(router.markRendererToolEventDisplayOnly), Boolean(sdk.createConversationRuntime), Boolean(projector.createCurrentTurnProjector));"`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `./bin/docs-list`
- `git diff --check`

Skipped or failed validation:

- None for this slice.

## Delete The Renderer-Owned Backend Event Contract

Status: completed.

Commit: included in the same commit as this report entry.

Implementation:

- Deleted `frontend/src/renderer/types/backendEvents.ts`, removing the
  renderer-owned raw backend event unions, payload validators, and
  `isBackendEvent` guard.
- Deleted the renderer `BackendEvents.test.ts` guard tests because raw backend
  event validation now belongs in SDK/backend transport tests, not renderer
  display tests.
- Added renderer-owned `toolSchemas.ts` for display/transcript tool-schema
  typing that does not imply websocket event ownership.
- Kept stream tracking labels display-only by typing them as renderer-local
  strings instead of mirroring backend event unions.
- Updated renderer transcript/chat utilities to import display tool-schema
  types or local payload-like shapes instead of backend event contracts.
- Added a runtime-boundary test proving
  `frontend/src/renderer/types/backendEvents.ts` remains deleted.

Previous behavior:

- Renderer owned a duplicate raw backend websocket event contract with event
  unions, validators, and payload shapes.
- Some renderer utilities imported that module only to borrow tool-schema or
  tool payload types, keeping a misleading dependency on backend event shapes.

Current behavior:

- SDK remains the client-side owner for raw backend event types and
  normalization.
- Renderer keeps only display-scoped tool-schema types, source labels, and
  local payload-like formatter types.
- Chat feature code and runtime boundary tests continue to enforce that raw
  backend event normalization stays outside renderer feature code.

Success criteria:

- Renderer has no raw backend websocket event contract: completed.
- SDK remains the single client-side backend event normalization boundary:
  completed.
- Renderer display utilities no longer import `types/backendEvents`: completed.

Validation:

- `cd frontend && npm run test -- RendererChatRuntimeBoundary ChatStreamMetadataHandlers DesktopChatStreamTrackingRuntime DesktopChatStreamEventRuntime ChatStreamMessageUpdates ToolSchemaShape --runInBand`
- `cd frontend && npm run test -- WindieSdkConversationRuntime --runInBand`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `./bin/docs-list`
- `git diff --check`

Skipped or failed validation:

- None for this slice.

## Remove Hand-Maintained SDK CommonJS Source Mirrors

Status: completed.

Commit: included in the same commit as this report entry.

Implementation:

- Added an SDK CommonJS build target with `tsconfig.cjs.json` and
  `npm run build:cjs`.
- Added `packages/windie-sdk-js/cjs/package.json` generation so generated
  `.js` files are loaded as CommonJS despite the package root using
  `"type": "module"`.
- Updated `@windie/sdk` package exports to expose `require` through generated
  `cjs/index.js`.
- Moved the Electron tool-event router helper surface and current-turn
  projection surface into TypeScript SDK source so generated CJS is produced
  from SDK source instead of hand-maintained `.cjs` mirrors.
- Updated Electron main SDK imports to consume generated
  `packages/windie-sdk-js/cjs/**` output.
- Deleted the old hand-maintained SDK source `.cjs` files.
- Updated main-runtime boundary tests and affected docs to point at generated
  CJS output.

Previous behavior:

- Electron main imported hand-maintained CommonJS mirrors from
  `packages/windie-sdk-js/src/**/*.cjs`.
- Several reusable SDK runtime surfaces had separate TypeScript and CommonJS
  source files that could drift.

Current behavior:

- TypeScript SDK source is the source of truth.
- `npm run build:cjs` generates the CommonJS package output consumed by
  Electron main.
- No `.cjs` files remain under `packages/windie-sdk-js/src`.

Success criteria:

- One SDK source tree produces the consumed CommonJS runtime modules:
  completed.
- Electron main imports generated SDK package output instead of `src/*.cjs`:
  completed.
- Hand-maintained SDK source `.cjs` files are deleted: completed.

Validation:

- `cd packages/windie-sdk-js && npm run build`
- `cd frontend && npm run test -- WindieSdkMainRuntime IpcMainSdkRuntimeBoundary ModularRefactorCompletionBoundary IpcSdkToolRouter WindieSdkConversationRuntime --runInBand`
- `node -e "const rt=require('./frontend/src/main/windie_sdk_runtime.cjs'); const tool=require('./frontend/src/main/ipc/ipc_sdk_tool_router.cjs'); console.log(typeof rt.createWindieSdkMainRuntime, typeof tool.markRendererToolEventDisplayOnly)"`
- `git diff --check`

Skipped or failed validation:

- None for this slice.
