---
summary: "Local-runtime core docs sub-hub for JSON-RPC protocol/error semantics, stdout framing, backend URL resolution, remote semantic clients, and shared executor lifecycle backed by local-runtime Python implementations."
read_when:
  - When changing `frontend/src/main/python/core/*` modules.
  - When debugging local-runtime protocol parse/dispatch failures, stdout framing, or remote semantic client connectivity.
title: "Local-Runtime Core Docs Hub"
---

# Local-Runtime Core Docs Hub

## Deep Pages

- [JSON-RPC Protocol and Stdout Framing Reference](json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Backend Config Env-Precedence, Trailing-Slash Normalization, and Default-URL Contract Reference](backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
- [Remote Semantic Client Summarize Payload, Timeout, and Error-Surface Contract Reference](remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md)

## Related Pages

- [Local Runtime Python Implementation Docs Hub](../README.md)
- [Local Runtime JSON-RPC Reference](../local_backend_jsonrpc_reference.md)
- [Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
- [Frontend Main Local-Runtime Process Lifecycle Reference](../../main/local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)

## Code Scope

- `frontend/src/main/python/windie/_backend_config.py`
- `frontend/src/main/python/windie/_remote_api_client_base.py`
- `frontend/src/main/python/windie/_auth.py`
- `frontend/src/main/python/windie/_unicode_sanitizer.py`
- `frontend/src/main/python/core/ipc_protocol.py`
- `frontend/src/main/python/core/stdout_json.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/core/executors.py`
- `tests/sidecar/test_json_rpc_protocol.py`
- `tests/sidecar/test_stdout_json.py`
- `tests/sidecar/test_backend_config.py`
- `tests/sidecar/test_remote_semantic_client.py`
- `tests/sidecar/remote_client_test_utils.py`
- `tests/sidecar/test_executors.py`
