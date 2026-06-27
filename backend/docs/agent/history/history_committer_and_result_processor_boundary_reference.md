---
summary: "Deep reference for backend tool result history persistence layering: pure transform, narrow commit adapter, bundle-vs-individual history rows, and cleanup guarantees around request-id/result-storage lifecycle."
read_when:
  - When changing `ToolResultProcessor`/`ResultTransformer`/`HistoryCommitter` responsibilities.
  - When debugging tool result history rows, missing tool-output history commits, or bundle history row duplication.
  - When debugging tool-result memory leaks, missing history rows after bundle execution, or incorrect cleanup of resolved request IDs.
title: "Tool Result History Committer and Result-Processor Boundary Reference"
---

# Tool Result History Committer and Result-Processor Boundary Reference

## Canonical Modules

- `backend/src/agent/tools/processing/processor.py`
- `backend/src/agent/tools/processing/transformer.py`
- `backend/src/agent/history/history_committer.py`
- `backend/src/agent/session/state.py`
- `backend/src/agent/execution/executor.py`
- `backend/src/agent/execution/interaction_loop.py`

## Layering Contract

Three-layer split is explicit:

- `ResultTransformer`: pure transformation, no state mutation
- `HistoryCommitter`: state mutation only (`history.add_tool_output(...)`)
- `ToolResultProcessor`: orchestration (select path, call transform+commit, cleanup request ids)

`Executor` wires these once per session runtime:

- `result_transformer = ResultTransformer()`
- `history_committer = HistoryCommitter(history=session.history)`
- `tool_result_processor = ToolResultProcessor(...)`

## Commit Surface (Narrow Adapter)

`HistoryCommitter.commit(result)` forwards only:

- `result.formatted_message`
- `result.screenshot_data`
- `result.tool_name`
- `result.compaction_facts`

No branching, no validation, no side effects outside history mutation.

## Result Processing Paths

### Atomic bundle path

When `is_atomic_bundle_from_results(...)` is true:

1. derive the shared `bundle_id` from first tool-call metadata via `ExecutionRef`
2. load stored bundle result (`session.get_bundle_result(bundle_id)`)
3. format single message via `BundleResultFormatter`
4. wrap into `ToolResult`, transform once (`tool_name='bundled_tools'`)
5. commit once to history
6. remove bundle result from storage (`session.remove_bundle_result(bundle_id)`) in `finally`
7. return early (skip individual loop)

Outcome: one history tool-output message for whole atomic bundle. If formatting,
transform, or commit raises, the exception propagates but the stored bundle
payload is still removed.

Detection requires every result tool call to resolve to that same `bundle_id`;
mixed bundle result groups fall back to individual result processing.

### Individual result path

For non-bundle (or missing stored bundle result):

1. pre-collect all `request_id` values from result metadata
2. for each result: transform -> commit
3. `finally` block always runs cleanup for collected ids

## Cleanup Guarantees (`finally` Block)

`ToolResultProcessor` cleanup is fail-safe:

- `session.get_result_storage().cleanup_request_ids(all_request_ids)`
- remove resolved tool-call entries (`session.remove_resolved_tool_call(request_id)`)
- periodic TTL cleanup (`cleanup_old_results(max_age_seconds=300)`)

This runs even if transform or commit raises, preventing long-session result-map leaks.

## Interaction Loop Dependency

`InteractionLoop` always calls `tool_executor.process_results(...)` in `finally` when needed. That ensures commit/cleanup path executes even after execution errors/disconnect events.

Bundle special case:

- bundle results may be processed immediately after dispatch
- `results_processed` flag avoids duplicate processing while still preserving cleanup fallback path

## History Payload Expectations

`ResultTransformer` assumes SDK/local-runtime-preformatted `output` and extracts screenshot from:

1. `tool_result.artifacts['screenshot']`
2. `tool_result.data['screenshot']` (dict payload path)

Transformer does not access session/history.

Compaction-specific payload preservation:

- `ResultTransformer` also produces bounded structured `compaction_facts`
- `HistoryCommitter` forwards those facts unchanged into `ConversationHistory.add_tool_output(...)`
- this keeps tool-level identifiers (for example refs, urls, actions, ticket numbers, extraction status) available to the compaction renderer without forcing the summary model to recover them from free-text `output`

Design intent:

- `formatted_message` remains the canonical model-facing tool text for normal chat turns
- `compaction_facts` is a parallel bounded metadata channel used only by history/compaction consumers
- commit path remains narrow and deterministic: transformer computes, committer forwards, history stores

## Drift Hotspots

1. adding logic into `HistoryCommitter` breaks strict separation and makes behavior harder to reason about.
2. skipping pre-collection of request ids reintroduces partial-cleanup leak risk on mid-loop exceptions.
3. removing `finally` cleanup or interaction-loop guaranteed processing leaks result storage in long-lived sessions.
4. changing atomic bundle early-return path can duplicate bundle messages in history.
5. bypassing `compaction_facts` on commit silently regresses compaction quality while leaving normal chat behavior seemingly intact.

## Related Pages

- [Backend Agent History Docs Hub](README.md)
- [Tool-Call-ID Staging and Tool-Output History Row Contract Reference](tool_call_id_staging_and_tool_output_history_row_contract_reference.md)
- [Tool Result Ingress and Storage Reference](../../tools/tool_result_ingress_and_storage_reference.md)
