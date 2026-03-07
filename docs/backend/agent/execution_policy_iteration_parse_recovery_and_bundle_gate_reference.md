---
summary: "Deep reference for `execution/policies.py`: iteration/extra-turn loop gates, parser validation recovery prompt contract, and bundle detection semantics used by interaction-loop tool turns."
read_when:
  - When changing max-iteration behavior, extra-turn gating, or tool-execution stop conditions in `backend/src/agent/execution/interaction_loop.py`.
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

- `IterationPolicy`
- `ParseRecoveryPolicy`
- `ToolExecutionPolicy`

`InteractionLoop.run_loop()` composes these policies to keep loop-control rules explicit and testable.

## IterationPolicy Contract

State fields:

- `max_iterations: int`
- `in_extra_turn_after_final_tools: bool = False`

Method semantics:

- `begin_next_iteration(iteration)`:
  - increments loop counter by one
- `should_continue(iteration)`:
  - continue when `iteration < max_iterations`
  - also continue when `in_extra_turn_after_final_tools` is already set
- `mark_tool_execution(iteration)`:
  - when tools execute at/after max iteration, flips `in_extra_turn_after_final_tools=True`
- `can_execute_tools()`:
  - returns `False` once extra-turn mode is active
- `reached_hard_limit(iteration)`:
  - returns `True` only when at/above max iterations and not in extra-turn mode

### Interaction-loop behavior driven by IterationPolicy

`interaction_loop.py` uses this policy to allow one final assistant-only turn after tool execution reaches the max iteration budget:

1. tools execute on a max-iteration turn
2. policy marks extra-turn mode
3. loop allows one more iteration
4. if model tries tools again, loop force-completes instead of dispatching more tools
5. otherwise loop emits normal final assistant completion

This prevents runaway tool loops while still allowing a final natural-language summary after the last tool run.

## ParseRecoveryPolicy Contract

`ParseRecoveryPolicy.build_validation_error_user_message(error_details)` returns a deterministic corrective instruction block used for parser-level validation failures.

Message contract:

- prefixes with `[System Validation Error: <details>]`
- states the tool-call format was invalid
- includes canonical corrective examples for:
  - `computer_use` envelope: `{tool, metadata, arguments}`
  - `system_use` envelope: `{tool, explanation, arguments}`
- emphasizes direct `functionCall` JSON shape and asks the model to retry with corrected format

This is distinct from stream-time recoverable tool-call error handling (synthetic tool-call/output replay path in interaction loop).

## ToolExecutionPolicy Contract

`ToolExecutionPolicy.is_bundle(tool_call_count)` returns `True` when tool-call count is greater than one.

`InteractionLoop.run_loop()` uses this gate to choose bundle behavior:

- stage tool-call ids with consume-all semantics for bundles
- await bundle completion before next LLM iteration
- process results in `finally` for cleanup in both bundle and non-bundle paths

## Drift Hotspots

1. Changing `mark_tool_execution()` trigger conditions without matching interaction-loop usage can silently remove the extra-turn final-answer behavior.
2. Allowing tools while `in_extra_turn_after_final_tools=True` can reintroduce infinite or runaway tool loops.
3. Editing parser corrective message examples without matching current wrapper schema contracts (`computer_use` metadata fields and `system_use` top-level explanation) can teach the model invalid formats.
4. Changing bundle detection threshold (`> 1`) without updating tool-result staging/await assumptions can desynchronize bundle completion ordering.

## Related Pages

- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [Native Tool-Call Bridge and History Mapping Reference](native_tool_call_bridge_and_history_mapping_reference.md)
