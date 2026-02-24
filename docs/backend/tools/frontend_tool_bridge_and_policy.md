---
summary: "Backend tool surface that is schema-driven and frontend-executed, including policy filtering and sidecar compatibility constraints."
read_when:
  - When adding/removing tools across backend and sidecar.
  - When changing tool allowlist/dev-selection behavior.
title: "Frontend Tool Bridge and Policy"
---

# Frontend Tool Bridge and Policy

WindieOS backend does not execute most tools directly. It exposes tool schemas and waits for frontend/sidecar execution results.

## Registry and Orchestration

Core modules:

- `backend/src/tools/registry.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/remote.py`
- `backend/src/tools/remote_tools/*`

Responsibilities:

- register remote tool stubs
- produce function declarations for model tool-calling
- expose capability metadata
- wait for frontend tool results and return normalized `ToolExecutionBatch`

## Remote Tool Surface

Backend exports remote tool classes for schemas/capabilities such as:

- mouse, keyboard, screenshot, scroll
- switch_tab, wait
- get_open_windows, get_system_stats
- run_shell_command, process
- read_file, replace
- browser

These map to sidecar runtime implementations in `frontend/src/main/python/tools/*`.

## Policy and Filtering

Policy service:

- `backend/src/tools/tool_policy.py`

Current controls:

- interaction-mode allowlist (`config.get_tool_allowlist()` path)
- optional dev tool selection file integration
- method-level validation for mouse coordinate modes (`manual`, `ocr`, `prediction`)
- startup gating for OCR/vision initialization based on allowed methods

Policy is applied to:

- tool name lists
- tool schemas injected into prompt
- method-level argument validation decisions

## Cross-Layer Contract Rule

Tool names expected by backend schemas and sidecar runtime must remain synchronized.

Sidecar explicitly tracks backend-exposed tool names in:

- `frontend/src/main/python/tools/registry.py:EXPOSED_TO_BACKEND_TOOLS`

Mismatch symptoms:

- backend emits tool call that sidecar cannot execute
- sidecar warns: expected backend tools unavailable
- query loop waits/fails until timeout/error path

## Change Workflow

When adding a tool:

1. Add remote tool schema/stub on backend.
2. Add sidecar implementation + arg schema.
3. Add renderer/tool execution handling if required.
4. Update docs for backend + sidecar tool catalogs.
5. Add/adjust tests for contract parity.
