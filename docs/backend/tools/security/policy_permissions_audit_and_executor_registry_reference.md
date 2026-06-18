---
summary: "Deep reference for backend core tool-security primitives: fail-closed permission semantics, path/resource checks, audit parameter sanitization + lock-guarded log reads, and removed executor registry behavior."
read_when:
  - When changing tool permission declarations, blocked-tool/path policy, or audit log memory/concurrency controls.
  - When implementing sandboxed execution or resolving stale executor registry references.
  - When resolving stale references to removed `ProcessSandboxedExecutor`, `ToolExecutor`, `DirectToolExecutor`, `get_tool_executor`, or `set_tool_executor`.
title: "Policy Permissions, Audit Sanitization, and Removed Executor Registry Reference"
---

# Policy Permissions, Audit Sanitization, and Removed Executor Registry Reference

## Canonical Modules

- `backend/src/core/security/policy.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/remote_tools/base.py`

## Layer Boundary

Two distinct security layers exist:

1. active tool-surface filtering (`tools/tool_policy.py`)
2. deeper permission/audit primitives (`core/security/policy.py`)

Current production wiring primarily uses layer 1; layer 2 provides hardened
permission and audit primitives for stricter execution boundaries.

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
4. permission declared but not explicitly granted in `granted_permissions` -> deny + violation warning
5. permission declared and explicitly granted -> allow

Permission source order:

- tool instance `required_permissions`
- fallback explicit map `required_permissions[tool_name]`

Declaration is not authorization. `required_permissions` describes what a tool may need; `grant_permission(...)` / `grant_permissions(...)` records the policy decision that the named tool may use that permission.

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
- excluded values are summarized by cheap type/length metadata and are not stringified
- max string length per value: `1024` chars
- bytes-like values are summarized by type and byte length
- list/tuple/set truncation: first `10` entries + truncation marker
- arbitrary objects are summarized by type instead of retained by reference
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

## Removed Executor Registry

`core/security/executor.py` has been removed.

The removed module defined:

- `ToolExecutor` abstract async interface
- `DirectToolExecutor` wrapper around direct `tool.run(...)`
- global thread-safe `_ToolExecutorRegistry`
- `get_tool_executor()` / `set_tool_executor(...)`

Those names were not imported by the live tool-orchestration path and only kept
a future-hook surface alive. There is still no sandboxed executor exposed; add a
concrete isolated execution boundary only with an implemented isolation strategy
and tests.

## Current Integration Reality

Actively wired today:

- `ToolPolicy` allowlist + method constraints shape tool exposure and schema surface

Partially wired/deferred:

- `SecurityPolicy` permission/path/resource checks
- `ToolExecutionAudit` runtime logging integration at dispatch boundaries
- real isolated execution boundary implementation

Remote tools default `required_permissions = set()` in `remote_tools/base.py`.
Sensitive filesystem and shell/process stubs override that default with explicit
filesystem or command-execution permissions so strict `SecurityPolicy`
enforcement can distinguish declared capability from an actual grant.

## Hardening Checklist

1. Define explicit `required_permissions` on each tool class.
2. Grant authorized permissions explicitly for each tool/deployment boundary.
3. Enforce `check_permission` and `check_path_access` at dispatch boundary.
4. Log `ToolExecutionAudit` on both success and failure paths.
5. Decide and implement a concrete sandbox strategy before exposing sandboxed execution.
6. Add tests for deny-by-default, blocked-path/tool behavior, and audit sanitization cycle/depth edge cases.

## Related Pages

- [Backend Tools Security Docs Hub](README.md)
- [Tool Security Policy Reference](../tool_security_policy_and_executor_reference.md)
- [Local-Runtime Tool Bridge and Policy](../local_runtime_tool_bridge_and_policy.md)
