---
summary: "Local-runtime Python implementation docs sub-hub for the local-runtime Python daemon, tool catalog execution model, memory pipeline, and browser automation stack."
read_when:
  - When changing local-runtime JSON-RPC methods backed by local-runtime Python code, tool implementations, or memory summarization behavior.
  - When debugging renderer->main->local-runtime bridge failures or browser automation runtime issues.
title: "Local Runtime Python Implementation Docs Hub"
---

# Local Runtime Python Implementation Docs Hub

## Deep Pages

- [Local-Runtime Python and Memory](python_sidecar_and_memory.md)
- [Local-Runtime Python Implementation Change Workflow](local_runtime_python_change_workflow.md)
- [Local-Runtime Process Lifecycle Change Workflow](../main/local_backend/process_lifecycle_change_workflow.md)
- [Local Runtime JSON-RPC Change Workflow](local_backend_jsonrpc_change_workflow.md)
- [Local-Runtime Core Docs Hub](core/README.md)
- [Local-Runtime Services Docs Hub](services/README.md)
- [Local-Runtime System-State Docs Hub](system_state/README.md)
- [Local-Runtime Tools Docs Hub](tools/README.md)
- [System-State Collection and Platform Adapter Reference](system_state/system_state_collection_and_platform_adapter_reference.md)
- [Local-Runtime Tool Catalog and Execution Model](tool_catalog_and_execution_model.md)
- [Shell and Process Session Runtime Reference](tools/shell_and_process_session_runtime_reference.md)
- [Filesystem Read and Replace Runtime Reference](tools/filesystem_read_replace_runtime_reference.md)
- [Local-Runtime Tool Registry Docs Hub](tools/registry/README.md)
- [Local-Runtime Computer Tools Docs Hub](tools/computer/README.md)
- [Local-Runtime System Tools Docs Hub](tools/system/README.md)
- [Tool Registry Exposed Schema and Result Contract Reference](tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
- [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
- [Wait, Window, and Stats Runtime Reference](tools/system/wait_window_stats_runtime_reference.md)
- [Local Runtime Memory Docs Hub](memory/README.md)
- [Local Runtime Memory Storage Docs Hub](memory/storage/README.md)
- [Memory Pipeline and Summarization](memory_pipeline_and_summarization.md)
- [Summarizer Watermark and Conversation Batch Reference](memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)
- [Local-Runtime Browser Docs Hub](browser/README.md)
- [Local-Runtime Browser Contracts Docs Hub](browser/contracts/README.md)
- [Local-Runtime Browser Chrome Docs Hub](browser/chrome/README.md)
- [Local-Runtime Source Maps Docs Hub](source_maps/README.md)
- [Browser Automation Stack](browser_automation_stack.md)
- [Browser Action Runtime Reference](browser_action_runtime_reference.md)
- [Schema Registry and Action Validation Boundary Reference](browser/contracts/schema_registry_and_action_validation_boundary_reference.md)
- [Chrome Detection, Launcher, and CDP Session Reference](browser/chrome/chrome_detection_launcher_and_cdp_session_reference.md)
- [Local-Runtime Python Folder Topology and Package `__init__` Export Surface Reference](source_maps/python_sidecar_folder_topology_and_package_init_export_surface_reference.md)
- [Local Runtime JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Local Runtime JSON-RPC Change Workflow](local_backend_jsonrpc_change_workflow.md)
- [Local-Runtime Process Lifecycle Change Workflow](../main/local_backend/process_lifecycle_change_workflow.md)
- [SDK-Owned Local-Runtime Lifecycle Reference](local_backend_process_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](wakeword_bridge_and_audio_framing_reference.md)
- [JSON-RPC Protocol and Stdout Framing Reference](core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Backend Config Env-Precedence Reference](core/backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md)
- [Remote Semantic Client Reference](core/remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](services/wakeword_service_model_bootstrap_and_binary_framing_reference.md)
- [Local-Runtime Service Protocol Docs Hub](services/protocols/README.md)

## Code Scope

- `frontend/src/main/python/*`
- `frontend/src/main/sidecar/local_runtime*.cjs`
- `frontend/src/main/python/memory/*`
- `frontend/src/main/python/tools/*`

## Evidence Notes

- Local-runtime Python implementation changes need executable-result evidence
  from the Python boundary, not just confirmation that Electron dispatched a
  request.
- Preserve raw local-runtime JSON-RPC payloads in diagnostics when result
  normalization or MCP/tool wrapping is under investigation.
