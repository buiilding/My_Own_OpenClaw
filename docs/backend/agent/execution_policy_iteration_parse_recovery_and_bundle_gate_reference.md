---
summary: "Deep reference for `execution/policies.py`: bundle detection semantics used by interaction-loop tool turns."
read_when:
  - When changing tool-execution stop conditions or bundle execution semantics in `backend/src/agent/execution/interaction_loop.py`.
title: "Execution Policy Iteration and Bundle Gate Reference"
---

# Execution Policy Iteration and Bundle Gate Reference

## Canonical Modules

- `backend/src/agent/execution/policies.py`
- `backend/src/agent/execution/interaction_loop.py`
- `tests/backend/test_interaction_loop.py`

## Policy Type

`policies.py` exposes one focused policy class:

- `ToolExecutionPolicy`

`InteractionLoop.run_loop()` composes the tool-execution policy directly. Loop termination is driven by final responses, tool outcomes, and compaction-aware history management instead of a fixed iteration cap. Malformed model tool-call recovery is owned by `interaction_loop.py` and `tool_call_bridge.py`, not by `policies.py`.

## ToolExecutionPolicy Contract

`ToolExecutionPolicy.is_bundle(tool_call_count)` returns `True` when tool-call count is greater than one.

`InteractionLoop.run_loop()` uses this gate to choose bundle behavior:

- stage tool-call ids with consume-all semantics for bundles
- await bundle completion before next LLM iteration
- process results in `finally` for cleanup in both bundle and non-bundle paths

## Drift Hotspots

1. Changing bundle detection threshold (`> 1`) without updating tool-result staging/await assumptions can desynchronize bundle completion ordering.

## Related Pages

- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [Native Tool-Call Bridge and History Mapping Reference](native_tool_call_bridge_and_history_mapping_reference.md)
