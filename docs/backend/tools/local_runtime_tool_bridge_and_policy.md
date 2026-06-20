---
summary: "Backend tool surface that is schema-driven and dispatched through SDK/main local-runtime execution, including policy filtering and local-runtime parity constraints."
read_when:
  - When adding/removing tools across backend, SDK/main local-runtime dispatch, and Python sidecar adapters.
  - When changing tool allowlist or agent capability behavior.
title: "Local-Runtime Tool Bridge and Policy"
---

# Local-Runtime Tool Bridge and Policy

WindieOS backend does not execute most tools directly. It exposes tool schemas and waits for SDK/main local execution results.

## Registry and Orchestration

Core modules:

- `backend/src/tools/registry.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/tool_catalog.py`
- `backend/src/tools/remote_tools/*`

Responsibilities:

- register remote tool stubs
- produce function declarations for model tool-calling
- expose capability metadata
- wait for SDK-submitted local-runtime tool results and return normalized `ToolExecutionBatch`
  - single-tool and bundle wait timeouts are adaptive for foreground `run_shell_command` calls:
    - baseline wait remains `120s`
    - when `terminate_after_seconds` (and optional shell `wait`) imply longer runtime, backend wait increases with safety buffer
    - bundle waits aggregate shell-step timeout budgets and cap at a bounded maximum

## Remote Tool Surface

Backend exports remote tool classes for schemas/capabilities such as:

- mouse, keyboard, screenshot, scroll
- switch_window, wait
- get_open_windows, get_system_stats
- open_app, run_shell_command, process
- read_file, replace
- browser

These map through SDK/main local-runtime dispatch to Python sidecar adapter
implementations in `frontend/src/main/python/tools/*`.

Current runtime note:

- this remote bridge is direct-name based; the live backend catalog and local-runtime exposed-tool set backed by Python sidecar modules both use concrete tool names such as `mouse_control` and `run_shell_command`
- wrapper envelopes are not registered remote tool names in the current bridge
- backend-owned `web_search` is outside this local-runtime bridge because it never dispatches through SDK/main local-runtime execution
- backend-owned grounded helper tools such as `grounded_mouse_action` and
  `grounded_scroll_action` may be model-visible, but they are not
  local-runtime executable manifest entries; backend preparation rewrites them
  to the executable Python sidecar tools before dispatch

## Policy and Filtering

Policy service:

- `backend/src/tools/tool_policy.py`

Current controls:

- interaction-mode allowlist (`config.get_tool_allowlist()` path)
- agent capability policy from effective `AppConfig`
- method-level validation for mouse coordinate modes (`manual`, `ocr`, `prediction`)
- startup gating for OCR/vision initialization based on allowed methods

Policy is applied to:

- tool name lists
- tool schemas injected into prompt
- method-level argument validation decisions

## Cross-Layer Contract Rule

Tool names expected by backend schemas, SDK/main local-runtime dispatch, and
Python sidecar adapters must remain synchronized.

The local runtime explicitly tracks backend-declared built-in tool names that
must remain locally executable in:

- `frontend/src/main/python/tools/manifest.py:LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`

Mismatch symptoms:

- backend emits tool call that the local runtime cannot execute
- Python sidecar warns: built-in local-runtime tools are unavailable
- query loop waits/fails until timeout/error path

## Change Workflow

When adding a tool:

1. Add remote tool schema/stub on backend.
2. Add local-runtime Python implementation + arg schema.
3. Add renderer/tool execution handling if required.
4. Update docs for backend, SDK/main dispatch, and local-runtime Python tool catalogs.
5. Add/adjust tests for contract parity.

## Deep References

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Browser Remote Schema Surface Reference](browser/browser_remote_schema_surface_reference.md)
- [Tool Policy and Agent Capability Runtime Reference](policy/tool_policy_and_agent_capability_runtime_reference.md)
- [Remote Tool Domain Payload and Request-ID Semantics Reference](remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
