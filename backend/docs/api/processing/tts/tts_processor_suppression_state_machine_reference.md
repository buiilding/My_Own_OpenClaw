---
summary: "Deep reference for TTSProcessor chunk filtering: tool-boundary resets, code/json suppression states, mid-chunk marker splitting, and buffer-limit fallback semantics."
read_when:
  - When changing `TTSProcessor` filtering heuristics for code/tool output.
  - When debugging spoken JSON leakage, dropped post-code text, or suppression-state desync.
title: "TTS Processor Suppression State-Machine Reference"
---

# TTS Processor Suppression State-Machine Reference

## Canonical Modules

- `backend/src/api/processing/tts/processor.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_stream_pipeline.py`

## Purpose and Boundary

`TTSProcessor` is an API-layer adapter that filters stream content before it reaches `TTSService`.

Primary goal:

- speak user-visible assistant text
- suppress code/tool-json segments that degrade spoken output

It is heuristic by design; long-term direction is event-level explicit content typing.

## State Machine Model

Internal state fields:

- `_is_tool_call_context`: `None | False | True`
- `_stream_buffer`: undecided pre-classification text
- `_suppression_type`: `None | "code" | "json"`
- `_json_brace_depth`: nested JSON brace tracking

State meanings:

- `None`: undecided, buffering to classify first meaningful chars
- `False`: text mode, normal pass-through (with marker scan)
- `True`: suppression mode, dropping code/json until exit condition

## Event Routing Rules

`process_event(event, tts_service)`:

1. no-op when `tts_service` absent
2. reset state on explicit tool boundaries:
   - `ToolCallEvent`
   - `ToolOutputEvent`
3. `ChunkEvent` handled by `_process_chunk(...)`
4. non-chunk events delegated to `TTSManager.process_event(...)`

Tool-boundary reset prevents suppression state bleeding across tool turns.

## Chunk Classification and Suppression

### Undecided mode (`_is_tool_call_context is None`)

- append chunk content to `_stream_buffer`
- enforce `MAX_BUFFER_SIZE` hard cap
- classify first non-whitespace char:
  - backtick => enter code suppression
  - `{` => enter JSON suppression (brace depth starts at 1)
  - else => switch to text mode and flush buffer to TTS

Buffer overflow path:

- logs warning
- forces text mode and flushes buffered content

### Suppression mode (`_is_tool_call_context is True`)

Code suppression (`_suppression_type == "code"`):

- scans for closing marker ``````
- drops content before exit
- on exit, returns to text mode and recursively processes remainder

JSON suppression (`_suppression_type == "json"`):

- tracks `{`/`}` depth per char
- exits when depth returns to zero
- recursively processes post-exit remainder

Unknown suppression type:

- resets to safe text state

### Text mode (`_is_tool_call_context is False`)

- scans entire chunk for first code or JSON marker, not only prefix
- if marker found:
  1. send pre-marker text to TTS
  2. enter suppression mode by marker kind
  3. recursively process marker+remainder
- if no marker found:
  - pass chunk directly to TTS manager

This mid-chunk split avoids both:

- speaking code that starts mid-chunk
- dropping valid text after a closing marker in same chunk

## Pipeline Concurrency Coupling

`StreamPipeline.process(...)` schedules TTS work as background tasks.

Implications for processor behavior:

- processor exceptions must not crash text-stream transport path
- `StreamPipeline._run_tts_event` catches and logs processor errors
- query end awaits pending tasks before flush

Test anchors:

- `tests/backend/test_stream_pipeline.py` validates non-blocking scheduling and failure isolation

## Known Limits

1. backtick/json detection is heuristic and may misclassify edge cases
2. JSON detection assumes brace-balanced object-style payloads
3. markdown/code forms without backticks are not explicitly classified
4. suppression is content-shape based, not semantic event metadata based

## Debug Checklist

If JSON/code is spoken:

1. inspect first non-whitespace chars and marker presence
2. verify tool boundary reset events are emitted around tool turns
3. inspect chunk segmentation where marker appears mid-chunk

If spoken text is unexpectedly dropped:

1. inspect suppression exit detection (code marker or brace depth)
2. check whether post-exit remainder recursion path ran
3. inspect `MAX_BUFFER_SIZE` overflow fallback warnings
