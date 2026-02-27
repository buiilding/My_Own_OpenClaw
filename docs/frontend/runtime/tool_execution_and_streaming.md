---
summary: "Detailed renderer streaming and tool-execution runtime: event handling, correlation guards, bundle flow, capture policy, and backend result handoff."
read_when:
  - When changing tool-call event handling or bundle execution semantics.
  - When debugging stale-turn tool outputs, streaming phase transitions, or missing captures.
title: "Tool Execution and Streaming"
---

# Tool Execution and Streaming

## Stream Event Ingestion (`useChatStream`)

Module:

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`

Responsibilities:

- subscribes to backend event channel
- rejects events for inactive conversation references
- tracks stream lifecycle per turn (`awaiting-first-chunk`, `streaming`, tool phases, `complete`, `error`)
- updates chat message rows incrementally for chunk/tool/transparency events
- records assistant/tool transcript events with model context metadata

Handled backend event families:

- LLM thought events
- streaming text chunks + completion
- tool-call/tool-bundle/tool-output events
- system prompt/tool schemas/user full/assistant full transparency events
- token count updates
- structured errors

## Tool Runner (`useToolRunner`)

Module:

- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`

Responsibilities:

- receives `tool-call` and `tool-bundle` events
- guards against stale-turn execution using `streamTracking.activeTurnRef`
- tracks correlation IDs to reject late/out-of-turn results
- sends cancellation-failure payloads (`frontend_stale_turn_cancelled`) when tool events arrive for closed turns
- before computer-use execution (`click`/`type`/`scroll`/`screenshot` paths, excluding `switch_tab`), requests `show-chatbox` so dashboard view is hidden and tool turns continue in chat-pill mode
- applies the same chat-pill handoff rule for bundles when any bundled step matches those computer-use actions

## ToolExecutionService

Module:

- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`

Single tool flow:

1. invoke tool via IPC
2. run auto-capture policy (`ToolExecutionCapture`)
3. optional screenshot artifact upload
4. format tool output with system context
5. emit local UI result callbacks
6. send backend `tool-result` payload (with screenshot/system-state metadata when applicable)

Bundle flow:

1. execute bundle through `ToolExecutionBundleRunner`
2. normalize per-step results
3. compute aggregate status (`success`, `partial_failure`, `failure`)
4. optional single post-bundle screenshot capture/upload
5. send `tool-bundle-result`

## Capture Policy

Computer-use tools trigger capture policy checks via `ensureAutoCapture`:

- default wait and screenshot behavior can vary by tool type
- capture path can be skipped when tool already provides screenshot payload
- resulting screenshot may be uploaded as artifact reference for backend payloads

## Message Formatting and Payload Builders

Supporting modules:

- `MessageFormatter.ts`
- `ToolExecutionPayloads.ts`
- `ArtifactUploader.ts`
- `ToolExecutionInvoker.ts`
- `ToolExecutionLogger.ts`

Responsibilities include:

- shaping `llm_content` payloads
- attaching system-state fields used by backend prompt/runtime normalization
- producing stable bundle/single output payload shapes
- timing + logging instrumentation for tool runtime diagnostics

## Contract with Backend

Outbound payload types from renderer/main:

- `tool-result`
- `tool-bundle-result`

These are consumed by backend handler stack and routed into session tool-result waiting storage for loop continuation.
