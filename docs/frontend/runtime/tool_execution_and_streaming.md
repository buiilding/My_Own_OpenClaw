---
summary: "Renderer streaming and SDK-owned local tool execution runtime: event handling, display projection, local-runtime routing, bundle flow, and backend result handoff."
read_when:
  - When changing tool-call event handling, display projection, SDK/local tool routing, or bundle execution semantics.
  - When debugging stale-turn tool outputs, streaming phase transitions, missing local tool results, or missing captures/artifacts.
title: "Tool Execution and Streaming"
---

# Tool Execution and Streaming

## Stream Event Ingestion

Primary renderer modules:

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/app/runtime/desktopStreamPhaseRuntime.js`
- `frontend/src/renderer/features/chat/hooks/chatStream/*`
- `frontend/src/renderer/app/runtime/desktopChatStream*.ts`

Responsibilities:

- subscribe to backend event fan-out from Electron main
- reject events for inactive or stale conversation/turn references
- track stream lifecycle per turn (`awaiting-first-chunk`, `streaming`, tool phases, `complete`, `error`)
- update chat rows for text, thinking, transparency, tool-call, tool-bundle, and tool-output events
- record visible transcript projections with model/context metadata

The renderer displays tool events. It does not execute backend tool events.

## SDK-Owned Tool Execution

Current execution modules:

- `packages/windie-sdk-js/src/index.ts`
- `packages/windie-sdk-js/src/runtime/AgentClient.ts`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`
- `frontend/src/main/python/tools/**`

Runtime path:

1. Backend emits `tool-call` or `tool-bundle`.
2. SDK conversation/tool runtime normalizes the event, preserves backend IDs, and claims local execution only when a local runtime can execute it.
3. SDK `ToolExecutionCoordinator` invokes the Electron local-tool lifecycle hook
   before local execution.
4. Electron main applies only the scoped desktop surface lease required by that
   tool call, then routes the request to the SDK local runtime.
5. The configured local executor runs the filesystem, shell, browser,
   computer-use, MCP, plugin, or extension tool.
6. SDK conversation/tool runtime sends exactly one `tool-result` or `tool-bundle-result` to backend.
7. Renderer receives display-only events and renders the visible transcript projection.

Correlation rules:

- Preserve backend `request_id` for single tool results.
- Preserve backend `bundle_id` for bundled results.
- Preserve `tool_call_id` for provider-safe history and rehydrate.
- Do not replace missing backend IDs with renderer-generated IDs.
- If execution is claimed and fails, return an explicit failed tool result.

## Bundle Execution

The SDK/main-side local runtime owns bundle execution. Bundle behavior should stay deterministic:

- execute steps in order
- preserve per-step success/failure
- fail explicitly instead of silently dropping the bundle
- send exactly one `tool-bundle-result`
- store/render a bundle output projection that keeps step detail available for debugging

Renderer bundle code should only render and replay bundle projections.

## Surface, Capture, and Artifacts

Surface/capture orchestration is split:

- SDK owns local runtime daemon startup/reuse, local runtime client semantics, and
  tool-result return to backend.
- Electron main owns artifact upload plumbing, window authority, screenshot
  hiding, and display bounds for desktop-local tool execution.
- Electron main owns computer-use surface prep for SDK/main tool execution,
  including dashboard-to-minimal-pill handoff before local execution.
- Renderer send prepares typed screenshot resource requests; SDK/main owns
  screenshot capture and artifact materialization before backend dispatch.
- Backend result payload construction for local tool results belongs to SDK/main, not renderer services.

Retained renderer infrastructure:

- `RuntimeEndpointStore.ts`

Renderer host-capability calls use scoped IPC channels such as
`capture-screenshot-attachment`, `read-attachment-file`, and
`run-browser-action`; renderer code should not call the generic `execute-tool`
bridge directly.

## Contract with Backend

Outbound payload types from SDK/main local-runtime dispatch:

- `tool-result`
- `tool-bundle-result`

These are consumed by backend handler stack and routed into session tool-result
waiting storage for loop continuation. Renderer UI rows are projections and must
not become the source of backend replay truth.

Electron main does not expose manual `sendToolResult` or
`sendToolBundleResult` methods from the app runtime. Tool result delivery stays
inside SDK tool coordination so callers cannot bypass the skip/stale gates,
bundle correlation, or display-only renderer projection path.

## Related Docs

- [Local Tool Channels](../../channels/sidecar_and_tool_channels.md)
- [Tool Execution Lifecycle](../../tools/tool_execution_lifecycle.md)
- [Windie Client Runtime](../../sdk/windie_client_runtime.md)
