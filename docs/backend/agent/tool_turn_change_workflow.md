---
summary: "Workflow for backend tool-turn changes across model-visible tool calls, preparation, SDK/main dispatch, result waiting, history commit, cleanup, and recovery."
read_when:
  - When changing tool-call parsing, preparation, backend-vs-SDK/main execution routing, tool bundles, request IDs, result waiting, or tool-output history.
  - When a model-visible tool is called but never executes, executes twice, returns to the wrong turn, or corrupts history.
  - When deciding whether a tool bug belongs in backend schema, agent orchestration, SDK/main dispatch, local execution, or SDK result relay.
title: "Tool Turn Change Workflow"
---

# Tool Turn Change Workflow

Use this workflow before changing backend tool-turn behavior. WindieOS has two tool contracts:

- Backend model-facing tools tell the LLM what it can request.
- SDK/main local-runtime tools run local actions and return results.

Client/local-runtime and local-runtime Python code must not import backend tool schema code for parity. Keep parity in docs and tests.

## Tool-Turn Path

1. backend builds model-visible tool schemas.
2. provider returns normalized tool calls.
3. `InteractionLoop` parses response into `ParsedToolCall` entries.
4. history stages assistant tool-call IDs before execution.
5. `ToolPreparer` resolves call parameters, request IDs, screenshots, OCR, and coordinate state.
6. `ToolSender` emits `tool-call` or `tool-bundle` events for SDK/main execution, or runs backend tools immediately.
7. SDK/main dispatches executable tool calls through Electron main to the local runtime.
8. SDK/main sends `tool-result` messages back over websocket.
9. backend routes, stores, and resolves results.
10. result processor commits tool-output history rows and cleans pending state.
11. loop samples the next model turn or finalizes.

## Fast Owner Map

| Symptom or request | First owner | Source roots | Start docs | Tests |
| --- | --- | --- | --- | --- |
| model cannot see a tool or sees the wrong schema | backend tool registry and policy | `backend/src/tools`, `backend/src/tools/tool_selection.py`, `backend/src/tools/registry.py` | [Tool Catalog Matrix](../../tools/tool_catalog_matrix.md), [Backend Tools Hub](../tools/README.md) | `tests/backend/test_tool_registry_schema.py`, `tests/backend/test_tool_policy.py`, `tests/backend/test_tool_selection.py` |
| provider returns tool calls but parser drops them | LLM stream processor and tool-call bridge | `backend/src/agent/llm/llm_stream_processor.py`, `backend/src/agent/execution/tool_call_bridge.py` | [LLM Stream Processor Token Count and Cache Diagnostics Reference](llm/llm_stream_processor_token_count_and_cache_diagnostics_reference.md), [Native Tool-Call Bridge and History Mapping Reference](native_tool_call_bridge_and_history_mapping_reference.md) | `tests/backend/test_llm_stream_processor.py`, `tests/backend/test_interaction_tool_call_bridge.py` |
| tool-call ID or request ID is missing | tool-call bridge, history staging, preparer | `backend/src/agent/execution/tool_call_bridge.py`, `backend/src/agent/history`, `backend/src/agent/tools/preparation` | [Tool-Call-ID Staging and Tool-Output History Row Contract Reference](history/tool_call_id_staging_and_tool_output_history_row_contract_reference.md) | `tests/backend/test_resolved_tool_call_storage.py`, `tests/backend/test_tool_preparer.py` |
| screenshot, OCR, or coordinate arguments are wrong | tool preparation, OCR, and vision services | `backend/src/agent/tools/preparation`, `backend/src/agent/tools/preparation/ocr`, `backend/src/agent/tools/preparation/coordinate_resolution`, `backend/src/services/ocr`, `backend/src/services/vision` | [Backend Tool Preparation and Coordinate Resolution Reference](../tools/tool_preparation_and_coordinate_resolution_reference.md), [Computer Tools](../../tools/computer.md) | `tests/backend/test_tool_preparer.py`, OCR/vision coordinate tests |
| SDK/main never executes a visible tool-call event | backend sender, formatter, SDK tool coordinator | `backend/src/agent/tools/sending`, `backend/src/api/processing/formatters`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts` | [Tool Execution Lifecycle](../../tools/tool_execution_lifecycle.md), [Windie Client Runtime](../../sdk/windie_client_runtime.md) | `tests/backend/test_tool_sender.py`, formatter tests, SDK/main local-runtime dispatch tests |
| bundle waits forever or starts next loop too early | backend sender and result orchestrator | `backend/src/agent/tools/sending`, `backend/src/tools/bundle_execution.py`, `backend/src/tools/orchestrator.py` | [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md) | `tests/backend/test_bundle_execution.py`, `tests/backend/test_tool_result_orchestrator.py` |
| tool result arrives but does not resume model loop | tool-result handler, router, storage, and waiting futures | `backend/src/api/handlers/tool_result.py`, `backend/src/agent/tools/waiting`, `backend/src/tools/orchestrator.py` | [Tool Result Ingress and Storage Reference](../tools/tool_result_ingress_and_storage_reference.md) | `tests/backend/test_tool_result_handler.py`, `tests/backend/test_tool_result_router.py`, `tests/backend/test_tool_result_receiver.py` |
| tool output corrupts replay or provider history | result processor and history committer | `backend/src/agent/tools/processing`, `backend/src/agent/history` | [History Committer and Result-Processor Boundary Reference](history/history_committer_and_result_processor_boundary_reference.md) | `tests/backend/test_tool_result_storage.py`, `tests/backend/test_tool_result_formatting.py`, `tests/backend/test_conversation_history.py` |
| cancellation leaves pending tool calls | query cancellation and history pending-id reconciliation | `backend/src/api/services/query_execution_support/query_execution_cancellation.py`, `backend/src/agent/history` | [Query Lifecycle Change Workflow](../runtime/query_lifecycle_change_workflow.md) | `tests/backend/test_query_execution_cancellation.py`, `tests/backend/test_tool_result_storage.py` |
| malformed tool-call stream should recover | recoverable tool-call error bridge and synthetic output replay | `backend/src/agent/execution/tool_call_bridge.py`, `backend/src/agent/execution/interaction_loop.py`, `backend/src/agent/tools/processing/synthetic_factory.py` | [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md) | `tests/backend/test_interaction_tool_call_bridge.py`, recovery tests |

## Ownership Rules

- Tool visibility and schema policy belong in `backend/src/tools` and backend policy code.
- Provider-specific tool-call normalization belongs in the provider or LLM stream processor, not the renderer.
- Request ID generation, resolved-call state, and coordinate preparation belong in backend agent tool preparation.
- Local execution belongs in SDK/main local-runtime adapters and local-runtime Python implementations, except explicitly backend-executed SDK tools.
- Tool-result websocket ingress belongs in backend API handlers.
- Tool-result waiting, storage, and cleanup belong in backend tool orchestration.
- Replay-safe history formatting belongs in backend history/result processing.

## Change Sequence

1. Identify whether the change is schema, parsing, preparation, dispatch, execution, result ingress, waiting, history, or recovery.
2. Read the matching deep reference and the adjacent consumer doc.
3. Inspect focused tests before editing.
4. Preserve request ID and tool-call ID correlation across every stage.
5. Keep `tool-call` before `tool-output` for synthetic and failed-tool paths.
6. Keep backend-executed and SDK/main local-runtime lanes explicit.
7. Update SDK/main local-runtime and local-runtime Python tests if executable payloads change.
8. Update tool contract docs and the changelog in the same commit.

## Tool Schema Changes

Use this path when the model-visible tool surface changes.

Primary files:

- `backend/src/tools/**`
- `backend/src/tools/registry/**`
- `backend/src/tools/tool_selection.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/core/config/**` when tool visibility depends on config.
- `backend/src/llm/prompts/**` when prompt text or schema context changes.

Validation:

- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_tool_policy.py`
- `tests/backend/test_tool_selection.py`
- provider-specific tool-call tests if a provider adapts schema shape.

Docs to update:

- [Tool Catalog Matrix](../../tools/tool_catalog_matrix.md)
- [Tool Policy Profiles and Capabilities](../../tools/tool_policy_profiles_and_capabilities.md)
- [Backend Tools Hub](../tools/README.md)

## Tool Parsing and Loop Changes

Use this path when providers return tool calls but the agent loop changes how they are interpreted.

Primary files:

- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/tool_call_bridge.py`
- `backend/src/core/types/schemas.py`
- `backend/src/llm/parser_types.py`

Validation:

- `tests/backend/test_llm_stream_processor.py`
- `tests/backend/test_interaction_tool_call_bridge.py`
- `tests/backend/test_interaction_loop.py`
- provider stream tests when native tool-call payloads change.

Do not change renderer tool dispatch to fix a backend parser issue.

## Tool Preparation Changes

Use this path when the tool call is valid but the executable arguments are wrong.

Primary files:

- `backend/src/agent/tools/preparation/preparer.py`
- `backend/src/agent/tools/preparation/validation.py`
- `backend/src/agent/tools/preparation/**`
- `backend/src/services/screen_grounding/**`
- `backend/src/services/ocr/**`
- `backend/src/services/vision/**`

Validation:

- `tests/backend/test_tool_preparer.py`
- coordinate or OCR/vision focused tests.
- SDK/main local-runtime and local-runtime Python screenshot/computer tests if executable payload expectations changed.

Rules:

- Keep model-facing argument shape separate from local-runtime executable shape.
- Keep stale screenshot and coordinate-resolution failures explicit.
- Store synthetic failed results when preparation fails after a request ID exists.

## Dispatch and Waiting Changes

Use this path when a prepared tool is sent to the wrong execution lane, does not wait, or resumes the loop too early.

Primary files:

- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/sending/execution_lanes.py`
- `backend/src/agent/tools/sending/execution_envelope.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/agent/tools/waiting/**`

Validation:

- `tests/backend/test_tool_sender.py`
- `tests/backend/test_single_tool_execution.py`
- `tests/backend/test_bundle_execution.py`
- `tests/backend/test_tool_result_orchestrator.py`
- `tests/backend/test_tool_result_receiver.py`
- `tests/backend/test_tool_result_router.py`

Rules:

- Bundles should wait atomically before the next model iteration.
- Bundles that include backend-executed tools are not supported unless the bundle contract is explicitly redesigned.
- Backend-executed tools may emit progress events, but final result correlation still uses the request ID.
- Synthetic failures should preserve visible event ordering for the frontend.

## Result and History Changes

Use this path when results arrive but replay, compaction, or next-iteration context is wrong.

Primary files:

- `backend/src/api/handlers/tool_result.py`
- `backend/src/agent/tools/processing/**`
- `backend/src/agent/history/**`
- `backend/src/core/messages/**`
- `backend/src/agent/compaction/**`

Validation:

- `tests/backend/test_tool_result_handler.py`
- `tests/backend/test_tool_result_formatting.py`
- `tests/backend/test_tool_result_storage.py`
- `tests/backend/test_resolved_tool_call_storage.py`
- `tests/backend/test_conversation_history.py`
- `tests/backend/test_history_compaction_engine.py`

Rules:

- Tool-output rows must remain provider-replay safe.
- Assistant tool-call rows and tool-output rows must retain linkable IDs.
- Result processing cleanup must run even after exceptions.
- Compaction should not erase required tool-call/tool-output linkage.

## SDK/Main and Sidecar Boundary

If executable payloads change, update SDK/main local-runtime and sidecar docs/tests with the backend change.

SDK/main owners:

- `packages/windie-sdk-js/src/tools/**`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`

Local-runtime implementation owners:

- `frontend/src/main/python/tools/**`
- `frontend/src/main/python/core/**`

Start docs:

- [Local-Runtime Tool Change Workflow](../../frontend/local_runtime_tool_change_workflow.md)
- [Local Tool Channels](../../channels/sidecar_and_tool_channels.md)
- [Tool Execution Lifecycle](../../tools/tool_execution_lifecycle.md)

## Review Checklist

- The change names the tool-turn stage it owns.
- Model-facing schema and executable local-runtime payload remain separate.
- Request IDs and tool-call IDs survive parse, preparation, dispatch, wait, result, and history.
- Synthetic failures emit client-visible events in the same order as real tool calls.
- Bundle behavior stays atomic or the contract is explicitly updated.
- Cancellation reconciles pending tool-call history rows.
- Producer and consumer tests cover every changed boundary.
- Docs and changelog describe any contract change.

## Related Docs

- [Backend Agent Docs Hub](README.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Query Lifecycle Change Workflow](../runtime/query_lifecycle_change_workflow.md)
- [Tool Execution Lifecycle](../../tools/tool_execution_lifecycle.md)
- [Tool Contracts](../../tools/tool_contracts.md)
- [Backend Tools Hub](../tools/README.md)
- [Local-Runtime Tool Change Workflow](../../frontend/local_runtime_tool_change_workflow.md)
