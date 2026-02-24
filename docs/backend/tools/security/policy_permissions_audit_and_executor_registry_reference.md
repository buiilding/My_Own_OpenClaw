---
summary: "Deep reference for backend core tool-security primitives: fail-closed permission semantics, path/resource checks, audit parameter sanitization + lock-guarded log reads, and runtime tool-executor registry behavior."
read_when:
  - When changing tool permission declarations, blocked-tool/path policy, or audit log memory/concurrency controls.
  - When implementing sandboxed execution and deciding executor registry switching behavior.
title: "Policy Permissions, Audit Sanitization, and Executor Registry Reference"
---

# Policy Permissions, Audit Sanitization, and Executor Registry Reference

## Canonical Modules

- `backend/src/core/security/policy.py`
- `backend/src/core/security/executor.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/remote_tools/base.py`

## Layer Boundary

Two distinct security layers exist:

1. active tool-surface filtering (`tools/tool_policy.py`)
2. deeper permission/audit/executor primitives (`core/security/*`)

Current production wiring primarily uses layer 1; layer 2 provides hardened primitives for stricter execution boundaries.

## Permission Model (`SecurityPolicy`)

Permission enum surface:

- `read_filesystem`
- `write_filesystem`
- `execute_commands`
- `network_access`
- `computer_control`
- `read_memory`
- `write_memory`

`check_permission(tool_name, permission, parameters, tool_instance?)` fail-closed semantics:

1. blocked tool name -> deny
2. no declared permissions -> deny + security audit log/error
3. permission requested but undeclared -> deny + violation warning
4. declared permission present -> allow

Permission source order:

- tool instance `required_permissions`
- fallback explicit map `required_permissions[tool_name]`

## Resource and Path Checks

`ResourceLimits` fields exist for:

- timeout
- max memory/file size
- max network requests
- max concurrent tools

Current `check_resource_limits(...)` enforcement is timeout-only.

`check_path_access(path)` behavior:

- resolves candidate path and blocked roots
- denies when candidate is inside any blocked root via `Path.is_relative_to(...)`

## Audit Entry Sanitization (`ToolExecutionAudit`)

`ToolExecutionAudit.__post_init__` sanitizes parameters to prevent audit-log memory blowups.

Sanitization controls:

- excluded keys: `image`, `screenshot`, `content`, `data`
- max string length per value: `1024` bytes-ish
- list truncation: first `10` entries + truncation marker
- recursion depth cap: `10`
- cycle detection by object id to avoid infinite recursion

Goal:

- bounded per-entry memory footprint even with large base64 or deeply nested/cyclic input payloads

## Audit Log Retention and Concurrency

Audit retention:

- deque with fixed `maxlen` (default `1000`) for O(1) append/eviction

Thread-safety:

- `RLock` protects both append and snapshot-iteration paths
- prevents concurrent mutation/iteration races (for example `deque mutated during iteration`)

Query surface:

- `get_audit_log(tool_name?, user_id?, limit=100)` applies filters on safe snapshot

## Executor Registry and Isolation Semantics

`core/security/executor.py` defines:

- `ToolExecutor` abstract async interface
- `DirectToolExecutor` (default, in-process)
- `ProcessSandboxedExecutor` placeholder that raises `NotImplementedError`

Runtime registry:

- global thread-safe `_ToolExecutorRegistry`
- `get_tool_executor()` returns current executor
- `set_tool_executor(executor)` atomically swaps executor

Important:

- sandboxed executor does not silently degrade to direct execution; explicit failure prevents accidental insecure assumptions

## Current Integration Reality

Actively wired today:

- `ToolPolicy` allowlist + method constraints shape tool exposure and schema surface

Partially wired/deferred:

- `SecurityPolicy` permission/path/resource checks
- `ToolExecutionAudit` runtime logging integration at dispatch boundaries
- `ProcessSandboxedExecutor` real isolation implementation

Remote tools currently default `required_permissions = set()` in `remote_tools/base.py`; strict `SecurityPolicy` enforcement without per-tool declarations would deny by default.

## Hardening Checklist

1. Define explicit `required_permissions` on each tool class.
2. Enforce `check_permission` and `check_path_access` at dispatch boundary.
3. Log `ToolExecutionAudit` on both success and failure paths.
4. Decide and implement concrete sandbox strategy for `ProcessSandboxedExecutor`.
5. Add tests for deny-by-default, blocked-path/tool behavior, and audit sanitization cycle/depth edge cases.

## Related Pages

- [Backend Tools Security Docs Hub](README.md)
- [Tool Security Policy and Executor Reference](../tool_security_policy_and_executor_reference.md)
- [Frontend Tool Bridge and Policy](../frontend_tool_bridge_and_policy.md)
