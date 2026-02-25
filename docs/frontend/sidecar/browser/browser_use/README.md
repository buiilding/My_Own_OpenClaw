---
summary: "Frontend sidecar browser_use docs sub-hub for vendored package bootstrap, lazy import/config/logging internals, DOM extraction/serialization pipelines, and Browser Use tools action/registry runtime contracts."
read_when:
  - When updating vendored `tools/browser/browser_use/*` package internals (bootstrap, DOM, tools, registry) or import behavior.
  - When debugging browser_use logging/config observability, DOM selector-map/index generation, or tool action dispatch/schema validation behavior.
title: "Frontend Sidecar Browser Use Runtime Docs Hub"
---

# Frontend Sidecar Browser Use Runtime Docs Hub

## Deep Pages

- [Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference](config_logging_observability_and_lazy_import_runtime_reference.md)
- [Browser Use DOM Docs Hub](dom/README.md)
- [Browser Use Tools Docs Hub](tools/README.md)
- [DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference](dom/dom_tree_construction_visibility_iframe_traversal_and_pagination_detection_contract_reference.md)
- [DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference](dom/dom_data_models_hashing_scrollability_and_interaction_identity_contract_reference.md)
- [DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference](dom/dom_serializer_snapshot_clickability_and_markdown_pipeline_runtime_reference.md)
- [Browser Use Tools Action Model Surface and Input Schema Contract Reference](tools/action_model_surface_and_input_schema_contract_reference.md)
- [Browser Use Tools Registry Signature Normalization, Sensitive Placeholder, and Domain Filter Contract Reference](tools/registry_signature_normalization_sensitive_placeholder_and_domain_filter_contract_reference.md)
- [Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference](tools/runtime_action_dispatch_extraction_and_codeagent_variant_contract_reference.md)

## Related Pages

- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](../browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Frontend Sidecar Browser Chrome Docs Hub](../chrome/README.md)
- [Frontend Sidecar Tools Docs Hub](../../tools/README.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_use/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/_lazy_import.py`
- `frontend/src/main/python/tools/browser/browser_use/config.py`
- `frontend/src/main/python/tools/browser/browser_use/logging_config.py`
- `frontend/src/main/python/tools/browser/browser_use/observability.py`
- `frontend/src/main/python/tools/browser/browser_use/utils.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/*`
- `frontend/src/main/python/tools/browser/browser_use/tools/*`
