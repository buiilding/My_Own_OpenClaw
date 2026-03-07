---
summary: "Cross-service protocol reference for memory_service JSON line framing and wakeword_service length-prefixed binary framing, including bridge parse behavior and shutdown/reset controls."
read_when:
  - When changing sidecar service framing, payload envelope keys, or bridge parser logic.
  - When diagnosing dropped events due to malformed JSON lines, partial binary frames, or stale wakeword buffered output.
title: "Memory JSONL and Wakeword Binary Frame Contract Reference"
---

# Memory JSONL and Wakeword Binary Frame Contract Reference

## Canonical Modules

- `frontend/src/main/python/memory_service.py`
- `frontend/src/main/python/wakeword_service.py`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/python/core/stdout_json.py`
- `frontend/src/main/python/core/runtime_shutdown.py`

## Protocol Split Overview

The two standalone services intentionally use different framing models:

- memory service: UTF-8 JSON line protocol (`stdin.readline` / newline-delimited responses)
- wakeword service: binary framing (`4-byte little-endian length` + payload bytes)

They are consumed by different bridge paths and should not be treated as interchangeable wire formats.

## Memory Service JSONL Contract

Request framing:

- one JSON object per stdin line
- blank lines ignored
- invalid JSON line returns failure response with `id: "unknown"`

Response framing:

- one JSON object per stdout line using `write_json_line(...)`
- helper writes `json.dumps(payload)` + newline and flushes immediately

Envelope keys:

- request: `id`, `type`, `payload`
- response: `id`, `success`, plus `data` or `error`

Shutdown behavior:

- `request_stdin_shutdown` marks flags and closes stdin
- closing stdin unblocks blocking read loop and allows graceful exit

## Wakeword Binary Contract

Input framing (Electron -> Python):

- 4-byte little-endian length
- `length` bytes PCM16 audio chunk

Control frame:

- length `0` is reset signal
- service logs reset and calls `owwModel.reset()` when loop receives this frame

Output framing (Python -> Electron):

- result JSON serialized to UTF-8 bytes
- prefixed with 4-byte little-endian payload length
- stdout flushed per frame

Payload keys:

- detection success: `detected`, `model`, `score`, `confidence`
- non-detection: `detected: false`
- processing error: `error`

## Wakeword Bridge Parse and Buffer Semantics

`wakeword_bridge.cjs` behavior:

- buffers stdout bytes (`resultBuffer`)
- processes complete length-prefixed frames only
- keeps trailing partial bytes until enough data arrives
- clears buffer on detection dispatch to reduce duplicate buffered detections
- on disable:
- sets wakeword-enabled flag false
- clears result buffer
- sends reset frame (`length=0`) to python stdin

Stderr handling:

- status JSON lines parsed from stderr
- non-JSON debug lines filtered/logged selectively
- `status=ready` toggles renderer wakeword-ready status
- helper ownership:
  - `wakeword_bridge_runtime.cjs::handleWakewordStderrLine(...)` parses status lines and applies known noisy-log suppression
  - `wakeword_bridge_runtime.cjs::emitWakewordStatus(...)` is the single wakeword-status emit surface used by bridge startup/error paths

## Failure and Compatibility Boundaries

Memory service:

- malformed request shape returns structured failure object
- unknown request type returns explicit failure without crashing loop

Wakeword service:

- model bootstrap failure exits process non-zero
- runtime chunk processing errors emit result-level error payloads and stderr status logs
- truncated input frame exits loop silently (EOF/broken stream behavior)

## Drift Hotspots

1. changing endian or frame-length width in wakeword service breaks bridge parser immediately.
2. changing memory-service newline framing without bridge updates causes indefinite read blocking or parse failures.
3. changing wakeword detection payload keys can silently break renderer detection handlers.
4. removing stdin-close shutdown path in memory service can hang process termination during app shutdown.

## Related Pages

- [Sidecar Service Protocol Docs Hub](README.md)
- [Memory Service JSON Protocol and Store Lifecycle Reference](../memory_service_json_protocol_and_store_lifecycle_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](../wakeword_service_model_bootstrap_and_binary_framing_reference.md)
- [Wakeword Bridge and Audio Framing Reference](../../wakeword_bridge_and_audio_framing_reference.md)
