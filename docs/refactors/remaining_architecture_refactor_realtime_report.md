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
