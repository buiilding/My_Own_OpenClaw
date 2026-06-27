---
summary: "Backend tool security reference: active ToolPolicy gating, core SecurityPolicy permission/audit primitives, removed executor registry behavior, and current integration boundaries."
read_when:
  - When changing backend tool permission models, blocked-tool/path policy, or audit logging behavior.
  - When wiring sandboxed executors or debugging permission denials and tool security boundary drift.
  - When resolving stale references to removed `ProcessSandboxedExecutor`, `ToolExecutor`, `DirectToolExecutor`, or executor registry behavior.
title: "Tool Security Policy Reference"
---

# Tool Security Policy Reference

## Canonical Modules

- `backend/src/tools/tool_policy.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/remote_tools/base.py`
- `backend/src/core/security/policy.py`

## Active Runtime Boundary (Today)

The current backend runtime actively enforces tool exposure via `ToolPolicy`:

- prompt construction, parser validation, provider projection, and startup
  gates build `ToolPolicy.from_config(config)` at their owning boundaries.
- available tool names are filtered by interaction-mode allowlist plus agent capability policy.
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
4. requested permission is declared but not explicitly granted to that tool (fail-closed)

Permissions can come from:

- tool instance `required_permissions`
- fallback dictionary `required_permissions[tool_name]`

Grant state is separate:

- `grant_permission(tool_name, permission)`
- `grant_permissions(tool_name, permissions)`
- `revoke_permission(tool_name, permission)`

This keeps tool metadata as a declaration of required capabilities, not an authorization grant.

## Remote Tool Permission Metadata Reality

Remote tools inherit `RemoteToolBase.required_permissions = set()`, but
sensitive remote stubs override it at the class level:

- `read_file`: `READ_FILESYSTEM`
- `replace`: `READ_FILESYSTEM`, `WRITE_FILESYSTEM`
- `run_shell_command`: `EXECUTE_COMMANDS`
- `process`: `EXECUTE_COMMANDS`

If `SecurityPolicy.check_permission(...)` is enforced directly, these stubs now
declare the machine capability they require before a separate grant authorizes
execution.

## Audit Log Memory and Concurrency Guards

`ToolExecutionAudit` + `SecurityPolicy` include hardening details:

- audit deque max length defaults to 1000 (`deque(maxlen=...)`)
- large/sensitive parameter keys (`image`, `screenshot`, `content`, `data`) are excluded without stringifying their values
- long strings are truncated to 1024 chars
- bytes-like values and arbitrary objects are summarized instead of retained
- list/tuple/set values are truncated to first 10 entries
- recursive sanitization includes cycle detection + depth limit
- audit log mutation/iteration is protected by `threading.RLock` to avoid concurrent deque mutation errors

## Path and Resource Checks

- `check_path_access(path)` resolves paths and denies entries under blocked roots.
- `check_resource_limits(...)` currently enforces timeout-only logic from `ResourceLimits.timeout`.
- other resource limit fields are defined but not actively enforced in this module.

## Removed Executor Registry

`core/security/executor.py` has been removed. The registry exposed only direct
in-process `tool.run(...)` semantics and was not wired into the live
tool-orchestration path, so it acted as a compatibility/future-hook surface
rather than an execution boundary.

The current backend tool execution path is owned by `tools/orchestrator.py` and
the local-runtime bridge. Add a concrete isolated execution boundary there only
when the process/container strategy is implemented and tested.

### Removed Sandbox Executor Placeholder

`ProcessSandboxedExecutor` was removed first, followed by the unused executor
registry itself. The runtime no longer exposes sandboxed executor placeholders,
direct executor wrappers, or registry helpers. Stale searches for
`ProcessSandboxedExecutor removed`, `ToolExecutor`, `DirectToolExecutor`,
`get_tool_executor`, or `set_tool_executor` should route here.

## Integration Status Summary

- Active and wired: `tools/tool_policy.py` filtering and method validation.
- Defined but mostly unhooked in standard tool-orchestration flow: `core/security/policy.py` permission/resource/audit checks.

## Enablement Checklist (When Hardening Further)

1. Declare explicit `required_permissions` per remote tool class.
2. Populate explicit `granted_permissions` for authorized tools/deployments.
3. Add SecurityPolicy checks at concrete execution boundaries (tool dispatch and/or local-runtime bridge send path).
4. Attach audit logging on both success and failure tool-result paths.
5. Implement and test a concrete isolated execution boundary before selecting a sandboxed execution mode.
6. Add tests that assert deny-by-default, blocked paths/tools, and audit truncation behavior.

## Related Pages

- [Backend Tools Security Docs Hub](security/README.md)
- [Policy Permissions, Audit Sanitization, and Removed Executor Registry Reference](security/policy_permissions_audit_and_executor_registry_reference.md)
