---
summary: "Backend tool security reference: active ToolPolicy gating, core SecurityPolicy permission/audit primitives, executor registry behavior, and current integration boundaries."
read_when:
  - When changing backend tool permission models, blocked-tool/path policy, or audit logging behavior.
  - When wiring sandboxed executors or debugging permission denials and tool security boundary drift.
title: "Tool Security Policy and Executor Reference"
---

# Tool Security Policy and Executor Reference

## Canonical Modules

- `backend/src/tools/tool_policy.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/remote_tools/base.py`
- `backend/src/core/security/policy.py`
- `backend/src/core/security/executor.py`

## Active Runtime Boundary (Today)

The current backend runtime actively enforces tool exposure via `ToolPolicy`:

- `ToolResultOrchestrator` builds `ToolPolicy.from_config(config)`.
- available tool names are filtered by interaction-mode allowlist + optional dev selection file.
- tool schemas are filtered with the same policy.
- `mouse_control.find_coordinates_by` method-level restrictions are enforced.
- OCR/vision startup initialization decisions can be gated by allowed coordinate methods.

This is the currently wired policy path for tool gating.

## SecurityPolicy Surface (Defined)

`core/security/policy.py` defines a broader security framework:

- `Permission` enum (`read/write filesystem`, `execute_commands`, `network_access`, `computer_control`, `read/write_memory`)
- `ResourceLimits` defaults (timeout, memory/file/network/concurrency slots)
- blocked tool list + blocked path list
- permission checks with fail-closed semantics
- execution audit log storage and filtering

### Permission check behavior

`SecurityPolicy.check_permission(...)` denies access when:

1. tool is blocked
2. tool has no declared permissions (fail-closed)
3. requested permission is outside declared permissions (fail-closed)

Permissions can come from:

- tool instance `required_permissions`
- fallback dictionary `required_permissions[tool_name]`

## Remote Tool Permission Metadata Reality

Remote tools inherit `RemoteToolBase.required_permissions = set()`.

Current remote tool classes do not override this metadata, so if `SecurityPolicy.check_permission(...)` were enforced directly, tool actions would deny by default (no declared permissions).

## Audit Log Memory and Concurrency Guards

`ToolExecutionAudit` + `SecurityPolicy` include hardening details:

- audit deque max length defaults to 1000 (`deque(maxlen=...)`)
- large/sensitive parameter keys (`image`, `screenshot`, `content`, `data`) are excluded
- long strings are truncated to 1KB
- list values are truncated to first 10 entries
- recursive sanitization includes cycle detection + depth limit
- audit log mutation/iteration is protected by `threading.RLock` to avoid concurrent deque mutation errors

## Path and Resource Checks

- `check_path_access(path)` resolves paths and denies entries under blocked roots.
- `check_resource_limits(...)` currently enforces timeout-only logic from `ResourceLimits.timeout`.
- other resource limit fields are defined but not actively enforced in this module.

## Executor Registry and Isolation State

`core/security/executor.py` provides:

- `ToolExecutor` abstract interface
- `DirectToolExecutor` (default, in-process)
- `ProcessSandboxedExecutor` (intentionally not implemented, raises `NotImplementedError`)
- thread-safe global executor registry (`get_tool_executor`, `set_tool_executor`)

Current default execution path is direct executor semantics; sandboxed executor must be implemented before use.

## Integration Status Summary

- Active and wired: `tools/tool_policy.py` filtering and method validation.
- Defined but mostly unhooked in standard tool-orchestration flow: `core/security/policy.py` permission/resource/audit checks and `core/security/executor.py` sandbox abstraction.

## Enablement Checklist (When Hardening Further)

1. Declare explicit `required_permissions` per remote tool class.
2. Add SecurityPolicy checks at concrete execution boundaries (tool dispatch and/or sidecar bridge send path).
3. Attach audit logging on both success and failure tool-result paths.
4. Implement sandboxed executor isolation strategy before selecting `ProcessSandboxedExecutor`.
5. Add tests that assert deny-by-default, blocked paths/tools, and audit truncation behavior.

