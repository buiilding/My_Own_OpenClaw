---
summary: "Backend tools policy docs sub-hub for interaction allowlist + dev tool-selection filtering, mouse method constraints, and startup OCR/vision gating semantics."
read_when:
  - When changing tool visibility rules across interaction mode and dev selection config.
  - When debugging mouse coordinate-method validation errors, filtered schemas, or OCR/vision startup enablement behavior.
title: "Backend Tools Policy Docs Hub"
---

# Backend Tools Policy Docs Hub

## Deep Pages

- [Tool Policy and Dev Tool Selection Runtime Reference](tool_policy_and_dev_tool_selection_runtime_reference.md)

## Related Pages

- [Frontend Tool Bridge and Policy](../frontend_tool_bridge_and_policy.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)

## Code Scope

- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/llm/parser_validation.py`
- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/core/container/initializer.py`
- `backend/src/core/utils/coordinate_methods.py`
- `tests/backend/test_tool_policy.py`
- `tests/backend/test_dev_tool_selection.py`
