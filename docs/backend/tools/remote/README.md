---
summary: "Backend remote-tools docs sub-hub for domain-specific stub behavior, payload shaping differences, and request-id propagation semantics before SDK/main local-runtime execution."
read_when:
  - When adding or changing remote tool stub classes under `backend/src/tools/remote_tools/*`.
  - When debugging request-id correlation or payload field differences between backend remote stubs and local-runtime expectations.
title: "Backend Remote Tools Docs Hub"
---

# Backend Remote Tools Docs Hub

## Deep Pages

- [Remote Tool Domain Payload and Request-ID Semantics Reference](remote_tool_domain_payload_and_request_id_semantics_reference.md)

## Related Pages

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [System Tool Direct Schema and Remote Catalog Contract Reference](../contracts/system_tool_direct_schema_and_remote_catalog_contract_reference.md)
- [Browser Remote Schema Surface Reference](../browser/browser_remote_schema_surface_reference.md)
- [Computer Tool Schema Guidance Reference](../contracts/computer_tool_schema_guidance_reference.md)

## Code Scope

- `backend/src/tools/remote_tools/base.py`
- `backend/src/tools/tool_catalog.py`
- `backend/src/tools/remote_tools/computer.py`
- `backend/src/tools/remote_tools/system.py`
- `backend/src/tools/remote_tools/filesystem.py`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_remote_tool_contract.py`
- `tests/backend/test_browser_remote_tool.py`
