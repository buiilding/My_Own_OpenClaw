---
summary: "Deep reference for standalone wakeword_service runtime: model bootstrap/download, inference-framework fallback, stdin length-prefixed audio protocol, detection-threshold output semantics, and reset frame handling."
read_when:
  - When changing `wakeword_service.py` model initialization or binary input/output framing behavior.
  - When debugging wakeword model download/startup failures, repeated detections, or frame parse mismatches between Python and Electron bridge.
title: "Wakeword Service Model Bootstrap and Binary Framing Reference"
---

# Wakeword Service Model Bootstrap and Binary Framing Reference

## Canonical Modules

- `frontend/src/main/python/wakeword_service.py`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `docs/frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md`

## Service Role

`wakeword_service.py` is a dedicated subprocess for wakeword inference:

- consumes binary audio frames from stdin
- runs openWakeWord inference
- emits length-prefixed JSON results to stdout
- emits status/log diagnostics on stderr

It is not JSON-RPC and does not share `JSONRPCProtocol`.

## Model Bootstrap and Startup Status

Startup pipeline:

1. `ensure_models_available()` checks packaged openWakeWord model path for `hey_jarvis_v0.1.tflite`
2. if missing, calls `download_models(['hey_jarvis'])`
3. initializes `Model` with `wakeword_models=["hey_jarvis"]`
4. inference framework tries `tflite` first, falls back to `onnx` on failure

Status payloads are written to stderr JSON lines:

- `downloading`
- `download_complete`
- `models_ready`
- `fallback`
- `ready`
- `error`

Startup hard failure exits process with non-zero code.

## Input Binary Framing Contract (stdin)

Main loop reads repeating frames:

1. 4-byte little-endian message length
2. `length` bytes audio payload (16-bit PCM)

Special reset frame:

- `length == 0` means reset command
- service logs reset and calls `owwModel.reset()` (when available in runtime library)

EOF or truncated frame exits loop.

## Audio Processing and Detection Semantics

`process_audio_chunk(audio_data)`:

- converts bytes to `np.int16` via `np.frombuffer`
- calls `owwModel.predict(audio_array)`
- applies fixed detection threshold `0.5`

Output behavior:

- on detection: returns
  - `detected: true`
  - `model`
  - `score`
  - `confidence` (same numeric value as score)
- on non-detection: returns `{ "detected": false }`

Logging behavior:

- logs all scores above `0.05` to stderr for diagnostics
- logs explicit detection lines to stderr

Errors in processing return `{"error": "..."}` payload and emit status error on stderr.

## Output Binary Framing Contract (stdout)

For each processed chunk:

1. serialize result JSON bytes
2. write 4-byte little-endian length
3. write JSON bytes
4. flush stdout buffer

This framing is consumed by `wakeword_bridge.cjs` buffered parser.

## Bridge Coupling

`wakeword_bridge.cjs` uses this contract:

- parses stderr JSON lines for readiness/error
- parses stdout length-prefixed JSON result frames
- on `wakeword-disable`, sends reset frame (`length=0`) and clears buffered results

Renderer wakeword hook adds cooldown/threshold gate on top of service output.

## Test Coverage Note

There are no direct unit tests for `wakeword_service.py` in current test suite.

Risk:

- protocol or startup regressions are primarily caught via integrated bridge/runtime behavior rather than service-level tests.

## Drift Hotspots

1. changing frame format (length-prefix size/endianness) breaks bridge parser compatibility.
2. changing detection payload keys (`detected/model/confidence/score`) breaks main/renderer wakeword event handling.
3. removing fallback framework initialization can make startup brittle on systems lacking tflite runtime.
4. removing reset-frame handling can increase buffered stale-audio retrigger incidents after disable/enable cycles.

## Related Pages

- [Frontend Sidecar Services Docs Hub](README.md)
- [Sidecar Service Protocol Docs Hub](protocols/README.md)
- [Memory JSONL and Wakeword Binary Frame Contract Reference](protocols/memory_jsonl_and_wakeword_binary_frame_contract_reference.md)
- [Memory Service JSON Protocol and Store Lifecycle Reference](memory_service_json_protocol_and_store_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](../wakeword_bridge_and_audio_framing_reference.md)
