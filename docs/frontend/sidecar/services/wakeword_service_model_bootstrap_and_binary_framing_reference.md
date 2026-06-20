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
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
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

1. `resolve_wakeword_model()` reads the preferred model id from
   `AGENT_WAKEWORD_NAME`, then `WINDIE_WAKEWORD_NAME`, then the compatibility
   default, and resolves that id/path from openWakeWord metadata (`models` or
   `MODELS`).
2. `ensure_models_available()` first checks packaged model path, then checks user cache path (`AGENT_WAKEWORD_MODEL_DIR`, `WINDIE_WAKEWORD_MODEL_DIR`, or WindieOS user-data dir).
3. if model is missing, `download_models([<wakeword-name>], target_directory=<user-cache>)` is used when supported by the installed openWakeWord version.
4. runtime resolves a concrete model file path from the writable cache and initializes `Model` with explicit `wakeword_model_paths`; model-name-only constructor fallback is not supported.
   When cached models are used, auxiliary feature-model paths (`melspectrogram`, `embedding_model`) are resolved from the same cache directory so ONNX fallback does not drift back to broken package-relative defaults.
5. inference framework tries `tflite` first, falls back to `onnx` on failure

Runtime wakeword selection is controlled by `AGENT_WAKEWORD_NAME` with
`WINDIE_WAKEWORD_NAME` preserved as the WindieOS host alias. Runtime model cache
overrides are controlled by `AGENT_WAKEWORD_MODEL_DIR` with
`WINDIE_WAKEWORD_MODEL_DIR` preserved as the WindieOS alias. Runtime model
downloads are controlled by `AGENT_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD` with
`WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD` preserved as the WindieOS host alias.
Electron host-skin launches set both generic and WindieOS alias keys when the
skin uses WindieOS env names, so generic Python wakeword code can prefer
`AGENT_*` deterministically.

Status payloads are written to stderr JSON lines:

- `downloading`
- `download_complete`
- `models_ready`
- `fallback`
- `ready`
- `error`

Runtime note:

- Installed desktop builds typically run from read-only app directories (for example `/opt/WindieOS/...` on Linux); wakeword model downloads are redirected to a user-writable cache directory to avoid permission failures.

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

`wakeword_bridge_runtime.cjs` provides helper logic used by the bridge:

- status emission helper (`emitWakewordStatus`)
- stderr line parser with noisy-line suppression (`handleWakewordStderrLine`)
- startup/process error text mapping for packaged-vs-dev launch modes
- audio payload normalization for base64/Buffer/ArrayBuffer ingress

Renderer wakeword hook adds cooldown/threshold gate on top of service output.

## Test Coverage Note

`tests/sidecar/test_wakeword_service.py` covers direct service helpers for:

- model metadata resolution
- writable model cache lookup/download behavior
- path-based `create_model()` initialization and ONNX fallback
- rejection of unsupported and model-name-only constructors
- audio chunk detection payloads

## Drift Hotspots

1. changing frame format (length-prefix size/endianness) breaks bridge parser compatibility.
2. changing detection payload keys (`detected/model/confidence/score`) breaks main/renderer wakeword event handling.
3. removing fallback framework initialization can make startup brittle on systems lacking tflite runtime.
4. removing reset-frame handling can increase buffered stale-audio retrigger incidents after disable/enable cycles.

## Related Pages

- [Local-Runtime Services Docs Hub](README.md)
- [Local-Runtime Service Protocol Docs Hub](protocols/README.md)
- [Wakeword Bridge and Audio Framing Reference](../wakeword_bridge_and_audio_framing_reference.md)
