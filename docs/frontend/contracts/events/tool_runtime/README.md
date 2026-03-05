---
summary: "Frontend events tool-runtime docs sub-hub for `tool-call`/`tool-output` contract handling, skip-frontend-execution metadata, stale-turn cancellation, and correlation-id semantics."
read_when:
  - When changing renderer handling of `tool-call`, `tool-output`, or `tool-bundle` events.
  - When debugging why tool calls are skipped, cancelled as stale-turn, or correlated to wrong transcript/chat rows.
title: "Frontend Events Tool Runtime Docs Hub"
---

# Frontend Events Tool Runtime Docs Hub

## Deep Pages

- [Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference](tool_call_and_tool_output_recovery_skip_execution_contract_reference.md)

## Related Pages

- [Frontend Contracts Events Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../../../renderer/chat_stream_and_tool_execution_reference.md)
- [Tool Execution and Streaming](../../../runtime/tool_execution_and_streaming.md)
- [Backend Agent Recovery Docs Hub](../../../../backend/agent/recovery/README.md)

## Code Scope

- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/api/processing/formatters/tool_call.py`
- `backend/src/api/processing/formatters/tool_output.py`
