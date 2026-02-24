---
summary: "Backend tools docs sub-hub for frontend-executed tool policy, schema bridge, and tool-result ingress/wait orchestration."
read_when:
  - When changing backend tool schema surface, dev tool selection policy, or sidecar compatibility rules.
  - When debugging tool-result ingress, future resolution, or bundle execution wait behavior.
title: "Backend Tools Docs Hub"
---

# Backend Tools Docs Hub

## Deep Pages

- [Frontend Tool Bridge and Policy](frontend_tool_bridge_and_policy.md)
- [Tool Security Policy and Executor Reference](tool_security_policy_and_executor_reference.md)
- [Tool Result Ingress and Storage Reference](tool_result_ingress_and_storage_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](tool_preparation_and_coordinate_resolution_reference.md)

## Code Scope

- `backend/src/tools/*`
- `backend/src/agent/tools/*`
- `backend/src/api/handlers/tool_result.py`
