---
summary: "Conceptual agent-loop lifecycle from renderer query send through backend streaming, tool turns, result handling, and completion."
read_when:
  - When explaining or changing how a hosted backend agent turn executes.
  - When debugging query streaming, tool calls, or completion behavior at a high level.
title: "Agent Loop"
---

# Agent Loop

The hosted agent loop is backend-owned, but it depends on SDK/main local
execution for local tools. Treat the loop as a distributed state machine rather
than a single function call.

## Turn Lifecycle

1. **Query send**: renderer chat surfaces call the query-send path, optionally attaching screenshots and system state.
2. **Main-process relay**: Electron main validates websocket readiness, applies settings sync gates, forwards local repo instructions, and sends the backend query.
3. **Backend session routing**: the backend resolves the user/session/conversation, applies runtime config, and starts a query task.
4. **Prompt construction**: backend prompt code builds system instructions, history, tool schemas, capability metadata, model settings, and optional artifact/screenshot context.
5. **LLM streaming**: provider code normalizes chunks, thinking text, tool calls, token usage, and native provider events into backend streaming events.
6. **Tool turn**: backend prepares tool arguments, sends `tool-call` or `tool-bundle` events, waits for SDK-submitted local-runtime results, transforms results for history, and resumes the model.
7. **Completion**: backend emits terminal completion/error/cancel events and commits transcript/history state.

## Owner Modules

- Query handlers and service: private backend implementation
- Agent loop: private backend implementation
- Prompt and LLM stream processing: private backend implementation
- Tool orchestration: private backend implementation
- Renderer stream consumption: `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- SDK/main tool dispatch: `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts`
- Main relay and websocket lifecycle: `packages/windie-sdk-js/src/runtime/Agent.ts`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`

## Failure Modes to Route Correctly

- A malformed model tool call belongs in parser/provider/agent recovery docs, not renderer display code.
- A missing or stale request id belongs in backend tool waiting/result storage or SDK/main tool-dispatch correlation code.
- A renderer event that fails type guards belongs in backend outgoing schema/formatter alignment first.
- A local tool execution error belongs in the local-runtime tool implementation
  or main bridge mapping.

## Deep Docs

- Backend Query Handler and Query Execution Service Runtime Reference (private backend docs)
- Backend Interaction Loop + Tool-Turn Orchestration Reference (private backend docs)
- Backend Tool Result Ingress Reference (private backend docs)
- [Frontend Chat Stream + Tool Execution Reference](../frontend/renderer/chat_stream_and_tool_execution_reference.md)

## Evidence Notes

- A turn is not proven complete until the backend terminal event and the
  renderer projection agree on the same conversation and turn identifiers.
- For tool loops, keep request ids, bundle ids, and tool-call ids visible in the
  evidence so cancellation and stale-result bugs can be routed correctly.
