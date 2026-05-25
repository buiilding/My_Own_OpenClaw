---
summary: "Real-time implementation report for the runtime ownership simplification refactor plan."
read_when:
  - When reviewing which runtime ownership simplification issues have been completed.
  - When continuing the refactor plan after a verified incremental commit.
title: "Runtime Ownership Simplification Report - 2026-05-25"
---

# Runtime Ownership Simplification Report - 2026-05-25

Source plan: [Runtime Ownership Simplification Plan](runtime_ownership_simplification_plan.md)

## Completed

### Query Identity Split

Status: completed and verified.

Changes:

- SDK `ConversationRuntime.send()` now passes its `turnRef` as transport message context instead of writing `turn_ref` into `QueryPayload`.
- SDK `BackendTransport.sendQuery()` accepts an optional `messageId` option for websocket envelope identity.
- Desktop renderer transport sends `query_message_id` over `send-chat-query` IPC and does not forward `turn_ref`.
- Electron main uses the prepared `query_message_id` as `queryMessageId`, strips legacy `turn_ref`/`turnRef` before backend payload construction, and keeps local optimistic rows keyed by that envelope id.
- Backend `QueryPayload` no longer accepts `turn_ref`; query handlers and execution service use `message.id` as the canonical stream `turn_ref`.
- Tests now fail if `turn_ref` reappears inside query payloads at the SDK, desktop transport, IPC runtime, main bridge, or backend schema boundary.
- Query identity docs now distinguish websocket envelope context from backend query payload fields.

Success criteria covered:

- Backend `QueryPayload` receives only allowed fields from `backend/src/api/schemas/incoming.py`.
- Backend stream events return `turn_ref` equal to the websocket message id.
- Desktop transport, live-turn runtime, IPC runtime, main bridge, SDK runtime, and backend schema tests reject or detect query payload `turn_ref`.
- Dashboard chat no longer has a path that sends `query.payload.turn_ref`.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 ../frontend/node_modules/electron/dist/electron.exe ./node_modules/jest/bin/jest.js DesktopBackendTransport DesktopLiveTurnRuntimeClient IpcQueryRuntime IpcMainBridge.query WindieSdkConversationRuntime WindieSdkMainRuntime --runInBand` - pass
- `.\.venv-backend\Scripts\python.exe -m pytest tests\backend\test_api_handlers.py tests\backend\test_query_execution_service_helpers.py tests\backend\test_sdk_runtime_backend_compatibility.py tests\backend\test_websocket_message_handler.py -q` - pass
- `cd packages/windie-sdk-js && ELECTRON_RUN_AS_NODE=1 ..\..\frontend\node_modules\electron\dist\electron.exe ..\..\frontend\node_modules\typescript\bin\tsc -p tsconfig.build.json` - pass
- `ELECTRON_RUN_AS_NODE=1 .\frontend\node_modules\electron\dist\electron.exe .\scripts\docs-list.js` - pass
- `git diff --check` - pass

Notes:

- `npm` and a directly runnable `node` executable were unavailable in this shell. Frontend validation used the repo-local Electron binary with `ELECTRON_RUN_AS_NODE=1`, which successfully ran Jest, TypeScript, and docs-list.

## Pending

- Query payload construction single-contract cleanup.
- `frontend/src/main/ipc.cjs` composition-root split.
- SDK-owned live turn projection.
- Renderer stream handling split between live projection and side effects.
- Raw `from-backend` channel classification and typed-channel migration.
- Settings/model runtime ownership consolidation.
- Conversation session authority service.
- Conversation persistence adapter collapse.
- Tool execution routing ownership hardening.
- Sidecar bridge split.
- Frontend/backend websocket contract tests for all message families.
- Diagnostics runtime and redaction boundary.
- Architecture docs current/target/debt updates for remaining duplicate paths.
