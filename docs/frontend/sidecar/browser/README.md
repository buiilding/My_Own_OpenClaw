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
- [Browser Contracts Docs Hub](contracts/README.md)
- [Schema Registry and Action Validation Boundary Reference](contracts/schema_registry_and_action_validation_boundary_reference.md)
- [OpenClaw Compatibility Action and Field Surface Reference](contracts/openclaw_compat_action_and_field_surface_reference.md)
- [Browser Role-Snapshot Docs Hub](contracts/role_snapshot/README.md)
- [ARIA Snapshot Ref Generation and Compaction Contract Reference](contracts/role_snapshot/aria_snapshot_ref_generation_and_compaction_contract_reference.md)
- [Browser Chrome Docs Hub](chrome/README.md)
- [Chrome Detection, Launcher, and CDP Session Reference](chrome/chrome_detection_launcher_and_cdp_session_reference.md)
- [Browser Controller Lifecycle, Snapshot, and Action Runtime Reference](chrome/browser_controller_lifecycle_snapshot_and_action_runtime_reference.md)
- [Enhanced CDP DOM Snapshot Pipeline Runtime Reference](chrome/enhanced_cdp_dom_snapshot_pipeline_runtime_reference.md)
- [Browser Use Runtime Docs Hub](browser_use/README.md)
- [Browser Use DOM Docs Hub](browser_use/dom/README.md)
- [Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference](browser_use/config_logging_observability_and_lazy_import_runtime_reference.md)
- [DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference](browser_use/dom/dom_tree_construction_visibility_iframe_traversal_and_pagination_detection_contract_reference.md)
- [DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference](browser_use/dom/dom_data_models_hashing_scrollability_and_interaction_identity_contract_reference.md)
- [DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference](browser_use/dom/dom_serializer_snapshot_clickability_and_markdown_pipeline_runtime_reference.md)

## Related Pages

- [Browser Automation Stack](../browser_automation_stack.md)
- [Browser Action Compatibility and Runtime Reference](../browser_action_compatibility_and_runtime_reference.md)
- [Local Backend JSON-RPC Reference](../local_backend_jsonrpc_reference.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_runtime.py`
- `frontend/src/main/python/tools/browser/browser_adapter.py`
- `frontend/src/main/python/tools/browser/chrome_detection.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `frontend/src/main/python/tools/browser/controller.py`
- `frontend/src/main/python/tools/browser/enhanced_cdp_pipeline.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/browser_use/*`
- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/local_backend.py`
- `tests/sidecar/tools/test_chrome_detection.py`
- `tests/sidecar/tools/test_chrome_launcher.py`
- `tests/sidecar/tools/test_browser_controller.py`
- `tests/sidecar/tools/test_browser_enhanced_cdp_pipeline.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`
- `tests/sidecar/tools/test_browser_tool.py`
