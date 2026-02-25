---
summary: "Deep reference for TokenService counting internals: LiteLLM message shaping, assistant tool-call canonicalization, fallback multimodal text extraction, and singleton/thread-safety guarantees."
read_when:
  - When changing `_to_litellm_message`, `_normalize_assistant_tool_calls`, or `_fallback_token_estimate` in `token_service.py`.
  - When investigating why token usage source switches from provider/local count to estimated fallback.
title: "Token Counter Invocation, Fallback Estimation, and Tool-Call Normalization Reference"
---

# Token Counter Invocation, Fallback Estimation, and Tool-Call Normalization Reference

## Canonical Modules

- `backend/src/services/token_service.py`
- `backend/src/agent/llm/token_counting.py`
- `tests/backend/test_token_service_fallback.py`

## Counter Invocation Path

`TokenService.count_tokens(messages, model)` flow:

1. materialize messages iterable once
2. return `0` for empty list (no LiteLLM call)
3. normalize each message for LiteLLM shape
4. call `litellm.token_counter(...)` with:
   - `model`
   - normalized `messages`
   - `use_default_image_token_count=True`
5. return LiteLLM result on success

Failure behavior:

- any exception triggers logged fallback estimate path

## Message Normalization Contract

Role normalization:

- invalid/non-string/blank role => `"user"`
- valid string roles stripped of surrounding whitespace

Content normalization:

- `None` content normalized to `""`
- dict messages copied (input object not mutated)

Object message support:

- supports dataclass/object messages via `getattr(role/content/tool_calls)`

## Assistant Tool-Call Normalization

Normalization accepts two input shapes:

1. canonical function-call shape:
   - `{type:"function", function:{name, arguments}, id?}`
2. internal runtime shape:
   - `{name, arguments, id?}`

Output shape forced to canonical:

- `{id, type:"function", function:{name, arguments:string}}`

Rules:

- invalid or blank function names dropped
- non-list `tool_calls` ignored
- missing/blank ids replaced with deterministic `tool_call_<index>`
- arguments serialization:
  - string -> unchanged
  - dict/list/JSON-serializable -> compact JSON string
  - `None` or non-serializable -> `"{}"`

If all tool calls invalid:

- `tool_calls` removed from normalized assistant message

## Fallback Estimation Heuristics

Fallback entry:

- `_fallback_token_estimate(messages)`

Text extraction scope:

- plain string content
- dict text parts
- list content containing string fragments and text-like dict parts

Part types counted:

- `type == "text"`
- `type == "input_text"`

For text parts:

- `text` field preferred
- `content` field used as compatibility fallback

Ignored in fallback:

- non-text multimodal parts (for example `image_url`)

Token estimate formula:

- `total_text_chars // 4`

Implication:

- fallback is intentionally coarse and can diverge from provider-accurate/multimodal token counts

## Singleton and Concurrency Contract

Global accessor:

- `get_token_service()`

Initialization model:

- module-level singleton
- double-checked lock with thread lock

Thread-safety guarantee:

- concurrent calls construct one instance only

## Test-Backed Matrix

`tests/backend/test_token_service_fallback.py` verifies:

- fallback activation when LiteLLM raises
- empty-input short-circuit (no LiteLLM call)
- fallback extraction over:
  - object messages
  - dict `text` parts
  - `input_text` parts
  - text via `content` key in text parts
  - mixed list with strings + image parts
- normalization of dict/object roles and `None` content
- no mutation of original dict inputs
- internal + canonical tool-call conversion and JSON argument serialization
- singleton creation is thread-safe
- `count_message_tokens` delegates to `count_tokens`

## Drift Hotspots

1. changing tool-call argument serialization can break LiteLLM counting compatibility.
2. broadening fallback part-type acceptance can overcount non-text modalities.
3. removing dict-copy normalization can mutate upstream message state.
4. altering empty-input short-circuit increases unnecessary LiteLLM calls.
5. weakening singleton lock semantics can create duplicate token service instances.
