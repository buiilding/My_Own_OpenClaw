---
summary: "Deep reference for `execution/policies.py`: parser validation recovery prompt contract and bundle detection semantics used by interaction-loop tool turns."
read_when:
  - When changing tool-execution stop conditions, parser-validation corrective guidance, or bundle execution semantics in `backend/src/agent/execution/interaction_loop.py`.
  - When changing parser-validation corrective guidance text emitted by `ParseRecoveryPolicy`.
title: "Execution Policy Iteration, Parse-Recovery, and Bundle Gate Reference"
---

# Execution Policy Iteration, Parse-Recovery, and Bundle Gate Reference

## Canonical Modules

- `backend/src/agent/execution/policies.py`
- `backend/src/agent/execution/interaction_loop.py`
- `tests/backend/test_interaction_loop.py`

## Policy Types

`policies.py` exposes three focused policy classes:

- `ParseRecoveryPolicy`
- `ToolExecutionPolicy`

`InteractionLoop.run_loop()` now only composes the parse-recovery and tool-execution policies. Loop termination is driven by final responses, tool outcomes, and compaction-aware history management instead of a fixed iteration cap.

## ParseRecoveryPolicy Contract

`ParseRecoveryPolicy.build_validation_error_user_message(error_details)` returns a deterministic corrective instruction block used for parser-level validation failures.

Message contract:

- prefixes with `[System Validation Error: <details>]`
- states the tool-call format was invalid
- includes canonical corrective examples for direct tool calls from the live catalog, such as:
  - `mouse_control`
  - `run_shell_command`
- emphasizes direct `functionCall` JSON shape and asks the model to retry with corrected format

This is distinct from stream-time recoverable tool-call error handling (synthetic tool-call/output replay path in interaction loop).

## ToolExecutionPolicy Contract

`ToolExecutionPolicy.is_bundle(tool_call_count)` returns `True` when tool-call count is greater than one.

`InteractionLoop.run_loop()` uses this gate to choose bundle behavior:

- stage tool-call ids with consume-all semantics for bundles
- await bundle completion before next LLM iteration
- process results in `finally` for cleanup in both bundle and non-bundle paths

## Drift Hotspots

1. Editing parser corrective message examples without matching the live direct-tool catalog can teach the model invalid tool names or argument shapes.
2. Changing bundle detection threshold (`> 1`) without updating tool-result staging/await assumptions can desynchronize bundle completion ordering.

## Related Pages

- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [Native Tool-Call Bridge and History Mapping Reference](native_tool_call_bridge_and_history_mapping_reference.md)
