---
summary: "Frontend sidecar core docs sub-hub for JSON-RPC protocol/error semantics, graceful stdin shutdown handlers, stdout framing, backend URL resolution, remote embedding/semantic/title clients, and shared thread-pool lifecycle."
read_when:
  - When changing `frontend/src/main/python/core/*` modules.
  - When debugging sidecar protocol parse/dispatch failures, shutdown hangs, or remote embedding/semantic/title client connectivity.
title: "Frontend Sidecar Core Docs Hub"
---

# Frontend Sidecar Core Docs Hub

## Deep Pages

- [JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference](json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Backend Config Env-Precedence, Trailing-Slash Normalization, and Default-URL Contract Reference](backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
- [Remote Embedding Client Health-Probe, Dimension, and Error-Surface Contract Reference](remote_embedding_client_health_probe_dimension_and_error_surface_contract_reference.md)
- [Remote Semantic Client Summarize Payload, Timeout, and Error-Surface Contract Reference](remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md)
- [Remote Title Client Generation Payload, Model-Override, Timeout, and Error-Surface Contract Reference](remote_title_client_generation_payload_model_override_timeout_and_error_surface_contract_reference.md)
- [Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference](backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md)

## Related Pages

- [Frontend Sidecar Docs Hub](../README.md)
- [Local Backend JSON-RPC Reference](../local_backend_jsonrpc_reference.md)
- [Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
- [Frontend Main Local-Backend Process Lifecycle Reference](../../main/local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)

## Code Scope

- `frontend/src/main/python/core/ipc_protocol.py`
- `frontend/src/main/python/core/runtime_shutdown.py`
- `frontend/src/main/python/core/stdout_json.py`
- `frontend/src/main/python/core/backend_config.py`
- `frontend/src/main/python/core/remote_api_client_base.py`
- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `frontend/src/main/python/core/thread_pool.py`
- `tests/sidecar/test_json_rpc_protocol.py`
- `tests/sidecar/test_runtime_shutdown.py`
- `tests/sidecar/test_stdout_json.py`
- `tests/sidecar/test_backend_config.py`
- `tests/sidecar/test_remote_embedding_client.py`
- `tests/sidecar/test_remote_semantic_client.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/sidecar/remote_client_test_utils.py`
- `tests/sidecar/test_thread_pool.py`
