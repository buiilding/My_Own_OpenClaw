---
summary: "Frontend sidecar browser_use DOM docs sub-hub for CDP tree capture, enhanced node modeling, visibility/iframe semantics, serializer indexing rules, and markdown extraction/chunking contracts."
read_when:
  - When changing `tools/browser/browser_use/dom/*` service/model/serializer behavior.
  - When debugging missing interactive indices, iframe visibility mismatches, or extraction truncation/chunk continuation behavior.
title: "Frontend Sidecar Browser Use DOM Docs Hub"
---

# Frontend Sidecar Browser Use DOM Docs Hub

## Deep Pages

- [DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference](dom_tree_construction_visibility_iframe_traversal_and_pagination_detection_contract_reference.md)
- [DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference](dom_data_models_hashing_scrollability_and_interaction_identity_contract_reference.md)
- [DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference](dom_serializer_snapshot_clickability_and_markdown_pipeline_runtime_reference.md)

## Related Pages

- [Frontend Sidecar Browser Use Runtime Docs Hub](../README.md)
- [Frontend Sidecar Browser Use Browser Docs Hub](../browser/README.md)
- [Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference](../config_logging_observability_and_lazy_import_runtime_reference.md)
- [Frontend Sidecar Browser Chrome Docs Hub](../../chrome/README.md)
- [Enhanced CDP DOM Snapshot Pipeline Runtime Reference](../../chrome/enhanced_cdp_dom_snapshot_pipeline_runtime_reference.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_use/dom/views.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/service.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/utils.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/enhanced_snapshot.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/markdown_extractor.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/eval_serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/html_serializer.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/clickable_elements.py`
- `frontend/src/main/python/tools/browser/browser_use/dom/serializer/paint_order.py`
