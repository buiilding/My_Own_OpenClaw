---
summary: "Frontend sidecar docs sub-hub for Python local-backend runtime, tool catalog execution model, memory pipeline, and browser automation stack."
read_when:
  - When changing sidecar JSON-RPC methods, tool implementations, or memory summarization behavior.
  - When debugging renderer->main->sidecar bridge failures or browser automation runtime issues.
title: "Frontend Sidecar Docs Hub"
---

# Frontend Sidecar Docs Hub

## Deep Pages

- [Python Sidecar and Memory](python_sidecar_and_memory.md)
- [Sidecar System-State Docs Hub](system_state/README.md)
- [Sidecar Tools Docs Hub](tools/README.md)
- [System-State Collection and Platform Adapter Reference](system_state/system_state_collection_and_platform_adapter_reference.md)
- [Sidecar Tool Catalog and Execution Model](tool_catalog_and_execution_model.md)
- [Shell and Process Session Runtime Reference](tools/shell_and_process_session_runtime_reference.md)
- [Filesystem Read and Replace Runtime Reference](tools/filesystem_read_replace_runtime_reference.md)
- [Sidecar Tool Registry Docs Hub](tools/registry/README.md)
- [Sidecar Computer Tools Docs Hub](tools/computer/README.md)
- [Sidecar System Tools Docs Hub](tools/system/README.md)
- [Tool Registry Exposed Schema and Result Normalization Reference](tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
- [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
- [Wait, Window, and Stats Runtime Reference](tools/system/wait_window_stats_runtime_reference.md)
- [Sidecar Memory Docs Hub](memory/README.md)
- [Memory Pipeline and Summarization](memory_pipeline_and_summarization.md)
- [Summarizer Watermark and Conversation Batch Reference](memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Sidecar Browser Docs Hub](browser/README.md)
- [Sidecar Browser Contracts Docs Hub](browser/contracts/README.md)
- [Sidecar Browser Chrome Docs Hub](browser/chrome/README.md)
- [Sidecar Browser Use Runtime Docs Hub](browser/browser_use/README.md)
- [Browser Automation Stack](browser_automation_stack.md)
- [Browser Action Compatibility and Runtime Reference](browser_action_compatibility_and_runtime_reference.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Schema Registry and Action Validation Boundary Reference](browser/contracts/schema_registry_and_action_validation_boundary_reference.md)
- [OpenClaw Compatibility Action and Field Surface Reference](browser/contracts/openclaw_compat_action_and_field_surface_reference.md)
- [Chrome Detection, Launcher, and CDP Session Reference](browser/chrome/chrome_detection_launcher_and_cdp_session_reference.md)
- [Browser Controller Lifecycle, Snapshot, and Action Runtime Reference](browser/chrome/browser_controller_lifecycle_snapshot_and_action_runtime_reference.md)
- [Enhanced CDP DOM Snapshot Pipeline Runtime Reference](browser/chrome/enhanced_cdp_dom_snapshot_pipeline_runtime_reference.md)
- [Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference](browser/browser_use/config_logging_observability_and_lazy_import_runtime_reference.md)
- [Local Backend JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Local Backend Process Lifecycle Reference](local_backend_process_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](wakeword_bridge_and_audio_framing_reference.md)

## Code Scope

- `frontend/src/main/python/*`
- `frontend/src/main/local_backend_bridge*.cjs`
- `frontend/src/main/python/memory/*`
- `frontend/src/main/python/tools/*`
