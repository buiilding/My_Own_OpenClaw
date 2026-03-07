---
summary: "Frontend sidecar services docs sub-hub for standalone Python service entrypoints: memory-only JSON service behavior and wakeword subprocess model/bootstrap binary framing semantics."
read_when:
  - When changing `frontend/src/main/python/memory_service.py` or `frontend/src/main/python/wakeword_service.py`.
  - When debugging standalone sidecar service startup/shutdown behavior or protocol-frame mismatches.
title: "Frontend Sidecar Services Docs Hub"
---

# Frontend Sidecar Services Docs Hub

## Deep Pages

- [Memory Service JSON Protocol and Store Lifecycle Reference](memory_service_json_protocol_and_store_lifecycle_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](wakeword_service_model_bootstrap_and_binary_framing_reference.md)
- [Sidecar Service Protocol Docs Hub](protocols/README.md)
- [Memory JSONL and Wakeword Binary Frame Contract Reference](protocols/memory_jsonl_and_wakeword_binary_frame_contract_reference.md)

## Related Pages

- [Frontend Sidecar Docs Hub](../README.md)
- [Frontend Sidecar Core Docs Hub](../core/README.md)
- [Local Backend Process Lifecycle Reference](../local_backend_process_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](../wakeword_bridge_and_audio_framing_reference.md)

## Code Scope

- `frontend/src/main/python/memory_service.py`
- `frontend/src/main/python/wakeword_service.py`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `tests/sidecar/test_memory_service.py`
