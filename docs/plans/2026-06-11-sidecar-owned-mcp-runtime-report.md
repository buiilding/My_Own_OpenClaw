---
summary: "Implementation report for converging WindieOS MCP discovery and execution onto the sidecar local runtime."
read_when:
  - When reviewing sidecar-owned MCP runtime implementation status.
  - When debugging MCP enablement, discovery, stale tool cleanup, dashboard status, or CUA Driver execution routing.
title: "Sidecar-Owned MCP Runtime Report"
---

# Sidecar-Owned MCP Runtime Report

Plan: `docs/plans/2026-06-11-sidecar-owned-mcp-runtime-plan.md`

## Status

Implemented. MCP process lifecycle and tool execution now converge on the
sidecar local runtime for the desktop path. Electron still owns dashboard
presentation, settings persistence, and contribution discovery, but it no
longer owns production MCP tool execution.

## Changes Made

- Added source-based dynamic tool unregister support to the sidecar tool
  registry.
- Extended sidecar MCP registration into a reconcile operation using
  `replace: true`.
- Sidecar MCP refresh now:
  - stops removed/disabled MCP clients,
  - removes stale MCP tools from the local registry,
  - runs `initialize` and `tools/list` for enabled servers,
  - registers exposed MCP tools as sidecar runtime tools,
  - returns per-server statuses and errors.
- Sidecar MCP tools now appear in the local tool manifest with:
  - `execution_target: "sidecar"`,
  - `argument_resolution: "passthrough"`,
  - `mcp_server_id`,
  - `mcp_tool_name`,
  - `extension_id`.
- Added sidecar-authored `mcp.discovery` diagnostics for spawn, request,
  timeout, shutdown, and discovery phases.
- Rewired MCP control refresh to prefer a sidecar local runtime when available.
- Desktop agent startup now passes enabled MCP specs into `WindieClient.wakeUp`,
  letting the SDK register MCPs with the sidecar before building the backend
  handshake manifest.
- MCP enable/disable toggles now persist config, reconcile sidecar MCP state,
  then restart the managed agent so the backend receives a fresh manifest.
- Removed Electron main's production MCP execution interception from the local
  backend bridge; MCP-named tools now route through the same sidecar execution
  path as other dynamic local tools.

## Ownership After Change

| Concern | Owner |
| --- | --- |
| MCP panel UI | Renderer |
| MCP enablement persistence | Electron main |
| MCP spec/contribution discovery | Electron main |
| MCP process launch | Sidecar |
| MCP initialize/tools-list/tools-call | Sidecar |
| MCP execution registry | Sidecar |
| Client manifest transport | SDK runtime |
| Manifest validation and model policy | Backend |
| Tool-result history/model continuation | Backend |

## Deletions / Retired Production Paths

- Electron local backend bridge no longer checks `hasDiscoveredMcpTool` before
  sidecar fallback.
- Electron local backend bridge no longer calls `executeMcpTool` for production
  local tool execution.
- MCP dashboard refresh no longer needs Electron stdio discovery when a sidecar
  local runtime is available.

The older `mcp_runtime.cjs` helpers still exist for focused unit coverage and
fallback behavior when no sidecar runtime is injected. They are no longer the
desktop production execution path.

## Validation

- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/McpControl.test.cjs ../tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs ../tests/frontend/AgentCapabilityHandshake.test.cjs --runInBand`
  - Passed: 3 suites / 18 tests.
- `./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_sidecar_daemon.py tests/sidecar/test_tool_registry.py tests/sidecar/test_windie_sdk_client.py tests/sidecar/test_tool_manifest.py -q`
  - Passed: 50 tests.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_client_tool_manifest.py tests/backend/test_tool_policy.py -q`
  - Passed: 40 tests.

## Remaining Notes

- A live manifest-update websocket contract does not exist today. The desktop
  toggle path restarts the managed agent after successful MCP enable/disable so
  the backend receives a fresh sidecar-derived manifest during handshake.
- Electron still collects normalized MCP specs from contribution files. That is
  intentional for this slice because Electron already owns desktop extension
  discovery and settings UI.
- CUA Driver still depends on `cua-driver` being resolvable from the sidecar
  runtime environment. When it is missing, discovery should report a sidecar
  spawn error and expose no CUA tools.
