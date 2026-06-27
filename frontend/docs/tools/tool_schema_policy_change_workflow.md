---
summary: "Workflow for changing model-visible tool schemas, policy gates, provider projection, local-runtime parity, SDK/local execution, and tool-result contracts."
read_when:
  - When adding, removing, renaming, hiding, exposing, or changing a model-visible tool.
  - When changing tool argument schemas, descriptions, capability gates, profiles, coordinate methods, provider-native projections, local-runtime executable payloads, or local-runtime Python registry exposure.
  - When debugging a tool that is present in code but missing from the prompt, visible to the model but not executable, rejected before dispatch, or mismatched between backend and local-runtime executable schemas.
title: "Tool Schema and Policy Change Workflow"
---

# Tool Schema and Policy Change Workflow

Use this workflow before changing anything that affects what tools the model can see or call. Tool behavior is split across client-provided local tool manifests, backend remote-tool schemas, backend policy gates, provider projection, SDK/main local execution orchestration, Electron IPC, and local-runtime executable implementation backed by local-runtime Python.

The core rule is: backend owns backend remote tools, backend-tool argument validation, manifest envelope/trust checks, policy, and provider projection. The Agent SDK and local-runtime host own client/local-runtime tool schemas and local executable authority; local-runtime Python provides the current concrete local tool implementations. Do not make the client/local-runtime Python implementation import backend schemas to avoid drift. Keep parity explicit in tests and docs.

## Fast Owner Map

| Change or symptom | First owner | Code roots | Start docs | Focused tests |
| --- | --- | --- | --- | --- |
| add or change a client/local-runtime tool schema | Agent SDK/local-runtime manifest, then backend manifest envelope/policy checks | public `frontend/src/main/extensions/tool_manifest.cjs`; backend `backend/src/tools/client_manifest.py` | [Tool Contracts](tool_contracts.md) | manifest builder tests, backend manifest validation tests |
| add, remove, or rename a model-visible remote tool | backend tool catalog | `backend/src/tools/tool_catalog.py`, `backend/src/tools/remote_tools/*` | [Tool Catalog Matrix](tool_catalog_matrix.md), Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference (private backend docs) | `tests/backend/test_remote_tool_contract.py`, `tests/backend/test_tool_registry_schema.py` |
| change a tool argument schema or description | backend schema model and remote stub | `backend/src/tools/{computer,system,filesystem}/schemas.py`, browser `frontend/src/main/python/windie_shared/browser_contract*.py`, `backend/src/tools/remote_tools/*`, `backend/src/tools/schema_fields.py` | [Tool Contracts](tool_contracts.md), Backend Tools Contracts Hub (private backend docs) | backend schema tests plus `tests/sidecar/test_shared_tool_schema_parity.py` when executable fields should match |
| hide or expose tools by profile, interaction mode, disabled tools, capabilities, provider health, or browser toggle | backend policy | `backend/src/tools/tool_policy.py`, `backend/src/tools/agent_capability_policy.py`, `backend/src/tools/provider_health.py`, `backend/src/tools/tool_selection.py` | [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md), Tool Policy and Agent Capability Runtime Reference (private backend docs) | `tests/backend/test_tool_policy.py`, `tests/backend/test_tool_selection.py`, `tests/backend/test_provider_health_policy.py` |
| change OCR, vision, manual coordinate method availability or validation | backend tool policy and preparation | `backend/src/tools/tool_policy.py`, `backend/src/tools/computer/schemas.py`, `backend/src/agent/tools/preparation/*` | [Computer Tools](computer.md), Tool Preparation and Coordinate Resolution Reference (private backend docs) | `tests/backend/test_tool_policy.py`, `tests/backend/test_tool_preparer.py`, `tests/backend/test_computer_use_schema_contract.py` |
| backend rejects a backend-executed tool call before execution | backend parser/preparation validation | `backend/src/agent/tools/preparation/validation.py`, backend tool `args_model`, parser tests | Tool Turn Change Workflow (private backend docs), [Tool Troubleshooting](tool_troubleshooting.md) | `tests/backend/test_interaction_tool_call_bridge.py`, backend-tool validation tests |
| Local runtime says tool not found or rejects executable args | Local-runtime registry/schema implementation | `frontend/src/main/python/tools/registry.py`, `frontend/src/main/python/tools/manifest.py`, `frontend/src/main/python/tools/**` | [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md), [Local-Runtime Tool Catalog and Execution Model](../frontend/sidecar/tool_catalog_and_execution_model.md) | `tests/sidecar/test_tool_registry.py`, `tests/sidecar/test_tool_schemas.py`, tool-specific local-runtime Python tests |
| SDK/main drops fields, result ids, artifacts, screenshots, or bundle metadata | SDK conversation/tool runtime and SDK local-runtime bridge | `packages/windie-sdk-js/src/index.ts`, `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/Agent.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` | [Tool Execution Lifecycle](tool_execution_lifecycle.md), [Local Tool Channels](../channels/sidecar_and_tool_channels.md) | SDK conversation/tool-runtime tests and backend tool-result tests |
| provider-specific tool payload differs from canonical function schemas | backend provider projection/provider adapter | `backend/src/tools/provider_projection.py`, `backend/src/llm/providers/*`, `backend/src/llm/prompts/*` | [Provider Change Workflow](../providers/provider_change_workflow.md), Prompt Context Change Workflow (private backend docs) | provider tests plus prompt/schema tests |
| tool-result history, request ids, bundle output, or cleanup changes | backend agent tool-turn runtime | `backend/src/agent/tools/sending`, `backend/src/agent/tools/waiting`, `backend/src/agent/tools/processing`, `backend/src/agent/history` | Tool Turn Change Workflow (private backend docs), [Tool Execution Lifecycle](tool_execution_lifecycle.md) | `tests/backend/test_tool_result_*`, `tests/backend/test_bundle_execution.py`, frontend bundle/result tests |

## Boundary Rules

- Backend owns backend remote-tool schemas, fallback provider-visible catalog
  entries, client-manifest envelope/trust validation, visibility policy,
  provider projection, backend-executed tool argument validation, tool-result
  ingestion, and history conversion.
- Agent SDK and the local-runtime host own client/local-runtime schemas and local executable authority; local-runtime Python provides the current concrete local tool implementations.
- SDK/main owns streamed tool-call consumption for execution, single/bundle local orchestration, and backend result envelope submission.
- Renderer owns streamed tool-call/tool-output display projection and transcript rendering.
- Electron main owns the local tool execution adapter, scoped renderer host
  capability channels, SDK local-runtime host context, display/window context,
  and local-runtime availability status.
- The local runtime owns local executable tool registry authority and actual local machine actions through the local-runtime Python implementation.
- Backend-only tools such as `web_search` do not need local-runtime executable parity, but they still need policy and provider capability tests.
- Local-runtime helper behavior implemented only inside local-runtime Python must not be model-visible until the backend catalog and policy deliberately expose it.
- Exact schema parity is required only where accepted client/local-runtime model-facing args are also local-runtime executable args. Grounded tools can intentionally differ when backend preparation resolves them into simpler executable payloads.
- Provider-native declarations may be added after canonical filtering, but policy must still prevent disabled grounded function schemas from leaking to the model.
- Client manifest validation is partial and structural: accepted entries can be exposed while rejected entries are reported as diagnostics. Do not turn one rejected extension tool into a whole-session failure unless the websocket contract intentionally changes.
- Client schemas own explicitly overridable built-in local tools. They must not add arbitrary backend execution targets.

## Model-Facing Tool Schema Path

1. `backend/src/tools/tool_catalog.py` lists catalog entries and resolves remote tool classes.
2. Each remote tool class exposes a class-level `build_tool_spec()` through its SDK `Tool` base.
3. `ToolRegistry` registers catalog entries, stores prebuilt canonical tool specs, and registers backend-only tools such as `web_search`.
4. `SchemaRegistry` validates and caches canonical function tool schemas.
5. `client_tool_manifest` entries are structurally validated into accepted client/local-runtime function schemas or rejected diagnostics; accepted local tool schemas are not replaced by backend catalog schemas.
6. Prompt construction merges accepted client schemas with backend registry schemas while avoiding unsupported duplicate names.
7. `ToolPolicy` filters names and schemas by config, profile, available tools, disabled tools/capabilities, provider health, browser toggle, web-search availability, and agent capability policy.
8. Provider projection can adapt the filtered schema set for provider-specific transports.
9. Prompt construction sends the final model-visible schema set to the provider and transparency events.

## Client Manifest Change Path

1. Decide whether the tool is a client/local-runtime tool, an override of an allowed built-in, or a backend remote tool.
2. For client/local-runtime tools, define `name`, `description`, `schema`, `execution_target`, and `argument_resolution`.
3. Keep the developer-authored extension field named `schema`; let backend validation normalize it into the flat function schema.
4. Use `execution_target=local_runtime` unless the tool name is a reserved backend tool that the backend already knows how to execute.
5. Use `argument_resolution=passthrough` when model args are executable as emitted.
6. Use `argument_resolution=backend_grounding` only when backend preparation has a concrete owner and tests for the transformation.
7. Add validation for accepted entries, rejected entries, duplicate names, reserved backend names, oversized manifests, unsupported schema keys, and disabled tools.
8. Confirm prompt transparency reports accepted/rejected manifest entries and final tool schemas clearly enough to debug what the model saw.

## Executable Tool Path

1. Model emits a tool call using the final model-facing schema.
2. Backend parser validates the call against the registered tool `args_model` only when the backend owns execution.
3. Preparation resolves backend-only or grounded fields such as OCR text, prediction targets, candidate ids, and screenshots; passthrough executable payload shape is left to SDK local-runtime validation.
4. Backend sends `tool-call` or `tool-bundle` events to the SDK runtime with executable payloads and request ids.
5. Agent SDK runtime dispatches local execution through Electron main.
6. Electron main forwards the executable request to the SDK local runtime daemon/JSON-RPC bridge.
7. Local-runtime executable registry backed by local-runtime Python modules executes the local tool implementation and returns a normalized result.
8. Agent SDK runtime submits `tool-result` or `tool-bundle-result` back to the backend.
9. Backend transforms the result into model-facing history and resumes the loop.

## Add a New Local Runtime Tool

1. Decide whether the tool should be model-visible, internal-only, or future-only.
2. Add or update the Agent SDK/local-runtime manifest entry that defines the model-facing local schema.
3. Add a fallback `ToolCatalogEntry` in `backend/src/tools/tool_catalog.py` only when hosted/default backend exposure still needs one.
4. Add policy gates when the tool depends on permissions, browser runtime, provider health, workspace state, local authority, or a capability family.
5. Add or update backend preparation only if model-facing fields must be grounded or translated before local execution.
6. Add the local-runtime Python implementation and register it in `frontend/src/main/python/tools/registry.py`.
7. Add the tool name to `BUILTIN_TOOL_ORDER` in `frontend/src/main/python/tools/manifest.py` only if backend parity should require it.
8. Update SDK/main local execution code only if the tool needs special handling for screenshots, artifacts, display context, bundle behavior, or result shaping.
9. Update docs:
   - [Tool Catalog Matrix](tool_catalog_matrix.md)
   - [Tool Contracts](tool_contracts.md)
   - [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
   - family-specific docs such as [Computer Tools](computer.md), [Browser Tool](browser.md), or [Filesystem and Shell Tools](filesystem_shell.md)
   - local-runtime Python docs when executable behavior changes

## Change an Existing Tool Schema

1. Find the model-facing owner from [Tool Catalog Matrix](tool_catalog_matrix.md).
2. For client/local-runtime tools, edit the client/local-runtime manifest source first. For backend-executed tools, edit the backend Pydantic args model and remote tool first.
3. Decide whether the local-runtime executable arguments must match:
   - exact parity local tools: update the client manifest and local-runtime executable schema together
   - grounded tools: update backend preparation so model-facing fields are stripped or resolved before dispatch
   - backend-only tools: update backend parser/provider tests only
4. Update shared field factories in `backend/src/tools/schema_fields.py` when multiple tools need the same wording or validation field.
5. Update `tests/sidecar/test_shared_tool_schema_parity.py` for exact-parity coverage or intentional exceptions.
6. Update SDK/main and renderer display tests if streamed payload fields, request ids, artifacts, screenshots, or bundle result fields change.
7. Regenerate or refresh any prompt/schema artifacts only through the live prompt path when the model-visible schema snapshot changes.

## Change Tool Visibility or Capability Policy

1. Identify which input owns the decision:
   - `interaction_mode`
   - `agent_tool_profile`
   - `agent_available_tools`
   - `agent_disabled_tools`
   - `agent_disabled_capabilities`
   - `agent_provider_unavailable_capabilities`
   - `agent_coordinate_methods`
   - `agent_available_coordinate_methods`
   - provider projection
2. Update `ToolPolicy` or `agent_capability_policy.py` rather than hiding tools in prompt construction ad hoc.
3. Update method-level validation if the policy controls allowed coordinate methods.
4. Keep browser visibility tied to the accepted client/backend tool surface plus browser capability state, not the renderer `browser_automation_enabled` UI setting.
5. Keep web-search exposure tied to native provider support or Brave fallback availability.
6. Add tests for visible, hidden, disabled, unavailable, and client capability intersection cases.
7. Update [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md).

## Change Provider Projection

Provider projection should happen after canonical schema filtering. Do not make provider adapters mutate the canonical registry in place.

1. Keep `ToolRegistry` canonical and provider-neutral.
2. Add provider-specific declarations in projection/provider adapter code.
3. Preserve filtered direct function schemas unless the provider intentionally replaces them.
4. Apply selection-only pruning after projection for grounded helper schemas.
5. Add provider tests proving disabled OCR/prediction/browser/web-search surfaces do not reappear after projection.
6. Update provider docs and prompt transparency docs if the model-visible schema shape differs by provider.

## Debug Checklist

### Tool Is Missing from the Prompt

- Confirm it exists in `backend/src/tools/tool_catalog.py` or is a backend-owned tool registered by `ToolRegistry`.
- If it is a client/local-runtime tool, confirm the websocket handshake supplied
  `agent_definition.tools.client_manifest` and backend validation accepted the
  entry.
- Confirm the tool class emits a canonical function tool spec.
- Confirm `ToolRegistry.get_model_tool_names()` includes it.
- Confirm `ToolPolicy.filter_tool_names()` is not hiding it through interaction mode, profile, disabled tools, capability gates, provider health, browser gating, web-search availability, or agent capability policy.
- Confirm provider projection did not drop it.
- Confirm prompt metadata/tool-schema transparency events reflect the final filtered set.

### Tool Is Visible but Local Runtime Cannot Execute It

- Confirm `tests/backend/test_remote_tool_contract.py` covers the tool name parity with local-runtime executable exposure.
- Confirm `frontend/src/main/python/tools/manifest.py` includes the tool if it is local-runtime executed.
- Confirm `frontend/src/main/python/tools/registry.py` actually registers an implementation.
- Confirm SDK/main tool dispatch recognizes the tool and preserves request ids.
- Confirm Electron main can reach the local-runtime daemon.

### Tool Args Are Rejected

- For backend-executed tools, confirm backend `args_model` matches the model-facing schema.
- For local-runtime executed tools, inspect the SDK/local-runtime validation error and the accepted client manifest schema.
- Confirm method-level policy allows the requested coordinate method.
- Confirm backend preparation is not stripping grounded-only fields too early.

### Local-Runtime Python Rejects a Payload

- Confirm backend preparation converts model-facing fields into local-runtime executable fields.
- Confirm the manifest `schema` and local-runtime Python `entrypoint` agree on executable arg names.
- Confirm `argument_resolution` matches the actual backend preparation path.
- Confirm exact-parity local-runtime executable schema matches the accepted client schema where expected.
- Confirm intentional exceptions are documented in parity tests.
- Confirm SDK/main transport did not mutate or omit fields during local-runtime execution.

### Bundle Execution Is Broken

- Confirm `tool-bundle` event payload preserves each tool call and request id.
- Confirm SDK/main bundle execution returns one result per bundled call.
- Confirm backend `tool-bundle-result` route and result processor handle partial failures and cleanup.
- Confirm history commit code writes tool outputs with correct tool-call ids.

## Validation Matrix

| Changed surface | Minimum checks |
| --- | --- |
| backend catalog/name registration | `./scripts/python-in-env backend pytest tests/backend/test_remote_tool_contract.py tests/backend/test_tool_registry_schema.py tests/backend/test_remote_tools.py` |
| client manifest validation | `./scripts/python-in-env backend pytest tests/backend/test_client_tool_manifest.py` plus Electron client manifest builder tests when client payload generation changes |
| backend tool schema fields | tool-specific backend schema tests plus `./scripts/python-in-env local-runtime pytest tests/sidecar/test_shared_tool_schema_parity.py` when parity applies |
| policy/profile/capability visibility | `./scripts/python-in-env backend pytest tests/backend/test_tool_policy.py tests/backend/test_tool_selection.py tests/backend/test_provider_health_policy.py` |
| parser/preparation validation | `./scripts/python-in-env backend pytest tests/backend/test_tool_preparer.py tests/backend/test_interaction_tool_call_bridge.py` plus backend-tool validation tests |
| local-runtime executable tool | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_tool_registry.py tests/sidecar/test_tool_schemas.py` plus tool-specific local-runtime Python tests |
| SDK/main dispatch/result envelope | focused `cd frontend && npm run test -- AgentSdkClient AgentSdkConversationRuntime RendererToolResultBoundary ToolOutputContent` tests |
| bundle/result/history | backend result/bundle/history tests plus SDK/main bundle execution tests |
| docs-only tool workflow | `<windie> docs list`, `git diff --check`, focused Markdown link check |

## Review Checklist

- Tool name is consistent across backend catalog, remote tool class, local-runtime exposed tool set backed by the local-runtime executable registry, SDK/main tests, docs, and prompt transparency expectations.
- Client manifest entries are accepted or rejected for explicit reasons, and rejected entries do not silently disappear from diagnostics.
- Built-in client/local-runtime tool names use accepted client schemas as the final
  provider-visible local schema. Backend catalog specs are fallback/default
  entries, not replacements for accepted client manifests.
- Backend model-facing args and local-runtime executable args are either exact-parity tested or intentionally different with preparation coverage.
- Policy gates are centralized in `ToolPolicy` or agent capability policy, not scattered through prompt construction, provider code, or renderer UI.
- Provider projection cannot resurrect tools or coordinate methods that policy already hid.
- Request ids, tool-call ids, bundle ids, artifact refs, and screenshot refs survive SDK/main/local-runtime transport.
- Tool-result history has deterministic success, error, timeout, partial failure, and cleanup behavior.
- Docs identify whether the tool is backend-only, local-runtime executed, provider-native, exact-parity, or grounded/translated before execution.

## Related Docs

- [Tools Hub](README.md)
- [Tool Contracts](tool_contracts.md)
- [Tool Catalog Matrix](tool_catalog_matrix.md)
- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
- [Tool Execution Lifecycle](tool_execution_lifecycle.md)
- [Tool Troubleshooting](tool_troubleshooting.md)
- Backend Tools Docs Hub (private backend docs)
- Tool Turn Change Workflow (private backend docs)
- [Local-Runtime Tool Change Workflow](../frontend/local_runtime_tool_change_workflow.md)
