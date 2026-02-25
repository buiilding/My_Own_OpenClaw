---
summary: "Backend SDK docs sub-hub for Tool base class contracts, ToolContext runtime injection, and sub-agent helper utilities."
read_when:
  - When changing `backend/src/sdk/*` modules or adding SDK-facing backend extension points.
  - When debugging tool schema generation, context service injection, or SDK sub-agent helper behavior.
title: "Backend SDK Docs Hub"
---

# Backend SDK Docs Hub

## Deep Pages

- [Tool Context and Schema Contract Reference](tool_context_and_schema_contract_reference.md)
- [Sub-Agent Session Helper Runtime Reference](subagent_session_helper_runtime_reference.md)

## Related Pages

- [Backend Tools Templates Docs Hub](../tools/templates/README.md)
- [SDK Tool Template Scaffold, Manifest, and Capability Contract Reference](../tools/templates/sdk_tool_template_scaffold_manifest_and_capability_contract_reference.md)

## Code Scope

- `backend/src/sdk/context.py`
- `backend/src/sdk/tool.py`
- `backend/src/sdk/agents/config_helper.py`
- `backend/src/sdk/agents/session_builder.py`
- `backend/src/sdk/agents/response_extractor.py`
- `backend/src/core/services/context_factory.py`
- `backend/src/core/services/agent_factory.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/registry.py`
- `tests/backend/test_context_factory.py`
- `tests/backend/test_tool_registry_schema.py`
