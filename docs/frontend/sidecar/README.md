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
- [Sidecar Memory Docs Hub](memory/README.md)
- [Memory Pipeline and Summarization](memory_pipeline_and_summarization.md)
- [Summarizer Watermark and Conversation Batch Reference](memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Sidecar Browser Docs Hub](browser/README.md)
- [Browser Automation Stack](browser_automation_stack.md)
- [Browser Action Compatibility and Runtime Reference](browser_action_compatibility_and_runtime_reference.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Local Backend JSON-RPC Reference](local_backend_jsonrpc_reference.md)
- [Local Backend Process Lifecycle Reference](local_backend_process_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](wakeword_bridge_and_audio_framing_reference.md)

## Code Scope

- `frontend/src/main/python/*`
- `frontend/src/main/local_backend_bridge*.cjs`
- `frontend/src/main/python/memory/*`
- `frontend/src/main/python/tools/*`
