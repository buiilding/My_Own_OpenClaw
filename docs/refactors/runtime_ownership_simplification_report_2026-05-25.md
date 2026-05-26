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

### Desktop Query Payload Contract

Status: completed and verified.

Changes:

- Added a single `buildBackendQueryPayload()` mapper with an explicit `BACKEND_QUERY_PAYLOAD_KEYS` allowlist for desktop query websocket payloads.
- Routed renderer query sends through the mapper after main-process enrichment and agent definition attachment.
- Routed automated query sends through the same mapper, removing the historical path that could add UI-only attachment filenames to backend payloads.
- Added contract tests for the exact backend-safe key list and for the main bridge's final outbound query payload shape.
- Updated the shared IPC bridge test harness with the `fs.promises.rm` mock required by current install-auth setup before websocket connection.

Success criteria covered:

- There is one tested function that maps desktop query input/enriched state to backend query payload keys.
- Main query tests assert exact backend payload keys for the enriched query path.
- UI-only fields such as `screenshot_url`, `attachment_context`, `attachment_filenames`, `memory_retrieval_enabled`, `query_message_id`, and legacy `turn_ref` are rejected by omission from the mapper.
- Adding a new backend query field now requires changing the mapper allowlist and its contract test.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js IpcQueryRuntime IpcMainBridge.query --runInBand` - pass
- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js DesktopBackendTransport DesktopLiveTurnRuntimeClient IpcQueryRuntime IpcMainBridge.query WindieSdkConversationRuntime WindieSdkMainRuntime --runInBand` - pass

### SDK-Owned Live Turn Projection

Status: completed and verified.

Changes:

- Added a normalized-conversation-event current-turn projector in the SDK projection runtime.
- Electron main now normalizes each backend event once, forwards that normalized conversation event to renderer, and derives `conversation-runtime-updated` from the same normalized event path.
- Removed Electron main's use of the raw backend `applyBackendEvent()` projector.
- Added a boundary test that fails if `windie_sdk_runtime.cjs` reintroduces `createCurrentTurnProjector` or `applyBackendEvent`.

Success criteria covered:

- `conversation-runtime-updated` is emitted from normalized SDK conversation event state, not a parallel raw backend projector.
- Existing SDK tests continue to prove assistant text, reasoning text, tool calls, tool outputs, completion, and error phase projection behavior.
- The main-runtime test now guards that renderer `conversation-event` and `conversation-runtime-updated` are driven by the normalized path.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js WindieSdkMainRuntime WindieSdkConversationRuntime --runInBand` - pass

### Renderer Stream Live Projection Boundary

Status: completed and verified.

Changes:

- No code change was needed after the SDK-owned current-turn projection update. Existing renderer code already routes live assistant/reasoning/tool display through `useConversationRuntimeProjectionStream.ts` and keeps `useChatStream.ts` on SDK conversation events plus transcript/metadata side effects.
- The existing renderer boundary tests now pass against the normalized main-runtime projection path.

Success criteria covered:

- Renderer chat stream code does not consume `ON_CHANNELS.FROM_BACKEND` for chat live state.
- `useChatStream.ts` does not own assistant delta/reasoning text mutation.
- Tool progress and active tool-display state are owned by the SDK current-turn projection listener.
- Transcript side-effect handlers continue to consume SDK conversation events directly.
- Dashboard selectors and response overlay contract tests verify both surfaces consume the same current-turn projection.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js RendererChatRuntimeBoundary ChatStreamThinkingStatus.state ChatStreamThinkingStatus.transcript ChatSelectors ResponseOverlayViewContract --runInBand` - pass

### Raw `from-backend` Renderer Subscription Classification

Status: completed and verified.

Changes:

- Added typed renderer channels for settings/model control ACK events, agent capability events, and audio chunks.
- Main now classifies backend websocket events onto `backend-settings-event`, `agent-capability-event`, and `audio-chunk` before retaining the legacy `from-backend` compatibility fan-out.
- `AppConfigProvider`, `AppStatusProvider`, `AgentSettingsTab`, and audio playback now subscribe to their named channels instead of `ON_CHANNELS.FROM_BACKEND`.
- Added routing tests for the main typed-channel classifier and renderer boundary tests that fail if owned app paths subscribe to raw backend traffic again.

Success criteria covered:

- Renderer feature code has no `IpcBridge.on(ON_CHANNELS.FROM_BACKEND)` subscriptions.
- Remaining settings/model, agent capability, and audio consumers each have a named owner channel and focused payload/routing tests.
- Model/settings UI startup keeps using `DesktopSettingsRuntimeClient.listModels()` and no longer depends on raw backend stream subscription for normal model-list delivery.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js IpcBackendEventChannels AppConfigProvider.models AppStatusProvider AgentSettingsTab ChatInterfaceWiring RendererChatRuntimeBoundary IpcBridge --runInBand` - pass
- `rg -n "IpcBridge\.on\(ON_CHANNELS\.FROM_BACKEND|ON_CHANNELS\.FROM_BACKEND" frontend/src/renderer -S` - pass, no matches
- `cd packages/windie-sdk-js && ELECTRON_RUN_AS_NODE=1 ..\..\frontend\node_modules\electron\dist\electron.exe ..\..\frontend\node_modules\typescript\bin\tsc -p tsconfig.build.json` - pass
- `ELECTRON_RUN_AS_NODE=1 .\frontend\node_modules\electron\dist\electron.exe .\scripts\docs-list.js` - pass
- `git diff --check` - pass

### Settings/Model Startup Ownership

Status: completed and verified.

Changes:

- Moved the dashboard startup model-list session guard from `AppConfigProvider` into `DesktopSettingsRuntimeClient.requestDashboardStartupModelList()`.
- `AppConfigProvider` now delegates startup model refresh to the settings runtime and no longer owns URL-view checks, session guard keys, reconnect model-list policy, or raw backend subscriptions.
- Added settings-runtime tests for cold-start model list, secondary-view suppression, once-per-renderer-session behavior, and startup request failure handling.
- Updated provider tests so backend reconnect and disconnected initial snapshots prove the provider delegates to the settings runtime without calling `listModels()` directly.

Success criteria covered:

- Dashboard startup requests models through the settings runtime once per renderer session; explicit refresh remains available through `DesktopSettingsRuntimeClient.listModels()`.
- `AppConfigProvider` has no raw backend event subscription and no direct model-list connection policy.
- Focused tests cover cold start, backend reconnect, config load from disk, model-list failure, and settings-update acknowledgement.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js DesktopSettingsRuntimeClient AppConfigProvider.models AppConfigProvider.storageAndIpc AppStatusProvider ModelsSection --runInBand` - pass
- `rg -n "listModels\(|LIST_MODELS_REQUEST_GUARD|requestModelListIfNeeded|FROM_BACKEND" frontend/src/renderer/app/providers/AppConfigProvider.jsx -S` - pass, no matches
- `cd packages/windie-sdk-js && ELECTRON_RUN_AS_NODE=1 ..\..\frontend\node_modules\electron\dist\electron.exe ..\..\frontend\node_modules\typescript\bin\tsc -p tsconfig.build.json` - pass
- `ELECTRON_RUN_AS_NODE=1 .\frontend\node_modules\electron\dist\electron.exe .\scripts\docs-list.js` - pass
- `git diff --check` - pass

### Conversation Session Authority Boundary

Status: completed and verified.

Changes:

- Routed SDK `user_message` event promotion through `applyEventChatConversationProjection()` so conversation-event ingress uses the same session projection helper as dashboard/history selection and send-time session creation.
- Preserved legacy `local-user-message` promotion behavior during migration while preventing non-user late events from stealing the active chat focus.
- Added focused ingress tests for active conversation promotion and late-event quarantine.
- Added a renderer boundary test that fails if feature code directly calls `.setActiveConversationRef(...)` instead of routing active conversation selection through session helpers.

Success criteria covered:

- Active conversation mutations route through the session projection helpers or the store implementation itself.
- Renderer feature code no longer directly calls `.setActiveConversationRef(...)`.
- Existing dashboard open-chat, new-chat, send-from-pill, and late-event transcript tests continue to cover the user workflows listed in the plan.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js DesktopChatStreamIngressRuntime ConversationSessionRuntime ChatStreamThinkingStatus.transcript ChatMessageSender UseDashboardConversations ChatProvider ResetActiveChatSession RendererChatRuntimeBoundary --runInBand` - pass
- `rg -n "\.setActiveConversationRef\(|setActiveConversationRef\(" frontend/src/renderer -S` - pass, only transcript runtime facade method remains
- `cd packages/windie-sdk-js && ELECTRON_RUN_AS_NODE=1 ..\..\frontend\node_modules\electron\dist\electron.exe ..\..\frontend\node_modules\typescript\bin\tsc -p tsconfig.build.json` - pass
- `ELECTRON_RUN_AS_NODE=1 .\frontend\node_modules\electron\dist\electron.exe .\scripts\docs-list.js` - pass
- `git diff --check` - pass

### Conversation Persistence Projection Ownership

Status: completed and verified.

Changes:

- No code change was required in this increment. The desktop continuity path already delegates display and rehydrate projection to SDK conversation stores/runtimes through `ConversationContinuityService`, `createConversationRuntime()`, and SDK projection builders.
- Renderer historical chat replay converts SDK `DisplayConversation` rows into UI `ChatMessage` state, but the event-to-display and event-to-rehydrate interpretation tables live in `packages/windie-sdk-js/src/projections/conversationProjections.ts`.
- The existing SDK and renderer tests cover stored-row field preservation, display projection, rehydrate projection, dashboard replay, and backend rehydrate reuse from the SDK projection source.

Success criteria covered:

- Display and rehydrate projections are generated by SDK projection builders from SDK events.
- Desktop continuity adapters do not own the event-to-display or event-to-rehydrate interpretation tables.
- Sidecar/file store tests preserve revision, message index, turn id, tool ids, artifact refs, and workspace binding through SDK stores.
- Renderer dashboard replay and backend rehydrate tests continue to use the SDK projection source.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js WindieSdkConversationRuntime WindieSdkFileConversationStore SdkDisplayChatMessageProjection UseDashboardConversations ConversationReplayActions ConversationInferenceSessionRuntime RendererChatRuntimeBoundary --runInBand` - pass
- `cd packages/windie-sdk-js && ELECTRON_RUN_AS_NODE=1 ..\..\frontend\node_modules\electron\dist\electron.exe ..\..\frontend\node_modules\typescript\bin\tsc -p tsconfig.build.json` - pass
- `git diff --check` - pass

### Tool Execution Routing Ownership

Status: completed and verified.

Changes:

- Added SDK runtime coverage for malformed `tool_bundle_call` events missing `bundle_id`, proving they become explicit `runtime_error` events and do not invoke the local sidecar runtime.
- Added a renderer boundary test that blocks feature code from reintroducing local tool execution IPC or direct tool-result sends.
- Existing SDK/main tests continue to cover single tool execution, bundle execution, local execution failure, backend delivery failure, post-action screenshots, and main-process SDK tool routing through host callbacks.

Success criteria covered:

- Renderer feature code has no local tool execution IPC path.
- Missing `request_id` or `bundle_id` creates an SDK runtime error and does not invoke sidecar execution.
- Tool execution remains owned by SDK runtime coordination with Electron main providing host callbacks.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js WindieSdkConversationRuntime WindieSdkMainRuntime WindieSdkClient WindieSdkMockBackendE2E RendererChatRuntimeBoundary --runInBand` - pass
- `rg -n "sendToolResult|sendToolBundleResult|executeLocalTool|executeTool\(|IpcBridge\.send\('tool-result'|IpcBridge\.send\('tool-bundle-result'|IpcBridge\.send\(SEND_CHANNELS\.TOOL_RESULT|IpcBridge\.send\(SEND_CHANNELS\.TOOL_BUNDLE_RESULT" frontend/src/renderer/features -S` - pass, no matches
- `cd packages/windie-sdk-js && ELECTRON_RUN_AS_NODE=1 ..\..\frontend\node_modules\electron\dist\electron.exe ..\..\frontend\node_modules\typescript\bin\tsc -p tsconfig.build.json` - pass
- `git diff --check` - pass

### Sidecar Bridge Ownership Split

Status: completed and verified.

Changes:

- Moved legacy sidecar stdout buffering, stale-process checks, large JSON parse offload, and JSON-RPC response parsing from `local_backend_bridge.cjs` into `local_backend_stdout_transport.cjs`.
- Moved readiness ping retry/callback ownership into `local_backend_readiness_runtime.cjs`, leaving the supervisor as the process state owner and the readiness runtime as the readiness probe owner.
- Added `local_backend_bridge_rpc_transport.cjs` so sidecar daemon mode and legacy process fallback share one `sendRequest()` / `sendRequestOrError()` interface.
- Moved local backend status payload construction and sidecar event fanout into `local_backend_status_broadcaster.cjs`.
- Moved `store_memory` camelCase/snake_case alias mapping into `local_backend_bridge_rpc_mappers.cjs` and added a boundary test that fails if memory aliases are reintroduced inline in `local_backend_bridge.cjs`.

Success criteria covered:

- `local_backend_bridge.cjs` no longer owns stdout parsing loops, parse offload, readiness callback tokens, or memory field alias mapping inline.
- Readiness retry/callback state has one owner in `local_backend_readiness_runtime.cjs`.
- Sidecar daemon and legacy process fallback use the same request transport interface.
- Mapper tests cover field aliases and guard against adding memory aliases outside the mapper registry.

Verification:

- `cd frontend && ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe .\node_modules\jest\bin\jest.js LocalBackendReadinessRuntime LocalBackendStdoutTransport LocalBackendRpcTransport LocalBackendBridgeRpcMappers LocalBackendStatusBroadcaster LocalBackendBridge.lifecycle LocalBackendBridge.rpc SidecarDaemonManager --runInBand` - pass
- `rg -n "stdout\.on\('data'|readinessCheck|stdoutBuffer|pendingStdoutLines|isDrainingStdoutLines|shouldOffloadJsonParse|parseJsonInWorker|source\.userQuery|source\.assistantResponse|source\.memoryType|source\.userId|source\.sessionId|sidecarDaemonManager\s*&&\s*typeof sidecarDaemonManager\.rpc" frontend/src/main/local_backend_bridge.cjs -S` - pass, no matches

## Pending

- `frontend/src/main/ipc.cjs` composition-root split.
  - In progress: model-list request queueing moved to `frontend/src/main/ipc/ipc_model_list_runtime.cjs` with focused unit tests.
  - In progress: renderer diagnostic log routing moved to `frontend/src/main/ipc/ipc_diagnostics_runtime.cjs` with focused unit tests.
- Frontend/backend websocket contract tests for all message families.
- Diagnostics runtime and redaction boundary.
- Architecture docs current/target/debt updates for remaining duplicate paths.
