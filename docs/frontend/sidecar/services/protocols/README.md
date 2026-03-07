---
summary: "Sidecar service protocol docs sub-hub for memory-service JSONL framing and wakeword-service length-prefixed binary result framing."
read_when:
  - When changing stdin/stdout framing contracts between Electron main-process bridges and sidecar service scripts.
  - When debugging parse mismatches, truncated frames, or shutdown behavior in service subprocess protocols.
title: "Sidecar Service Protocol Docs Hub"
---

# Sidecar Service Protocol Docs Hub

## Deep Pages

- [Memory JSONL and Wakeword Binary Frame Contract Reference](memory_jsonl_and_wakeword_binary_frame_contract_reference.md)

## Related Pages

- [Frontend Sidecar Services Docs Hub](../README.md)
- [Memory Service JSON Protocol and Store Lifecycle Reference](../memory_service_json_protocol_and_store_lifecycle_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](../wakeword_service_model_bootstrap_and_binary_framing_reference.md)

## Code Scope

- `frontend/src/main/python/memory_service.py`
- `frontend/src/main/python/wakeword_service.py`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/python/core/stdout_json.py`
- `frontend/src/main/python/core/runtime_shutdown.py`
