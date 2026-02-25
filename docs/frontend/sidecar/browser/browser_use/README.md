---
summary: "Frontend sidecar browser_use docs sub-hub for vendored package bootstrap, BrowserSession/profile/watchdog runtime internals, actor/page/element input orchestration, agent/message-state models, DOM/tools/LLM contracts, token accounting, and filesystem persistence behavior."
read_when:
  - When updating vendored `tools/browser/browser_use/*` package internals (bootstrap, browser runtime, actor, agent, DOM, tools, registry, llm, tokens, filesystem) or import behavior.
  - When debugging browser_use logging/config observability, interaction/action dispatch failures, agent history/compaction state, usage accounting, or file persistence behavior.
title: "Frontend Sidecar Browser Use Runtime Docs Hub"
---

# Frontend Sidecar Browser Use Runtime Docs Hub

## Deep Pages

- [Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference](config_logging_observability_and_lazy_import_runtime_reference.md)
- [Browser Use Browser Docs Hub](browser/README.md)
- [Browser Use Browser Watchdogs Docs Hub](browser/watchdogs/README.md)
- [Browser Use DOM Docs Hub](dom/README.md)
- [Browser Use Tools Docs Hub](tools/README.md)
- [Browser Use LLM Docs Hub](llm/README.md)
- [Browser Use Actor Docs Hub](actor/README.md)
- [Browser Use Agent Docs Hub](agent/README.md)
- [Browser Use Tokens Docs Hub](tokens/README.md)
- [Browser Use Filesystem Docs Hub](filesystem/README.md)
- [Browser Session, Session Manager, Event Bus, and CDP Lifecycle Orchestration Reference](browser/session_manager_event_bus_and_cdp_lifecycle_orchestration_reference.md)
- [Browser Profile Runtime Defaults, Launch Args, Demo Overlay, and Video Recording Reference](browser/profile_runtime_defaults_launch_args_demo_overlay_and_video_recording_reference.md)
- [Browser Watchdog Base and Specialized Watchdogs Runtime Reference](browser/watchdogs/watchdog_base_and_specialized_watchdogs_runtime_reference.md)
- [DOM Tree Construction, Visibility, Iframe Traversal, and Pagination Detection Contract Reference](dom/dom_tree_construction_visibility_iframe_traversal_and_pagination_detection_contract_reference.md)
- [DOM Data Models, Hashing, Scrollability, and Interaction Identity Contract Reference](dom/dom_data_models_hashing_scrollability_and_interaction_identity_contract_reference.md)
- [DOM Serializer, Snapshot, Clickability, and Markdown Pipeline Runtime Reference](dom/dom_serializer_snapshot_clickability_and_markdown_pipeline_runtime_reference.md)
- [Actor Page, Element, Mouse, and Key Mapping Runtime Reference](actor/page_element_mouse_and_key_mapping_runtime_reference.md)
- [Agent State, Output Schema, Action Results, History, and Error Handling Contract Reference](agent/agent_state_output_history_and_error_handling_contract_reference.md)
- [Agent Message History and Compaction State Contract Reference](agent/message_history_and_compaction_state_contract_reference.md)
- [Token Usage, Pricing, and Aggregate Cost Summary Contract Reference](tokens/token_usage_pricing_and_aggregate_cost_summary_contract_reference.md)
- [Browser Use File System Runtime, File Type Adapters, and State Persistence Contract Reference](filesystem/file_system_runtime_file_type_adapters_and_state_persistence_contract_reference.md)
- [Browser Use Tools Action Model Surface and Input Schema Contract Reference](tools/action_model_surface_and_input_schema_contract_reference.md)
- [Browser Use Tools Registry Signature Normalization, Sensitive Placeholder, and Domain Filter Contract Reference](tools/registry_signature_normalization_sensitive_placeholder_and_domain_filter_contract_reference.md)
- [Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference](tools/runtime_action_dispatch_extraction_and_codeagent_variant_contract_reference.md)
- [Browser Use LLM Base Protocol, Message Types, Schema Optimization, and Model Alias Factory Contract Reference](llm/base_protocol_message_types_schema_optimization_and_model_alias_factory_contract_reference.md)
- [Browser Use LLM Provider Adapters and Serializer Runtime Reference](llm/provider_adapters_and_serializer_runtime_reference.md)

## Related Pages

- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](../browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Frontend Sidecar Browser Chrome Docs Hub](../chrome/README.md)
- [Frontend Sidecar Tools Docs Hub](../../tools/README.md)
- [Backend LLM Provider Docs Hub](../../../../backend/llm/providers/README.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_use/__init__.py`
- `frontend/src/main/python/tools/browser/browser_use/_lazy_import.py`
- `frontend/src/main/python/tools/browser/browser_use/config.py`
- `frontend/src/main/python/tools/browser/browser_use/logging_config.py`
- `frontend/src/main/python/tools/browser/browser_use/observability.py`
- `frontend/src/main/python/tools/browser/browser_use/utils.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/*`
- `frontend/src/main/python/tools/browser/browser_use/actor/*`
- `frontend/src/main/python/tools/browser/browser_use/agent/*`
- `frontend/src/main/python/tools/browser/browser_use/dom/*`
- `frontend/src/main/python/tools/browser/browser_use/filesystem/*`
- `frontend/src/main/python/tools/browser/browser_use/tools/*`
- `frontend/src/main/python/tools/browser/browser_use/llm/*`
- `frontend/src/main/python/tools/browser/browser_use/tokens/*`
