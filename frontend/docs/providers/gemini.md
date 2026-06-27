---
summary: "Gemini provider guide for WindieOS covering native thinking, native Google search, streamed tool-call aggregation, text extraction, and tests."
read_when:
  - When changing Gemini request params, thinking extraction, native web search, streaming tool-call behavior, or model catalog entries.
  - When debugging Gemini stream parsing, search sources, tool calls, or dashboard reasoning controls.
title: "Gemini Provider"
---

# Gemini Provider

WindieOS routes Gemini through the shared online provider path with Gemini-specific thinking extraction, text extraction, native Google search tool injection, and stream tool-call aggregation.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | private backend implementation |
| Native thinking/text helpers | private backend implementation |
| Streamed tool-call aggregation | private backend implementation |
| Gemini web-search source extraction | private backend implementation |
| Model catalog/capabilities | private backend implementation |
| Credential loading | private backend implementation |

## Runtime Behavior

`GeminiProvider` sets:

- `provider_label = "Gemini"`
- `model_prefix = "gemini"`
- `stream_includes_thinking = True`
- `supports_streaming_tool_turns(...) = True`

The provider sets `temperature = 1.0` in provider request params and applies native thinking parameters through `apply_provider_native_thinking_request_params`.

## Native Web Search

When `native_web_search_enabled` is true, Gemini appends:

```json
{"google_search": {}}
```

to the provider tools list. Completion responses and stream terminal payloads then use `extract_gemini_web_search_sources`.

If search sources are missing:

- Confirm the selected model has `supports_native_web_search` in `models_config.py`.
- Confirm request kwargs include `native_web_search_enabled`.
- Inspect the Gemini provider response before renderer formatting.
- Check the fallback path for LiteLLM's async transform gap.

## Tool Calls And Streams

Gemini uses `StreamingToolCallAggregationMixin` because stream payloads can include tool-call deltas with thinking chunks. When modifying stream handling, preserve:

- partial argument accumulation,
- terminal normalized tool-call payloads,
- thought-signature preservation for Gemini messages,
- text extraction fallback to shared delta parsing.

## Tests

Focused backend tests:

```bash
private backend tests private backend tests -q
private backend tests private backend tests -q
private backend tests private backend tests -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- ChatInterfaceWiring.test.jsx ModelThinkingCapabilities.test.ts DesktopModelCardPresentationRuntime.test.js MarkdownMessage.test.jsx
```

