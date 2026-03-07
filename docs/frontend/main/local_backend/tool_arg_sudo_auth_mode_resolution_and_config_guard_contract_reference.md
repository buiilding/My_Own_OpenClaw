---
summary: "Deep reference for local-backend execute-tool argument normalization: run-shell sudo-auth mode derivation, screenshot display-bounds fallback injection, config-read guardrails, and deep-clone passthrough semantics."
read_when:
  - When changing `execute-tool` argument shaping in `local_backend_bridge.cjs` or `local_backend_bridge_tool_args.cjs`.
  - When debugging shell-tool sudo prompt mode drift (`native` vs `os_prompt`), screenshot display-bounds routing, or malformed/non-object tool args reaching sidecar JSON-RPC.
title: "Tool Arg Sudo-Auth Mode Resolution and Config-Guard Contract Reference"
---

# Tool Arg Sudo-Auth Mode Resolution and Config-Guard Contract Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_tool_args.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `tests/frontend/LocalBackendBridgeToolArgs.test.cjs`

## Runtime Ownership

`local_backend_bridge_tool_args.cjs` owns normalization of `execute-tool` args before JSON-RPC dispatch to sidecar:

- tool-specific augmentation for `run_shell_command`
- screenshot `display_bounds` default injection when available
- deep cloning/pass-through for other tools
- defensive fallback for non-object args

`local_backend_bridge.cjs` consumes this helper inside `ipcMain.handle("execute-tool", ...)`.

## Entry Point Contract

`resolveToolArgs(toolName, args, getFrontendConfig, warn = console.warn)`:

- when `toolName === "run_shell_command"`:
  - delegate to `resolveRunShellCommandArgs(...)`
- otherwise:
  - plain object args -> deep clone (nested objects/arrays detached from caller)
  - non-object args -> `{}`
- when `toolName === "screenshot"`:
  - normalize explicit `args.display_bounds` if present
  - normalize fallback `options.displayBounds` (passed by local-backend bridge from display-affinity runtime)
  - inject fallback into `args.display_bounds` only when explicit bounds are missing/invalid

No input object is mutated.

## Shell Tool Sudo-Mode Contract (`resolveRunShellCommandArgs`)

Base args normalization:

- plain object args -> shallow clone
- all other arg types -> `{}`

Frontend config read:

- if `getFrontendConfig` is a function, call it inside `try/catch`
- config is considered valid only when it is a non-array object
- `agent_full_sudo_enabled === true` sets full sudo mode

Derived field:

- `sudo_auth_mode = "native"` when full sudo enabled
- `sudo_auth_mode = "os_prompt"` otherwise

## Screenshot Display-Bounds Injection Contract

`normalizeDisplayBounds(...)` accepts:

- `x`, `y`, `width`, `height` (finite numeric, rounded; width/height must be positive)
- optional `monitor_id` (non-empty string, trimmed)
- optional nested `desktop_virtual_bounds` with same numeric shape

Invalid bounds resolve to `null`.

Injection rules:

1. normalize caller `args.display_bounds` (explicit)
2. normalize bridge-provided `options.displayBounds` (default)
3. if explicit bounds are valid, preserve them unchanged
4. otherwise, apply normalized default bounds when available
5. for non-screenshot tools, no display-bounds injection path runs

Error guard:

- config-read failures do not throw
- warning log format:
  - `[LocalBackend] Failed to read frontend config for sudo auth mode: <message>`

## Sidecar Dispatch Boundary

`local_backend_bridge.cjs` dispatches normalized args as:

- JSON-RPC method: `execute_tool`
- params:
  - `tool_name: toolName`
  - `args: resolveToolArgs(...)`

Implication:

- shell sudo behavior is policy-driven from frontend config, not raw renderer payload
- renderer cannot bypass sudo mode policy by omitting/forging `sudo_auth_mode`

## Test-Backed Invariants

`tests/frontend/LocalBackendBridgeToolArgs.test.cjs` validates:

- `run_shell_command` -> `sudo_auth_mode: "native"` when `agent_full_sudo_enabled=true`
- `run_shell_command` -> `sudo_auth_mode: "os_prompt"` when false
- config read exception logs warning and still returns `os_prompt`
- non-shell tools return cloned args (same values, new object identity)
- non-shell tools are deep-cloned (nested mutation does not leak to caller payload)
- non-object args normalize to `{}`
- screenshot tools inject normalized fallback `display_bounds` when explicit bounds are absent
- screenshot tools preserve explicit `display_bounds` over fallback affinity bounds
- unified `computer_use` payloads are deep-cloned but otherwise passed through unchanged for sidecar-owned validation

## Drift Hotspots

1. Trusting renderer-supplied `sudo_auth_mode` directly can bypass frontend policy.
2. Regressing deep-clone semantics can let caller-side nested mutation alter in-flight tool requests.
3. Throwing on config-read errors can fail all shell-tool execution instead of defaulting safely.
4. Expanding config truthiness checks without strict object guard can misread invalid config shapes.
5. Injecting fallback screenshot bounds when explicit bounds exist can override intentional monitor targeting from renderer state.

## Related Pages

- [Frontend Main Local-Backend Docs Hub](README.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](rpc_handler_registry_and_payload_mapper_reference.md)
- [Local Backend Bridge Overview and Window Guard Index](../local_backend_bridge_handler_and_window_guard_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
