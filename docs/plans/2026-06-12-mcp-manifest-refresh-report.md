---
summary: "Implementation report for live MCP manifest refresh and query-time MCP manifest preservation."
read_when:
  - When auditing the June 2026 MCP manifest refresh fix.
  - When debugging MCP tools discovered by the sidecar but missing from model-visible tool schemas.
title: "MCP Manifest Refresh Report"
---

# MCP Manifest Refresh Report

Plan: `docs/plans/2026-06-12-mcp-manifest-refresh-plan.md`

## Status

Complete.

## Checklist

- [x] Backend accepts narrow `update-settings.payload.tools` replacement manifests.
- [x] Backend validates replacement client manifests through the existing client-manifest validator.
- [x] Backend applies replacement manifests to active and future sessions.
- [x] SDK `registerMcps(...)` refreshes the in-memory agent definition deterministically.
- [x] SDK/backend manifest refresh emits diagnostics for the previously invisible handoff.
- [x] Desktop query path preserves SDK MCP manifests when Electron adds prompt/workspace context.
- [x] Persistence/startup pass confirms enabled MCPs survive unrelated settings saves and app restart.
- [x] Conversation traces prove query-time MCP manifest visibility.
- [x] Focused backend and frontend tests pass.
- [x] Fresh design-inspection pass finds no remaining in-scope MCP manifest propagation path.

## Implementation Ledger

### 2026-06-12

- Recovered the approved plan and compaction-safe workflow.
- Ran `bin/windie docs list`; docs navigation is available.
- Confirmed recent related commits:
  - `751e6f439 fix(sdk-mcp): refresh enabled mcp manifests`
  - `d01476e20 feat(frontend-mcp): trace enablement and registration`
  - `1369934b6 fix(frontend-mcp): preserve enablement during startup saves`
  - `5bd270650 fix(sdk): trace mcp manifest tools`
- Memory/context note: previous chat-list diagnostics decision keeps pre-conversation app failures in app diagnostics, not conversation trace. Query-time MCP manifest proof remains conversation trace.
- Backend now declares `tools` on `UpdateSettingsPayload`, filters ordinary config separately, validates replacement manifests with `validate_client_tool_manifest(...)`, and applies results through `SessionManager.set_client_tool_manifest(...)`.
- SDK `updateToolSchemas(...)` mutates the local agent definition before sending backend settings so next-turn local state is deterministic, while backend rejection still propagates as an error.
- SDK transport and conversation runtime now share `mergeQueryAgentDefinition(...)`. The merge keeps SDK client manifests unless the per-query definition provides a non-empty replacement manifest.
- Electron main payload filtering now preserves and narrows `update-settings.payload.tools` to `mode` and `client_manifest`.
- `agent.definition` trace data now includes SDK-vs-query definition presence and SDK-vs-query client-manifest/MCP manifest tool counts. This covers the previous regression where a manifest-less Electron query definition hid the SDK MCP manifest in trace.
- Persistence/startup inspection found existing recent coverage for preserving `agent_enabled_mcp_servers` from latest config or disk during stale renderer saves. No additional persistence patch was needed.

## Validation Log

- `./scripts/python-in-env backend python -m pytest tests/backend/test_incoming_message_contract.py tests/backend/test_validation_utils.py tests/backend/test_session_manager.py tests/backend/test_client_tool_manifest.py tests/backend/test_api_handlers.py::test_update_settings_handler_applies_client_tool_manifest tests/backend/test_api_handlers.py::test_update_settings_handler_rejects_unsupported_tool_manifest_mode -q`
  - Passed: 70 tests.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/FrontendBackendWebsocketContract.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/McpControl.test.cjs ../tests/frontend/IpcMainBridge.lifecycle.test.cjs --runInBand`
  - Passed: 7 suites, 284 tests.
  - Note: Jest printed the existing open-handle warning after the pass summary and did not exit; the runner was manually interrupted after the successful summary.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/FrontendBackendWebsocketContract.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/McpControl.test.cjs ../tests/frontend/IpcMainBridge.lifecycle.test.cjs --runInBand --forceExit`
  - Passed: 7 suites, 284 tests.
- `bin/windie docs list`
  - Passed; docs navigation validated.
- `git diff --check`
  - Passed.
- Earlier broader backend run including all of `tests/backend/test_api_handlers.py` failed in unrelated query-handler assertions because trace events increased processed event counts. The MCP-relevant settings-handler tests passed when run directly.

## Decisions

- Keep Electron as MCP dashboard/config owner, SDK as agent-definition and transport owner, sidecar as MCP registry/execution owner, backend as manifest validation and model-visible policy owner.
- Use the existing backend `update-settings` contract for replacement client manifests because the SDK already sends that shape and backend owns settings/session policy.
- Use the existing `agent.definition` and `mcp.tool` conversation trace paths for query-time manifest proof, with more detailed sanitized counts, instead of adding a duplicate trace path.
- Keep pre-conversation sidecar registration and persistence diagnostics in app diagnostics (`mcp.enablement`, `mcp.registration`).

## Design Inspection

- Backend settings path: `UpdateSettingsPayload` now accepts only the narrow
  `tools` envelope, the handler removes it before normal config validation, and
  valid replacement manifests are validated/applied by existing client-manifest
  and session-manager paths. No backend MCP executor was added.
- Frontend/Electron payload path: Electron's websocket payload filter now keeps
  `tools` and filters nested settings to `mode` and `client_manifest`, matching
  backend `extra=forbid`. This closes the desktop filter drop point.
- SDK transport/query path: direct transport and `ConversationRuntime.send`
  share `mergeQueryAgentDefinition(...)`; manifest-less Electron context no
  longer shadows the SDK client manifest. Non-empty query manifests still have
  explicit replacement semantics.
- SDK MCP registration path: `updateToolSchemas(...)` updates in-memory agent
  definition before backend settings send. Backend update errors still throw.
- Persistence/startup path: no additional patch needed; recent code preserves
  `agent_enabled_mcp_servers` from latest config or disk during stale renderer
  saves, and startup wake-up reads enabled specs from `latestFrontendConfig`.
- Diagnostics path: pre-conversation MCP enablement/registration remains app
  diagnostics; query-time manifest proof is the `agent.definition` plus
  `mcp.tool` conversation trace. Added SDK-vs-query manifest counts to make the
  previous dropped-manifest path visible.

No remaining in-scope duplicate MCP execution owner or unclassified manifest
propagation path was found.

## Commits

- Pending.
