---
summary: "Workflow for changing WindieOS model-visible tool schemas, policy gates, provider projection, sidecar parity, renderer dispatch, and tool-result contracts."
read_when:
  - When adding, removing, renaming, hiding, exposing, or changing a model-visible WindieOS tool.
  - When changing tool argument schemas, descriptions, capability gates, profiles, coordinate methods, provider-native projections, frontend executable payloads, or sidecar registry exposure.
  - When debugging a tool that is present in code but missing from the prompt, visible to the model but not executable, rejected before dispatch, or mismatched between backend and sidecar schemas.
title: "Tool Schema and Policy Change Workflow"
---

# Tool Schema and Policy Change Workflow

Use this workflow before changing anything that affects what tools the model can see or call. WindieOS tool behavior is split across client-provided local tool manifests, backend remote-tool schemas, backend policy gates, provider projection, renderer execution orchestration, Electron IPC, and sidecar local execution.

The core rule is: backend owns backend remote tools and validation; Windie Agent owns client-local tool schemas and sidecar tool implementations. Do not make the frontend or sidecar import backend schemas to avoid drift. Keep parity explicit in tests and docs.

## Fast Owner Map

| Change or symptom | First owner | Code roots | Start docs | Focused tests |
| --- | --- | --- | --- | --- |
| add or change a client-local sidecar tool schema | Windie Agent manifest, then backend validation policy | public `frontend/src/main/tool_manifest.cjs`; backend `backend/src/tools/client_manifest.py` | [Tool Contracts](tool_contracts.md) | manifest builder tests, backend manifest validation tests |
| add, remove, or rename a model-visible remote tool | backend tool catalog | `backend/src/tools/tool_catalog.py`, `backend/src/tools/remote.py`, `backend/src/tools/remote_tools/*` | [Tool Catalog Matrix](tool_catalog_matrix.md), [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../backend/tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md) | `tests/backend/test_remote_tool_contract.py`, `tests/backend/test_tool_registry_schema.py` |
| change a tool argument schema or description | backend schema model and remote stub | `backend/src/tools/{computer,system,filesystem,browser}/schemas.py`, `backend/src/tools/remote_tools/*`, `backend/src/tools/schema_fields.py` | [Tool Contracts](tool_contracts.md), [Backend Tools Contracts Hub](../backend/tools/contracts/README.md) | backend schema tests plus `tests/sidecar/test_shared_tool_schema_parity.py` when executable fields should match |
| hide or expose tools by profile, interaction mode, disabled tools, capabilities, provider health, or browser toggle | backend policy | `backend/src/tools/tool_policy.py`, `backend/src/tools/agent_capability_policy.py`, `backend/src/tools/provider_health.py`, `backend/src/tools/tool_selection.py` | [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md), [Tool Policy and Dev Tool Selection Runtime Reference](../backend/tools/policy/tool_policy_and_dev_tool_selection_runtime_reference.md) | `tests/backend/test_tool_policy.py`, `tests/backend/test_dev_tool_selection.py`, `tests/backend/test_provider_health_policy.py` |
| change OCR, vision, manual coordinate method availability or validation | backend tool policy and preparation | `backend/src/tools/tool_policy.py`, `backend/src/tools/computer/schemas.py`, `backend/src/agent/tools/preparation/*` | [Computer Tools](computer.md), [Tool Preparation and Coordinate Resolution Reference](../backend/tools/tool_preparation_and_coordinate_resolution_reference.md) | `tests/backend/test_tool_policy.py`, `tests/backend/test_tool_preparer.py`, `tests/backend/test_computer_use_schema_contract.py` |
| backend rejects a model tool call before frontend execution | backend parser/preparation validation | `backend/src/agent/tools/preparation/validation.py`, tool `args_model`, parser tests | [Tool Turn Change Workflow](../backend/agent/tool_turn_change_workflow.md), [Tool Troubleshooting](tool_troubleshooting.md) | `tests/backend/test_interaction_tool_call_bridge.py`, tool-specific validation tests |
| sidecar says tool not found or rejects executable args | sidecar registry/schema/runtime | `frontend/src/main/python/tools/registry.py`, `frontend/src/main/python/tools/exposed_tool_names.py`, `frontend/src/main/python/tools/**` | [Sidecar Tool Change Workflow](../frontend/sidecar_tool_change_workflow.md), [Sidecar Tool Catalog and Execution Model](../frontend/sidecar/tool_catalog_and_execution_model.md) | `tests/sidecar/test_tool_registry.py`, `tests/sidecar/test_tool_schemas.py`, tool-specific sidecar tests |
| renderer drops fields, result ids, artifacts, screenshots, or bundle metadata | renderer tool execution | `frontend/src/renderer/infrastructure/services/toolExecution`, `frontend/src/renderer/features/chat/hooks/useToolRunner.ts` | [Tool Execution Lifecycle](tool_execution_lifecycle.md), [Frontend Tool Execution Service + Hook Runtime Reference](../frontend/renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md) | `tests/frontend/ToolExecution*.test.ts`, `tests/frontend/ToolRunner*.test.ts`, `tests/frontend/ToolResult*.test.ts` |
| provider-specific tool payload differs from canonical function schemas | backend provider projection/provider adapter | `backend/src/tools/provider_projection.py`, `backend/src/llm/providers/*`, `backend/src/llm/prompts/*` | [Provider Change Workflow](../providers/provider_change_workflow.md), [Prompt Context Change Workflow](../backend/llm/prompts/prompt_context_change_workflow.md) | provider tests plus prompt/schema tests |
| tool-result history, request ids, bundle output, or cleanup changes | backend agent tool-turn runtime | `backend/src/agent/tools/sending`, `backend/src/agent/tools/waiting`, `backend/src/agent/tools/processing`, `backend/src/agent/history` | [Tool Turn Change Workflow](../backend/agent/tool_turn_change_workflow.md), [Tool Execution Lifecycle](tool_execution_lifecycle.md) | `tests/backend/test_tool_result_*`, `tests/backend/test_bundle_execution.py`, frontend bundle/result tests |

## Boundary Rules

- Backend owns backend remote-tool schemas, client-manifest validation, visibility policy, provider projection, parser validation, tool-result ingestion, and history conversion.
- Windie Agent owns client-local schemas and sidecar tool implementations.
- Renderer owns streamed tool-call consumption, single/bundle execution orchestration, screenshot/artifact capture around tool execution, and backend result envelope submission.
- Electron main owns the `execute-tool` IPC bridge, sidecar request transport, display/window context, and sidecar process availability.
- Python sidecar owns local executable tool registry entries and actual local machine actions.
- Backend-only tools such as `web_search` do not need sidecar parity, but they still need policy and provider capability tests.
- Sidecar-only helper behavior must not be model-visible until the backend catalog and policy deliberately expose it.
- Exact schema parity is required only where the backend model-facing args are also the sidecar executable args. Grounded tools can intentionally differ when backend preparation resolves them into simpler executable payloads.
- Provider-native declarations may be added after canonical filtering, but policy must still prevent disabled grounded function schemas from leaking to the model.
- Client manifest validation is partial: accepted entries can be exposed while rejected entries are reported as diagnostics. Do not turn one rejected extension tool into a whole-session failure unless the websocket contract intentionally changes.
- Client schemas may override only explicitly overridable built-in local tools. They must not add arbitrary backend execution targets.

## Model-Facing Tool Schema Path

1. `backend/src/tools/tool_catalog.py` lists catalog entries and resolves remote tool classes.
2. Each remote tool class exposes a class-level `build_tool_spec()` through its SDK `Tool` base.
3. `ToolRegistry` registers catalog entries, stores prebuilt canonical tool specs, and registers backend-only tools such as `web_search`.
4. `SchemaRegistry` validates and caches canonical function tool schemas.
5. `client_tool_manifest` entries are validated into accepted client-local function schemas or rejected diagnostics.
6. Prompt construction merges accepted client schemas with backend registry schemas while avoiding unsupported duplicate names.
7. `ToolPolicy` filters names and schemas by config, profile, available tools, disabled tools/capabilities, provider health, browser toggle, web-search availability, and dev tool selection.
8. Provider projection can adapt the filtered schema set for provider-specific transports.
9. Prompt construction sends the final model-visible schema set to the provider and transparency events.

## Client Manifest Change Path

1. Decide whether the tool is a client-local sidecar tool, an override of an allowed built-in, or a backend remote tool.
2. For client-local tools, define `name`, `description`, `schema`, `execution_target`, and `argument_resolution`.
3. Keep the developer-authored extension field named `schema`; let backend validation normalize it into the flat function schema.
4. Use `execution_target=sidecar` unless the tool name is a reserved backend tool that the backend already knows how to execute.
5. Use `argument_resolution=passthrough` when model args are executable as emitted.
6. Use `argument_resolution=backend_grounding` only when backend preparation has a concrete owner and tests for the transformation.
7. Add validation for accepted entries, rejected entries, duplicate names, reserved backend names, oversized manifests, unsupported schema keys, and disabled tools.
8. Confirm prompt transparency reports accepted/rejected manifest entries and final tool schemas clearly enough to debug what the model saw.

## Executable Tool Path

1. Model emits a tool call using the model-facing backend schema.
2. Backend parser validates the call against the registered tool `args_model`.
3. Preparation resolves backend-only or grounded fields such as OCR text, prediction targets, candidate ids, and screenshots.
4. Backend sends `tool-call` or `tool-bundle` events to the frontend with executable payloads and request ids.
5. Renderer tool execution services dispatch to Electron main.
6. Electron main forwards the executable request to the sidecar JSON-RPC runtime.
7. Sidecar registry executes the local tool implementation and returns a normalized result.
8. Renderer submits `tool-result` or `tool-bundle-result` back to the backend.
9. Backend transforms the result into model-facing history and resumes the loop.

## Add a New Sidecar-Executed Tool

1. Decide whether the tool should be model-visible, internal-only, or future-only.
2. Add the backend remote tool class under `backend/src/tools/remote_tools/*` and schema model under the correct backend tool domain.
3. Add a `ToolCatalogEntry` in `backend/src/tools/tool_catalog.py` only when the model should see the tool.
4. Add policy gates when the tool depends on permissions, browser runtime, provider health, workspace state, local authority, or a capability family.
5. Add or update parser/preparation validation if model-facing fields differ from executable sidecar fields.
6. Add the sidecar implementation and register it in `frontend/src/main/python/tools/registry.py`.
7. Add the tool name to `frontend/src/main/python/tools/exposed_tool_names.py` only if backend parity should require it.
8. Update renderer tool execution code only if the tool needs special handling for screenshots, artifacts, display context, bundle behavior, or result shaping.
9. Update docs:
   - [Tool Catalog Matrix](tool_catalog_matrix.md)
   - [Tool Contracts](tool_contracts.md)
   - [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
   - family-specific docs such as [Computer Tools](computer.md), [Browser Tool](browser.md), or [Filesystem and Shell Tools](filesystem_shell.md)
   - sidecar docs when executable behavior changes

## Change an Existing Tool Schema

1. Find the model-facing owner from [Tool Catalog Matrix](tool_catalog_matrix.md).
2. Edit the backend Pydantic args model and remote tool stub first.
3. Decide whether the sidecar runtime arguments must match:
   - exact parity tools: update backend and sidecar schema models together
   - grounded tools: update backend preparation and executor validation so model-facing fields are stripped or resolved before dispatch
   - backend-only tools: update backend parser/provider tests only
4. Update shared field factories in `backend/src/tools/schema_fields.py` when multiple tools need the same wording or validation field.
5. Update `tests/sidecar/test_shared_tool_schema_parity.py` for exact-parity coverage or intentional exceptions.
6. Update renderer tests if streamed payload fields, request ids, artifacts, screenshots, or bundle result fields change.
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
   - dev tool selection
   - provider projection
2. Update `ToolPolicy` or `agent_capability_policy.py` rather than hiding tools in prompt construction ad hoc.
3. Update method-level validation if the policy controls allowed coordinate methods.
4. Keep browser gating tied to `browser_automation_enabled` and browser capability state.
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
- If it is client-local, confirm the websocket handshake supplied `client_tool_manifest` and backend validation accepted the entry.
- Confirm the tool class emits a canonical function tool spec.
- Confirm `ToolRegistry.get_model_tool_names()` includes it.
- Confirm `ToolPolicy.filter_tool_names()` is not hiding it through interaction mode, profile, disabled tools, capability gates, provider health, browser gating, web-search availability, or dev selection.
- Confirm provider projection did not drop it.
- Confirm prompt metadata/tool-schema transparency events reflect the final filtered set.

### Tool Is Visible but Frontend Cannot Execute It

- Confirm `tests/backend/test_remote_tool_contract.py` covers the tool name parity with sidecar exposure.
- Confirm `frontend/src/main/python/tools/exposed_tool_names.py` includes the tool if it is sidecar-executed.
- Confirm `frontend/src/main/python/tools/registry.py` actually registers an implementation.
- Confirm renderer tool execution dispatch recognizes the tool and preserves request ids.
- Confirm Electron main can reach the sidecar process.

### Tool Args Are Rejected Before Dispatch

- Confirm backend `args_model` matches the model-facing schema.
- Confirm parser/preparation validation is not stripping required fields too early.
- Confirm method-level policy allows the requested coordinate method.
- Confirm browser action discriminators and repair guidance match the current browser schema.

### Sidecar Rejects a Payload

- Confirm backend preparation converts model-facing fields into sidecar executable fields.
- Confirm the manifest `schema` and sidecar `entrypoint` agree on executable arg names.
- Confirm `argument_resolution` matches the actual backend preparation path.
- Confirm exact-parity sidecar schema matches backend schema where expected.
- Confirm intentional exceptions are documented in parity tests.
- Confirm renderer/Electron did not mutate or omit fields during transport.

### Bundle Execution Is Broken

- Confirm `tool-bundle` event payload preserves each tool call and request id.
- Confirm renderer bundle runner returns one result per bundled call.
- Confirm backend `tool-bundle-result` route and result processor handle partial failures and cleanup.
- Confirm history commit code writes tool outputs with correct tool-call ids.

## Validation Matrix

| Changed surface | Minimum checks |
| --- | --- |
| backend catalog/name registration | `./scripts/python-in-env backend pytest tests/backend/test_remote_tool_contract.py tests/backend/test_tool_registry_schema.py tests/backend/test_remote_tools.py` |
| client manifest validation | `./scripts/python-in-env backend pytest tests/backend/test_client_tool_manifest.py` plus frontend manifest builder tests when client payload generation changes |
| backend tool schema fields | tool-specific backend schema tests plus `./scripts/python-in-env sidecar pytest tests/sidecar/test_shared_tool_schema_parity.py` when parity applies |
| policy/profile/capability visibility | `./scripts/python-in-env backend pytest tests/backend/test_tool_policy.py tests/backend/test_dev_tool_selection.py tests/backend/test_provider_health_policy.py` |
| parser/preparation validation | `./scripts/python-in-env backend pytest tests/backend/test_tool_preparer.py tests/backend/test_interaction_tool_call_bridge.py` plus tool-specific validation tests |
| sidecar executable tool | `./scripts/python-in-env sidecar pytest tests/sidecar/test_tool_registry.py tests/sidecar/test_tool_schemas.py` plus tool-specific sidecar tests |
| renderer dispatch/result envelope | focused `cd frontend && npm run test -- ToolExecution` / `ToolRunner` / `ToolResult` tests |
| bundle/result/history | backend result/bundle/history tests plus frontend bundle runner tests |
| docs-only tool workflow | `./bin/docs-list`, `git diff --check`, focused Markdown link check |

## Review Checklist

- Tool name is consistent across backend catalog, remote tool class, sidecar exposed set, sidecar registry, renderer tests, docs, and prompt transparency expectations.
- Client manifest entries are accepted or rejected for explicit reasons, and rejected entries do not silently disappear from diagnostics.
- Backend model-facing args and sidecar executable args are either exact-parity tested or intentionally different with preparation coverage.
- Policy gates are centralized in `ToolPolicy` or agent capability policy, not scattered through prompt construction, provider code, or renderer UI.
- Provider projection cannot resurrect tools or coordinate methods that policy already hid.
- Request ids, tool-call ids, bundle ids, artifact refs, and screenshot refs survive renderer/Electron/sidecar transport.
- Tool-result history has deterministic success, error, timeout, partial failure, and cleanup behavior.
- Docs identify whether the tool is backend-only, sidecar-executed, provider-native, exact-parity, or grounded/translated before execution.

## Related Docs

- [Tools Hub](README.md)
- [Tool Contracts](tool_contracts.md)
- [Tool Catalog Matrix](tool_catalog_matrix.md)
- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
- [Tool Execution Lifecycle](tool_execution_lifecycle.md)
- [Tool Troubleshooting](tool_troubleshooting.md)
- [Backend Tools Docs Hub](../backend/tools/README.md)
- [Tool Turn Change Workflow](../backend/agent/tool_turn_change_workflow.md)
- [Sidecar Tool Change Workflow](../frontend/sidecar_tool_change_workflow.md)
