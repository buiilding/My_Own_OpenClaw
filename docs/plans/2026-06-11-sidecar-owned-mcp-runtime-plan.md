---
summary: "Plan to converge WindieOS MCP discovery and execution onto the sidecar local runtime while keeping Electron as UI/config host only."
read_when:
  - When implementing sidecar-owned MCP process lifecycle, discovery, registry, execution, or diagnostics.
  - When changing MCP dashboard controls, client tool manifests, local tool execution, or CUA Driver integration.
  - When removing Electron main MCP execution ownership or reconciling SDK, Electron, sidecar, and backend MCP paths.
title: "Sidecar-Owned MCP Runtime Plan"
---

# Sidecar-Owned MCP Runtime Plan

## Decision

Make the Python sidecar the long-term owner of MCP process lifecycle, discovery,
tool registry, execution, and MCP result normalization.

Electron main remains the native desktop host for settings persistence,
dashboard IPC, permission UX, and status display. It must not remain a parallel
MCP tool runner.

The SDK runtime remains the conversation and transport coordinator: it reads the
local runtime manifest, sends `client_tool_manifest` to the backend, routes
backend `tool-call` events to the local runtime, and returns `tool-result` to
the backend.

Backend remains the model-loop owner: it validates client manifests, applies
tool policy/provider projection, emits executable tool calls, receives
`tool-result`, commits history, and continues the loop.

## Why

MCP servers are arbitrary local executable capability providers. That places
them in the same trust and lifecycle domain as shell, filesystem, browser,
screenshots, and desktop control. WindieOS already assigns that domain to the
sidecar/local runtime.

Keeping MCP execution in Electron main would create two local tool authorities:

- Electron MCP registry and process launcher.
- Sidecar built-in/plugin/runtime tool registry and executor.

That duplication would split process environment handling, timeout behavior,
diagnostics, result normalization, SDK support, and security review. The current
`cua-driver ENOENT` failure is a concrete symptom of that split: Electron is
trying to launch a local executable from an app-process environment that differs
from the intended local runtime environment.

## Current State

- `mcps/cua-driver/mcp.json` declares CUA Driver as a gated MCP with:
  - `command`: `cua-driver`
  - `args`: `["mcp"]`
  - `tool_prefix`: `cua_driver`
  - `requires_user_enable`: `true`
- Electron main currently:
  - Loads MCP specs.
  - Gates them by `agent_enabled_mcp_servers` / `WINDIE_ENABLED_MCPS`.
  - Starts stdio MCP clients.
  - Runs `initialize` and `tools/list`.
  - Projects discovered MCP tools into `client_tool_manifest`.
  - Keeps an in-memory MCP tool registry.
  - Intercepts local tool execution and calls MCP `tools/call` before sidecar
    fallback.
  - Emits `mcp.discovery` app diagnostics.
- Python sidecar also has MCP registration support:
  - `/mcps/register`
  - `register_mcp_server`
  - sidecar runtime tool registration for discovered MCP tools
  - MCP `tools/call` normalization into `success/data.output/mcp_result`
- This means MCP already has two capable paths. The plan is to converge, not add
  a third layer.

## Target Runtime

```text
Renderer MCP panel
  -> Electron main MCP control IPC
  -> Electron persists enabled MCP ids
  -> SDK/Electron asks sidecar to refresh MCP registry
  -> Sidecar starts MCP process
  -> Sidecar initialize + tools/list
  -> Sidecar registers exposed MCP tools in local runtime registry
  -> SDK reads sidecar tool manifest
  -> SDK sends client_tool_manifest to backend
  -> Backend validates/projects accepted tools
  -> Model emits tool call
  -> Backend emits tool-call
  -> SDK routes tool-call to sidecar /execute-tool
  -> Sidecar calls MCP tools/call
  -> Sidecar returns normalized ToolResult
  -> SDK sends tool-result to backend
  -> Backend commits output/history and continues loop
```

Electron may display discovery and execution diagnostics, but the source of
truth for MCP readiness and tool registration becomes the sidecar.

## Ownership Matrix

| Concern | Owner | Notes |
| --- | --- | --- |
| MCP spec files under `mcps/` and extension contribution loading | Electron main initially | Electron may keep repo/app contribution discovery because it already owns desktop extension discovery. It should pass normalized specs to sidecar. |
| User enablement state | Electron main | Persisted in frontend config as today. |
| MCP process launch | Sidecar | Includes command resolution, cwd/env, stdio pipes, timeout, stderr tail, shutdown. |
| MCP protocol client | Sidecar | Owns initialize, tools/list, tools/call, and protocol errors. |
| MCP runtime registry | Sidecar | Exposed tool name maps to server id and raw MCP tool name. |
| Client manifest assembly | SDK/local runtime | Prefer sidecar manifest as source for executable local tools; Electron should stop appending MCP tools itself. |
| Backend manifest validation and policy | Backend | No local MCP process knowledge. |
| Tool call routing | SDK runtime to sidecar | No Electron MCP interception long term. |
| Result normalization | Sidecar | Must put model-facing text in `data.output`; may preserve raw MCP result in `data.mcp_result`. |
| MCP dashboard status | Renderer via Electron IPC | Status is read from sidecar through Electron/SDK bridge. |
| Persistent diagnostics | Sidecar emits, Electron displays/queries | Keep `mcp.discovery` path, but producer should move to sidecar for process/runtime phases. |

## Implementation Phases

### Phase 1: Define The Sidecar MCP Contract

Add or tighten a narrow sidecar-facing MCP contract that Electron/SDK can call.

Required operations:

- `mcp.list_servers` or HTTP equivalent:
  - Returns public MCP registry entries.
  - Includes configured id, display name, enabled state, effective state,
    status label/state, tool count, and sanitized reason.
- `mcp.refresh`:
  - Takes normalized MCP server specs plus enabled ids.
  - Starts or reuses sidecar MCP clients for enabled servers.
  - Stops or unregisters disabled/removed servers.
  - Runs `initialize` and `tools/list`.
  - Returns discovered tools and per-server status/errors.
- `mcp.register`:
  - Existing `/mcps/register` can become the implementation surface if it is
    extended to reconcile removed/disabled servers and report status.
- `mcp.unregister` or reconcile-only behavior:
  - Required to remove stale tools when a gated MCP is disabled or deleted.
- `execute_tool`:
  - Existing sidecar tool execution remains the only execution API needed once
    MCP tools are registered in the sidecar tool registry.

Contract rules:

- Exposed MCP tool names use the current `tool_prefix__tool` convention.
- Sidecar stores raw routing metadata:
  - exposed tool name
  - server id
  - raw MCP tool name
  - command basename for diagnostics
- Tool output must follow the local `ToolResult` contract:
  - success: `true | false`
  - model-facing text in `data.output` on success
  - model-facing failure text in `error` and/or `data.output` on failure
  - raw MCP payload preserved in `data.mcp_result` when safe and useful

### Phase 2: Move Discovery Source Of Truth To Sidecar

Refactor Electron MCP refresh so it no longer runs MCP protocol discovery
itself.

New flow:

1. Electron loads and normalizes MCP specs from repo/app contribution files.
2. Electron applies user enablement state.
3. Electron sends normalized specs and enabled ids to sidecar refresh.
4. Sidecar performs spawn, initialize, tools/list, registry updates, and status
   construction.
5. Electron MCP panel renders sidecar-returned status.

Remove from Electron main as authoritative logic:

- stdio MCP process ownership
- `McpStdioClient` as a production execution path
- Electron `toolRegistry` as production source of truth
- Electron `executeMcpTool` as production tool runner
- Electron fallback declared-schema registration for live MCP execution unless
  retained only as explicit offline diagnostics, not model-visible tools

Temporary compatibility:

- Keep Electron MCP helpers only behind tests or transitional adapters while the
  sidecar path is wired.
- Mark old helpers with a deletion checkpoint in the report and remove them in
  the same implementation if feasible.

### Phase 3: Build Client Manifest From Sidecar MCP Registry

Ensure the normal capability handshake gets MCP tools from the sidecar local
runtime manifest, not from Electron main's separate MCP discovery.

Desired behavior:

```text
sidecar MCP registry
  -> sidecar tool manifest
  -> SDK agent_definition.client_manifest
  -> websocket handshake
  -> backend validation
```

Implementation details:

- Sidecar registered MCP tools should appear in the same manifest feed as other
  local runtime tools.
- Manifest entries must preserve:
  - `name`
  - `description`
  - `execution_target: sidecar`
  - JSON schema
  - `argument_resolution: passthrough`
  - `extension_id` or MCP source id
  - `mcp_server_id`
  - `mcp_tool_name`
- Backend validation should continue treating these as client-local manifest
  tools.
- Built-in backend catalog names must still win for built-in sidecar tools; MCP
  dynamic names should use the MCP-provided schema after validation.

### Phase 4: Remove Electron MCP Tool Execution Interception

Once MCP tools are registered in the sidecar and visible through the manifest,
the local execution path should stop checking Electron's MCP registry before
sidecar fallback.

Delete or retire:

- `hasDiscoveredMcpTool(...)` production execution check.
- `executeMcpTool(...)` production path in Electron main.
- Electron `toolRegistry` as execution routing state.

Keep:

- Electron control IPC.
- Electron config persistence.
- Electron dashboard status rendering.
- Electron ability to ask sidecar to refresh.

After this phase, a model call to `cua_driver__click` should look identical to
any other sidecar dynamic tool call from the SDK/backend perspective:

```text
backend tool-call name=cua_driver__click
  -> SDK local runtime execute_tool
  -> sidecar registry handler
  -> MCP tools/call raw name=click
  -> ToolResult
  -> SDK tool-result
```

### Phase 5: Move MCP Diagnostics Producer To Sidecar

Keep the `mcp.discovery` diagnostics path, but move the authoritative runtime
events to sidecar where spawn/protocol work occurs.

Diagnostics must include sanitized:

- server id
- command basename, not absolute path
- sanitized args summary
- phase:
  - `spawn`
  - `initialize`
  - `tools_list`
  - `tools_call`
  - `shutdown`
- elapsed milliseconds
- timeout milliseconds
- stderr tail
- process error code such as `ENOENT`
- exit code or signal where available

Diagnostics must not include:

- raw env vars
- absolute command paths
- raw MCP request/response payloads
- tool schemas
- tool results
- tokens
- stack traces

Electron may still write high-level control events such as "user toggled MCP",
but spawn/protocol diagnostics should be sidecar-authored.

### Phase 6: Fix Command Resolution For App/Dev Runtime

Solve the current CUA failure as part of sidecar ownership.

Requirements:

- Sidecar command resolution should not depend on Electron app PATH.
- In dev, it should respect the selected local runtime environment, including
  `frontend_jarvis`/`WINDIE_PYTHON_PATH` behavior where relevant.
- In packaged app mode, it should either:
  - use a configured absolute executable path, or
  - resolve through a controlled search path assembled by Windie, or
  - report a clear "not installed" / "path not configured" state.
- CUA Driver status should distinguish:
  - off
  - not installed / command not resolvable
  - spawn failed
  - initialize timeout
  - tools/list failed
  - ready
  - permission required, if detectable from MCP stderr/result

Do not silently fall back to fake schemas for CUA if the process cannot start.
CUA tools should become model-visible only after live discovery succeeds.

### Phase 7: Status And Dashboard Rewire

Update MCP panel behavior:

- List MCP declarations even when disabled.
- Show user enablement state from Electron config.
- Show runtime status from sidecar refresh.
- On enable:
  - persist config
  - call sidecar refresh immediately
  - update panel with sidecar status
  - rebuild or refresh capability manifest if the active agent runtime needs it
- On disable:
  - persist config
  - tell sidecar to unregister/stop server
  - remove tools from local manifest on next handshake/refresh
  - refuse stale execution
- On refresh:
  - call sidecar refresh
  - update status and tool count

The renderer must not inspect local MCP files or decide model-visible policy.

### Phase 8: Tests

Frontend/Electron tests:

- MCP panel lists gated CUA off by default.
- Enable persists config and calls sidecar refresh, not Electron stdio launch.
- Disable persists config and calls sidecar unregister/reconcile.
- Refresh renders sidecar returned statuses and errors.
- Electron execution bridge no longer intercepts MCP tools.
- Capability handshake uses local runtime/sidecar MCP manifest entries.

Sidecar tests:

- Registers MCP tools from live `tools/list`.
- Normalizes schemas to object schemas.
- Maps exposed names to raw MCP tool names.
- Executes MCP `tools/call` through registered runtime tool handler.
- Returns `success/data.output/mcp_result`.
- Handles `isError` as failed `ToolResult`.
- Reconciles removed/disabled MCP servers and removes stale tools.
- Classifies spawn `ENOENT`, initialize timeout, tools/list failure, stderr tail,
  and process exit.
- Does not expose fallback schemas for failed CUA discovery.

SDK tests:

- `wakeUp` registers MCP specs with sidecar/local runtime.
- Sidecar MCP manifest entries enter `agent_definition.client_manifest`.
- Backend `tool-call` to MCP exposed name routes through normal local runtime
  execution.
- SDK sends `tool-result` with matching `request_id`.

Backend tests:

- Client manifest validation accepts MCP dynamic tool entries.
- Rejected MCP schema does not fail the whole session.
- Tool policy/provider projection treats accepted MCP tools like dynamic
  client-local tools.
- Tool result ingress reads `data.output` and ignores `data.mcp_result` for
  model-facing text unless explicitly needed for diagnostics.

Integration/smoke tests:

- Fake stdio MCP server:
  - starts
  - responds to initialize
  - returns one tool from tools/list
  - returns text from tools/call
  - verifies full model-visible manifest and tool-result loop.
- CUA installed smoke, when available:
  - `cua-driver mcp` starts from sidecar runtime
  - tools/list succeeds
  - MCP panel shows ready and tool count
  - no tool is exposed when CUA is missing.

Validation commands expected:

```bash
bin/windie docs list
cd frontend && npm test -- --runTestsByPath \
  ../tests/frontend/McpControl.test.cjs \
  ../tests/frontend/AgentCapabilityHandshake.test.cjs \
  ../tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs \
  --runInBand
./scripts/python-in-env sidecar python -m pytest \
  tests/sidecar/test_sidecar_daemon.py \
  tests/sidecar/test_windie_sdk_client.py \
  tests/sidecar/test_tool_manifest.py \
  -q
./scripts/python-in-env backend python -m pytest \
  tests/backend/test_client_tool_manifest.py \
  tests/backend/test_tool_policy.py \
  tests/backend/test_api_handlers.py \
  -q
cd frontend && npm run lint
git diff --check
```

## Migration Checklist

- [ ] Add/update sidecar MCP status and reconcile API.
- [ ] Make sidecar MCP refresh remove disabled/stale tools.
- [ ] Make sidecar MCP diagnostics durable under `mcp.discovery`.
- [ ] Rewire Electron MCP control refresh to call sidecar, not local stdio.
- [ ] Rewire client manifest assembly to use sidecar MCP registry output.
- [ ] Remove Electron production MCP execution interception.
- [ ] Remove Electron production MCP process/client cache.
- [ ] Preserve dashboard controls and status rendering.
- [ ] Prove CUA missing binary reports `Not installed` without exposing tools.
- [ ] Prove fake MCP ready path appears in manifest and executes through sidecar.
- [ ] Update docs and changelog.
- [ ] Add implementation report with commits, deviations, and validation.

## Security And Reliability Requirements

- Never log raw env vars, tokens, absolute executable paths, raw schemas, or raw
  tool results in diagnostics.
- MCP process stderr may be captured only as a sanitized tail.
- Disabled MCPs must not remain model-visible or executable.
- Failed discovery must not expose CUA tools unless an explicit future offline
  schema policy is approved.
- Tool execution must time out and clean up pending request state.
- Sidecar shutdown should terminate owned MCP child processes.
- Repeated refresh should reuse compatible clients and restart when command,
  args, cwd, or env fingerprint changes.
- Runtime state should survive app dashboard reloads without duplicating MCP
  processes.

## Acceptance Criteria

- CUA Driver off by default appears in MCP panel with no tools exposed.
- Enabling CUA triggers sidecar-owned discovery immediately.
- If `cua-driver` is missing, panel shows `Not installed`, diagnostics show
  sidecar-authored spawn `ENOENT`, and backend receives no CUA tools.
- If a fake MCP server is available, enabling it results in accepted
  `client_tool_manifest` entries.
- A model/tool-call to an MCP exposed name executes through sidecar
  `/execute-tool`, not Electron `executeMcpTool`.
- Tool output returns to backend as normal Windie `tool-result` with
  model-facing text in `data.output`.
- Electron main no longer owns MCP process launch or tool execution in
  production code.
- There is one authoritative MCP execution registry: the sidecar local runtime.

## Open Questions

- Should Electron continue to discover MCP spec files and pass normalized specs
  to sidecar, or should sidecar read contribution directories directly? The
  conservative first step is to keep Electron as config/spec collector because
  it already owns desktop extension discovery, then pass normalized specs over a
  narrow API.
- Should MCP status be pushed as sidecar events or pulled on dashboard refresh?
  Pull is simpler for the first convergence; sidecar events can follow if live
  status changes need to update without user refresh.
- Should command resolution support per-MCP configured absolute paths in user
  settings? Likely yes, but only after the sidecar-owned path is in place so the
  setting feeds the correct runtime.

## Reporting

Create `docs/plans/2026-06-11-sidecar-owned-mcp-runtime-report.md` during
implementation. Keep it updated with:

- commit hashes
- changed ownership boundaries
- deleted Electron MCP execution paths
- sidecar API shape
- validation commands and results
- deviations from this plan
- unresolved blockers
