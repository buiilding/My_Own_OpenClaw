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

Complete. Backend runtime capability application is implemented, inspected,
validated, and ready to commit.

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
- [ ] Commit completed changes.

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
