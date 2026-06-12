---
summary: "Implementation report for runtime capability session application across client manifests, backend policy, prompt construction, and traces."
read_when:
  - When resuming the runtime capability session application implementation.
  - When checking validation, commits, decisions, or remaining work for runtime-added MCP/plugin/skill visibility.
title: "Runtime Capability Session Application Report"
---

# Runtime Capability Session Application Report

Plan: `docs/plans/2026-06-12-runtime-capability-session-application-plan.md`

## Status

Complete. Backend runtime capability application, prompt-layer application, SDK
capability revisions, active-session `agent_definition` updates, local
execution route checks, and diagnostics are implemented and validated.

## Starting State

- Existing local branch had one unpushed backend commit:
  `398fdb05a fix(backend): avoid duplicate grounded tool registration`.
- The new plan file was uncommitted before implementation began.
- Live trace evidence from the previous investigation showed:
  - client manifest validation accepted 50 tools
  - MCP manifest contained 36 tools
  - prompt builder received 50 client tool schemas
  - final prompt schema metadata still reported 14 tools and 0 CUA tools
- Code inspection confirmed that accepted client schemas were applied to
  `PromptConstructor.client_tool_schemas`, but the session `ToolPolicy` remained
  cached from stale `agent_available_tools`.

## Checklist

- [x] Create plan for the runtime capability session application redesign.
- [x] Add shared backend helper for applying accepted client capabilities to
      prompt schemas and effective session tool policy.
- [x] Route session-manager client manifest application through the helper.
- [x] Route query-level agent definition manifest application through the
      helper before prompt context rendering.
- [x] Extend traces with effective available-tool and policy-allowed client
      counts.
- [x] Add focused backend regression coverage for prompt-visible CUA-style
      client tools.
- [x] Align detached SDK prompt-preview/query-plan helpers with the same
      runtime capability policy semantics.
- [x] Run focused backend validation.
- [x] Preserve runtime client-tool policy through later session config rewires.
- [x] Perform final inspection pass.
- [x] Commit first backend root-fix slice.
- [x] Validate and apply prompt-layer skill/plugin layers through a shared
      backend trust-boundary helper.
- [x] Stamp prompt metadata with prompt-layer count, ids, revisions, and
      source paths.
- [x] Add SDK capability revision stamping for initial handshakes and live
      manifest updates.
- [x] Allow `update-settings` to carry the full `agent_definition` so active
      sessions apply runtime tools and skills immediately.
- [x] Add stale local-tool route checks against the active client manifest.
- [x] Add capability-generic MCP enablement diagnostics for persist/rebuild.
- [x] Run focused backend, frontend, and SDK package validation.
- [x] Commit completed final slice.

## Changes Made

- Added `backend/src/agent/session/capability_application.py`.
- Updated `SessionConfigService` so stored client manifests update
  `agent_available_tools` and refresh prompt policy, instead of only setting
  `client_tool_schemas`.
- Updated `AgentSession.process_query()` so query-level agent definitions apply
  accepted client tools to policy before prompt construction.
- Preserved `ToolPolicy` as the final gate; no bypass was added.
- Added trace fields:
  - `effectiveAvailableToolCount`
  - `policyAllowedClientToolCount`
- Added regression assertions that accepted `cua_driver__*` tools appear in the
  provider-visible prompt schema surface.
- Updated provider projection to use the current prompt-builder `ToolPolicy`
  instead of constructing a fresh stale policy from config.
- Updated SDK prompt-preview/query-plan helpers so detached debug prompts apply
  accepted runtime tools to config, interaction allowlist, and prompt policy.
- Updated session config rewiring so a later settings/model update preserves
  accepted runtime client schemas and re-merges their names into the rebuilt
  prompt policy.
- Added `backend/src/agent/session/prompt_layers.py` as the backend owner for
  validating, deduping, and applying client prompt layers from skills, AGENTS.md
  layers, custom instructions, and plugin prompt layers.
- Extended backend prompt metadata and system-prompt transparency events with a
  prompt-layer summary, including count, ids, revisions, and source paths.
- Added SDK capability revision stamping in both the TypeScript SDK runtime and
  Electron CJS handshake builder so restarted app sessions and live MCP
  toggles can be correlated by revision.
- Extended `update-settings` to accept a first-class `agent_definition` and
  route it through `SessionManager.set_agent_definition`.
- Updated SDK live manifest updates to send both `tools.client_manifest` and
  the full revisioned `agent_definition`.
- Added SDK conversation trace revision fields to `agent.definition` and
  `mcp.tool`.
- Added SDK local execution route validation so a disabled or stale
  MCP/plugin/local tool call returns an explicit failed result before sidecar
  execution.
- Added capability-generic MCP diagnostics stages:
  `capability_manifest.persist` and `capability_manifest.rebuild`.

## Validation Log

- `python -m py_compile backend/src/agent/session/capability_application.py backend/src/agent/session/session_config_service.py backend/src/agent/session/session.py` - passed.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_session_client_manifest_trace.py tests/backend/test_session_manager.py tests/backend/test_client_tool_manifest.py -q` - passed, 50 tests.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_api_handlers.py::test_update_settings_handler_applies_client_tool_manifest tests/backend/test_websocket_connection.py tests/backend/test_computer_use_schema_contract.py -q` - passed, 35 tests.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_sdk_routes.py::test_prompt_preview_agent_definition_runtime_tools_reach_provider_schemas tests/backend/test_sdk_routes.py::test_sdk_debug_tool_schemas_applies_query_overrides_to_response_shape tests/backend/test_session_client_manifest_trace.py tests/backend/test_session_manager.py tests/backend/test_client_tool_manifest.py -q` - passed, 52 tests.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_api_handlers.py::test_update_settings_handler_applies_client_tool_manifest tests/backend/test_websocket_connection.py tests/backend/test_computer_use_schema_contract.py tests/backend/test_tool_policy.py -q` - passed, 58 tests.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_sdk_routes.py::test_build_debug_tool_schemas_applies_client_schema_policy tests/backend/test_sdk_routes.py::test_prompt_preview_agent_definition_runtime_tools_reach_provider_schemas tests/backend/test_session_client_manifest_trace.py tests/backend/test_session_manager.py tests/backend/test_client_tool_manifest.py -q` - passed, 53 tests.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_session_client_manifest_trace.py tests/backend/test_session_manager.py tests/backend/test_client_tool_manifest.py tests/backend/test_sdk_routes.py::test_build_debug_tool_schemas_applies_client_schema_policy tests/backend/test_sdk_routes.py::test_prompt_preview_agent_definition_runtime_tools_reach_provider_schemas -q` - passed, 54 tests after adding the config-rewire preservation regression.
- `./scripts/python-in-env backend python -m py_compile backend/src/agent/session/capability_application.py backend/src/agent/session/session.py backend/src/agent/session/session_config_service.py backend/src/api/routes/sdk/service.py backend/src/llm/prompts/prompt_constructor.py backend/src/tools/provider_projection.py` - passed.
- `./scripts/python-in-env backend python -m py_compile backend/src/agent/session/capability_application.py backend/src/agent/session/session.py backend/src/agent/session/session_config_service.py backend/src/agent/session/config_runtime.py backend/src/api/routes/sdk/service.py backend/src/llm/prompts/prompt_constructor.py backend/src/tools/provider_projection.py` - passed.
- `git diff --check` - passed.
- `bin/windie docs list` - passed.
- `./scripts/python-in-env backend python -m py_compile backend/src/agent/session/prompt_layers.py backend/src/api/schemas/agent_definition.py backend/src/api/schemas/incoming.py backend/src/api/handlers/settings.py backend/src/agent/session/session.py backend/src/agent/session/session_config_service.py backend/src/api/routes/sdk/service.py backend/src/llm/prompts/prompt_constructor.py backend/src/llm/prompts/prompt_metadata.py backend/src/agent/llm/event_presenter.py backend/src/core/events/streaming_events.py` - passed.
- `./scripts/python-in-env backend python -m pytest tests/backend/test_session_client_manifest_trace.py tests/backend/test_session_manager.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_events.py tests/backend/test_api_handlers.py::test_update_settings_handler_applies_agent_definition tests/backend/test_api_handlers.py::test_update_settings_handler_applies_client_tool_manifest tests/backend/test_incoming_message_contract.py -q` - passed, 99 tests.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/McpControl.test.cjs ../tests/frontend/AgentCapabilityHandshake.test.cjs ../tests/frontend/FrontendBackendWebsocketContract.test.cjs --runInBand --forceExit` - passed, 227 tests. The same run without `--forceExit` reported all tests passed but stayed alive because of an existing open-handle warning.
- `npm --prefix packages/windie-sdk-js run build` - passed.
- `git diff --check` - passed.
- `bin/windie docs list` - passed.
- `cd frontend && npm run lint` - failed on pre-existing unrelated
  `frontend/src/main/ipc.cjs:1139` unused `restartWindieAgent`; this file was
  not touched in the runtime capability slice.
- Broader exploratory run:
  `./scripts/python-in-env backend python -m pytest tests/backend/test_sdk_routes.py tests/backend/test_prompt_constructor_utils.py tests/backend/test_conversation_context.py -q` failed on two prompt-preview expectations unrelated to runtime capability policy:
  `test_sdk_debug_prompt_preview_returns_prompt_transparency_payloads` expects the first prompt message to be `user` while the current implementation returns a leading `system` message, and
  `test_sdk_debug_prompt_preview_applies_agent_definition` expects the custom prompt layer in `prompt_messages[0]` while the current implementation returns the custom system prompt at index 0. The runtime capability regression test in the same file passes.

## Decisions

- Keep the first implementation slice on the existing `client_tool_manifest`
  wire shape. A future larger slice can rename/expand the public contract to
  `client_capability_manifest`.
- Refresh session policy/config in place for capability-only changes instead of
  recreating the LLM client, because the failing invariant is tool policy and
  prompt construction, not provider/model selection.
- For `default_plus_client`, merge accepted client names into an existing
  allowlist only when an allowlist already exists. This preserves unrestricted
  default policy while fixing the stale native allowlist path.
- Runtime client tools must be merged into the effective dev `ToolSelection`
  allowlist as well as `agent_available_tools`; otherwise local dev selection
  can reproduce the same 14-native-tool filtering behavior after validation.
- Provider projection must not build a new `ToolPolicy` when prompt construction
  already has a refreshed policy. It now accepts the current policy as an
  optional argument.
- Session config rewires must reapply runtime tool names to the rebuilt
  prompt-builder policy after preserving `client_tool_schemas`; otherwise a
  later settings update can recreate the same stale dev-selection drop.
- Keep the public wire shape as `agent_definition.tools.client_manifest` for
  this implementation. The new revision metadata is additive under
  `agent_definition.metadata`, so existing clients remain compatible while
  traces can correlate local rebuilds with backend prompt application.
- `update-settings` is now the active-session apply path for runtime
  capability changes. Query-level `agent_definition` remains valid for
  per-turn overrides, but enable/disable/refresh should update active session
  state immediately through settings.
- Stale local tool execution is checked at the SDK coordinator against the
  current client manifest. This intentionally fails before sidecar execution so
  disabled MCP/plugin routes cannot execute after they are removed.

## Final Inspection

- `backend/src/agent/session/session.py` now applies query-level manifests
  through the shared helper before prompt construction and reports accepted,
  effective-available, and policy-allowed counts.
- `backend/src/agent/session/session_config_service.py` now applies stored
  client manifests and agent-definition manifests through the same helper.
- `backend/src/agent/session/config_runtime.py` now preserves runtime client
  tool policy after rebuilding `PromptConstructor`.
- `backend/src/api/routes/sdk/service.py` now aligns detached prompt-preview,
  query-plan, and debug schema helper behavior with the live policy path.
- `backend/src/llm/prompts/prompt_constructor.py` and
  `backend/src/tools/provider_projection.py` no longer create a second fresh
  provider-projection policy when the prompt builder already has the current
  policy.
- Remaining direct `client_tool_schemas` assignments are classified:
  `SessionConfigRuntime` preserves already-applied schemas during config rewire,
  `capability_application.py` is the live apply owner, and SDK debug helpers
  now merge direct schemas into config/prompt policy before returning surfaces.
- Prompt layers now have one backend normalizer and keep optional `revision`
  and `source_path` fields through session state, prompt metadata, and system
  prompt transparency events.
- SDK and Electron startup paths both stamp `client_capability_revision`; live
  MCP registration updates the same `agent_definition` object that later
  conversation turns send.
- Backend traces can correlate SDK revisioned sends with backend
  `client_tool_manifest.*` and `client_prompt_layers.*` events through
  `capabilityRevision`.
