---
summary: "Frontend sidecar browser docs sub-hub for Browser Use vendoring/runtime-provider selection, native handler bridge semantics, and compatibility-adapter action normalization contracts."
read_when:
  - When changing sidecar browser runtime selection, vendored Browser Use import policy, or native handler loading.
  - When debugging browser action failures across adapter routing, action parameter normalization, or connection-gated execution.
title: "Frontend Sidecar Browser Docs Hub"
---

# Frontend Sidecar Browser Docs Hub

## Deep Pages

- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Browser Use Runtime Docs Hub](browser_use/README.md)
- [Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference](browser_use/config_logging_observability_and_lazy_import_runtime_reference.md)

## Related Pages

- [Browser Automation Stack](../browser_automation_stack.md)
- [Browser Action Compatibility and Runtime Reference](../browser_action_compatibility_and_runtime_reference.md)
- [Local Backend JSON-RPC Reference](../local_backend_jsonrpc_reference.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_runtime.py`
- `frontend/src/main/python/tools/browser/browser_adapter.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/browser_use/*`
- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/local_backend.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`
- `tests/sidecar/tools/test_browser_tool.py`
