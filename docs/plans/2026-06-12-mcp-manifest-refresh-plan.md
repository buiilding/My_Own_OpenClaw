---
summary: "Plan to fix live MCP enablement so sidecar-registered MCP tools reach the active conversation model manifest."
read_when:
  - When debugging enabled MCP tools that are discovered by the sidecar but missing from `tool_schemas_metadata`.
  - When changing MCP enablement, `update-settings` tool-manifest refresh, SDK agent definitions, Electron query payload assembly, or backend client-manifest session updates.
title: "MCP Manifest Refresh Plan"
---

# MCP Manifest Refresh Plan

## User Intent

Fix the current live MCP path so enabling CUA Driver, or any gated MCP, makes
the discovered sidecar MCP tools visible to the next model turn without an app
restart, without using Windie's native computer-use tools as a false positive,
and without creating another duplicated local-tool authority.

The user-visible target is simple:

- Enable CUA Driver in the MCPs panel.
- Discovery/registration succeeds in the sidecar.
- The next chat turn includes `cua_driver__*` tools in
  `agent_definition.tools.client_manifest.tools`.
- Backend prompt transparency reports those tools in `tool_schemas_metadata`.
- If a model calls one, SDK routes it to the sidecar MCP registry.

## Current Evidence

Live diagnostics and the selected conversation show a split-brain path:

- `mcp.enablement` persisted CUA enablement at
  `2026-06-12T02:15:31Z`.
- `mcp.registration` succeeded with `registeredToolCount: 35` and
  `mcpToolCount: 35`.
- The selected conversation
  `conv_cef70c42-809d-4a79-837d-f3621f943d0a` still had only 14 model-visible
  schemas and `cua_any_count: 0`.
- Conversation trace showed:
  - `agent.definition`: `mcpManifestToolCount: 0`
  - `mcp.tool`: `skipped`
  - `provider.call`: `toolSchemaCount: 14`
- Frontend log showed backend rejecting the live refresh:
  `Invalid message format: update-settings.payload.tools: Extra inputs are not permitted`.

## Root Cause

There are two concrete breaks in the live path.

### 1. Backend Rejects The Live Tool-Manifest Settings Update

Commit `751e6f439` added `tools` to the SDK outgoing `update-settings` payload
allowlist and made `WindieAgent.registerMcps(...)` send:

```json
{
  "tools": {
    "mode": "replace_client_manifest",
    "client_manifest": {
      "version": 1,
      "tools": [...]
    }
  }
}
```

But backend `UpdateSettingsPayload` still forbids unknown keys and does not
declare `tools`, so the backend rejects the message before the session client
manifest can update.

### 2. Electron Query Context Shadows The SDK Agent Definition

The desktop query path injects an Electron-generated `agent_definition` before
calling the SDK. That generated definition uses `includeToolManifest: false`, so
it contains workspace/prompt context but no `tools.client_manifest`.

`ConversationRuntime.send(...)` currently only attaches
`this.options.agentDefinition` when the enriched payload does not already have
`agent_definition`. Because the Electron payload already has one, the SDK does
not attach the MCP-capable agent definition. The query carries a manifest-less
definition and backend prompt construction falls back to native Windie tools.

The existing frontend test missed this because it exercises `agent.ask(...)`
without the Electron-generated `agent_definition` already present in the query
payload.

## Architecture Target

Keep the ownership model from the sidecar-owned MCP plan:

- Electron main owns MCP dashboard intent, frontend config persistence, and
  host UI/status.
- SDK owns active agent definition mutation, backend transport, conversation
  runtime, and sidecar local-runtime coordination.
- Python sidecar owns MCP process lifecycle, discovery, local MCP tool
  registry, and MCP execution.
- Backend owns client-manifest validation, session-level model-visible tool
  policy, prompt construction, provider projection, and tool-result loop.

The fixed live path should be:

```text
MCPs panel enable
  -> Electron persists enabled MCP ids
  -> Electron calls active WindieAgent.registerMcps(enabled specs)
  -> SDK asks sidecar /mcps/register
  -> Sidecar registers MCP tools and exposes them via /tools
  -> SDK updates its in-memory agent definition client manifest
  -> SDK sends backend settings update with replacement client manifest
  -> Backend validates and applies the manifest to active/future sessions
  -> Desktop query merges Electron prompt/workspace context with SDK tool manifest
  -> ConversationRuntime trace reports mcpManifestToolCount > 0
  -> Backend tool_schemas_metadata includes cua_driver__* tools
```

No new Electron MCP executor should be added. No backend CUA-specific tool code
should be added.

## Out Of Scope

- Replacing Windie's native computer-use tools with CUA.
- Adding CUA-specific wrapper tools.
- Changing MCP tool naming.
- Adding a marketplace or package-install flow.
- Reworking all frontend settings sync.
- Treating a model's generic "I have computer-use" answer as proof of MCP
  availability. Proof must come from manifests/traces/tool calls.

## Implementation Workflow

### Phase 1: Backend Accepts Tool-Manifest Settings Updates

Read:

- `backend/src/api/schemas/incoming.py`
- `backend/src/api/handlers/settings.py`
- `backend/src/core/validation/validators.py`
- `backend/src/agent/session/session_config_service.py`
- `backend/src/agent/session/manager.py`
- `tests/backend/test_incoming_message_contract.py`
- `tests/backend/test_validation_utils.py`
- `tests/backend/test_session_manager.py`

Implement:

- Add a typed `tools` field to `UpdateSettingsPayload`.
- Keep the accepted shape narrow:
  - `mode`
  - `client_manifest`
- Validate the manifest with the existing backend client-manifest validator.
- Route `tools.mode == "replace_client_manifest"` to the existing
  `SessionConfigService.set_client_tool_manifest(...)` path.
- Apply the manifest to active sessions and remember it for future sessions.
- Keep ordinary config updates flowing through `validate_frontend_config(...)`.
- Reject unsupported `tools.mode` values with a user-facing settings error.

Do not:

- Put raw MCP server specs into backend settings.
- Let backend execute MCP tools.
- Bypass `validate_client_tool_manifest(...)`.

Expected tests:

- Incoming message contract accepts `update-settings.payload.tools`.
- Backend settings handler applies a replacement client manifest.
- Invalid/rejected manifest entries produce diagnostics or user-facing error
  behavior consistent with the existing client-manifest contract.
- Session config tests prove active and future sessions receive the updated
  client manifest.

### Phase 2: SDK Updates Local Agent Definition Before/Around Transport

Read:

- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/transport/WindieAgentSession.ts`
- CJS mirrors under `packages/windie-sdk-js/cjs/...`
- `tests/frontend/WindieSdkClient.test.ts`
- `tests/frontend/WindieSdkConversationRuntime.test.ts`

Implement:

- Ensure `WindieAgent.registerMcps(...)` mutates the SDK agent definition even
  if the backend settings update fails, or make the failure explicit and
  rollback-safe.
- Prefer ordering that preserves local next-turn visibility while still
  surfacing backend update failure:
  1. sidecar register MCP
  2. read sidecar tools
  3. validate/mutate SDK `agentDefinition.tools.client_manifest`
  4. send backend `update-settings` replacement
  5. if backend rejects, throw with a clear error after local trace data shows
     the attempted manifest count
- Add trace data around MCP manifest refresh outcome if current traces are
  insufficient:
  - requested server count
  - sidecar manifest tool count
  - SDK agent-definition manifest tool count
  - backend settings update result

Expected tests:

- `agent.registerMcps(...)` updates `agent.agentDefinition` with MCP tools.
- A rejected backend update does not silently leave the active agent appearing
  refreshed when it is not safe to use, or it leaves local state refreshed and
  reports the backend rejection in a deterministic way. Pick one behavior and
  test it explicitly.
- CJS output matches TS source.

### Phase 3: Merge Electron Context With SDK Tool Manifest

Read:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_chat_query_handlers.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/sdk/agent_definition.cjs`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/transport/WindieAgentSession.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcQueryRuntime.test.cjs`
- `tests/frontend/WindieSdkClient.test.ts`

Implement:

- Stop treating an existing payload `agent_definition` as a reason to omit the
  SDK agent definition.
- Merge these two roles deliberately:
  - Electron-generated definition contributes workspace, AGENTS.md, prompt
    layers, custom instructions, and runtime context.
  - SDK agent definition contributes current tool manifest, plugin/MCP tool
    state, and other runtime capabilities.
- The merged query definition must preserve
  `tools.client_manifest.tools` from the SDK agent definition unless the query
  explicitly provides a replacement non-empty client manifest.
- Existing merge semantics for prompt layers, agents_md, skills, plugins, and
  runtime context must not regress.

Preferred implementation shape:

- Put the merge in the SDK transport/conversation boundary rather than adding
  another Electron-only bridge.
- Reuse or harden the existing `mergeQueryAgentDefinition(...)` helper so
  direct SDK callers and Electron desktop calls share the same behavior.

Expected tests:

- Query payload already has an Electron-generated `agent_definition` without
  `tools.client_manifest`; SDK still sends MCP client-manifest tools.
- Query payload has a deliberate non-empty `tools.client_manifest`; behavior is
  defined and tested.
- Prompt/workspace context from Electron remains present.
- Conversation trace reports `mcpManifestToolCount > 0` for the merged payload.

### Phase 4: Persisted Enablement And Startup Regression Pass

Read:

- `frontend/src/main/extensions/mcp_control.cjs`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/ipc/ipc_frontend_config_handlers.cjs`
- `tests/frontend/McpControl.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`

Inspect:

- Whether `agent_enabled_mcp_servers` remains on disk after renderer config
  saves that do not include MCP keys.
- Whether startup wake-up includes enabled MCP specs from disk.
- Whether `set-mcp-server-enabled` uses the same normalized config that it just
  persisted.

Implement only if inspection finds a remaining defect:

- Preserve main-owned MCP enablement on unrelated settings saves.
- Ensure first `wakeUp(...)` after restart includes enabled MCP specs.
- Add/adjust tests for restart persistence.

### Phase 5: End-To-End Diagnostics And Proof

Read:

- `docs/development/mcp.md`
- `docs/debug/runtime_traces.md`
- `frontend/src/main/diagnostics/app_diagnostics_store.cjs`
- `frontend/src/main/python/sidecar_daemon.py`

Ensure traces can prove each handoff:

- `mcp.enablement`: config persisted and registry refreshed.
- `mcp.registration`: sidecar registered server/tool counts.
- SDK/backend settings refresh: client manifest update attempted/applied.
- `agent.definition`: active query has MCP manifest tools.
- `mcp.tool`: contribution succeeded, not skipped.
- `tool_schemas_metadata`: final provider-visible schemas include MCP tools.

Add diagnostics only where current traces cannot distinguish:

- sidecar registration success but SDK manifest mutation failure
- SDK manifest mutation success but backend settings rejection
- Electron context merge dropping SDK tool manifest

Do not duplicate frontend log spam. Use persistent app diagnostics or
conversation trace depending on whether the event is pre-conversation app state
or turn-scoped query state.

## Validation Commands

Run after implementation:

```bash
bin/windie docs list
./scripts/python-in-env backend python -m pytest tests/backend/test_incoming_message_contract.py tests/backend/test_validation_utils.py tests/backend/test_session_manager.py tests/backend/test_client_tool_manifest.py -q
cd frontend && npm test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/McpControl.test.cjs ../tests/frontend/IpcMainBridge.lifecycle.test.cjs --runInBand
git diff --check
```

Manual/local verification when CUA Driver is available:

```bash
bin/windie diagnostics list --path mcp.enablement --limit 10 --json
bin/windie diagnostics list --path mcp.registration --limit 10 --json
bin/windie trace list --path mcp.tool --limit 20 --json
sqlite3 -json "$HOME/Library/Application Support/windieos/history/history.db" \
  "SELECT turn_ref, json_array_length(event_payload, '$.payload.tool_schemas') AS schema_count, (SELECT count(*) FROM json_each(event_payload, '$.payload.tool_schemas') WHERE json_extract(value,'$.name') LIKE 'cua_driver__%') AS cua_count FROM conversation_events WHERE event_type='tool_schemas_metadata' ORDER BY timestamp DESC LIMIT 5;"
```

Expected proof:

- `mcp.registration.registeredToolCount` remains `35` for CUA.
- A new test conversation has `cua_count > 0` in `tool_schemas_metadata`.
- `agent.definition.mcpManifestToolCount > 0`.
- `mcp.tool.status == succeeded`.
- If the model calls a CUA tool, the tool name is `cua_driver__*`, not native
  `get_open_windows`.

## Success Criteria

- Backend no longer rejects `update-settings.payload.tools` when it contains a
  valid replacement client manifest.
- Backend applies the replacement client manifest to active and future user
  sessions through the existing manifest validation path.
- SDK live `registerMcps(...)` produces an in-memory agent definition with MCP
  tools.
- Desktop queries merge Electron workspace/prompt context with SDK tool
  manifest instead of replacing it.
- The next chat after enabling CUA includes `cua_driver__*` tools in stored
  `tool_schemas_metadata`.
- The MCP panel's Ready state matches actual model-visible availability, or the
  panel exposes a distinct state/reason when registration succeeded but manifest
  propagation failed.
- Existing native Windie computer-use tools still work and are not confused with
  CUA MCP tools.
- No new MCP execution owner is introduced.

## Risks And Decisions To Make During Implementation

- Backend update-settings semantics: decide whether `tools` belongs in
  `update-settings` long-term or whether a new explicit `update-client-manifest`
  message is cleaner. The immediate regression came from adding `tools` on the
  SDK side, so the narrowest fix is backend support for the same contract.
- Backend rejection handling: decide whether SDK local agent definition should
  mutate before backend ACK. A fail-fast model is safer, but the next-turn
  manifest must not silently look refreshed if backend rejected it.
- Manifest merge precedence: a query-supplied non-empty client manifest could
  intentionally override SDK state. The plan should define that explicitly in
  tests instead of relying on object spread order.
- Diagnostics volume: add persistent diagnostics only for handoff boundaries
  that are otherwise invisible.

## Reread Anchors

- `docs/plans/2026-06-12-mcp-manifest-refresh-plan.md`
- Matching report once implementation begins:
  `docs/plans/2026-06-12-mcp-manifest-refresh-report.md`
- `docs/development/mcp.md`
- `docs/tools/tool_schema_policy_change_workflow.md`
- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `pending/compaction_safe_plan_execution.md`
