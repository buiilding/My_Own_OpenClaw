---
summary: "Local-runtime service protocol docs sub-hub for wakeword-service length-prefixed binary result framing backed by local-runtime Python service scripts."
read_when:
  - When changing stdin/stdout framing contracts between Electron main-process bridges and local-runtime Python service scripts.
  - When debugging parse mismatches or truncated frames in service subprocess protocols.
title: "Local-Runtime Service Protocol Docs Hub"
---

# Local-Runtime Service Protocol Docs Hub

## Deep Pages


## Related Pages

- [Local-Runtime Services Docs Hub](../README.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](../wakeword_service_model_bootstrap_and_binary_framing_reference.md)

## Code Scope

- `frontend/src/main/python/wakeword_service.py`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/python/core/stdout_json.py`
