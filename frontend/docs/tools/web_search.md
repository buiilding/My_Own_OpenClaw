---
summary: "Backend-owned web_search tool and capability guide covering OpenAI native search, Gemini native grounding, Brave fallback, visibility policy, result shape, and validation."
read_when:
  - When changing or debugging the `web_search` tool, native web search, Gemini Google Search grounding, or Brave Search fallback.
  - When `web_search` is hidden from the model, visible when it should be disabled, missing sources, failing with Brave configuration errors, or producing unexpected progress rows.
  - When changing `BRAVE_SEARCH_API_KEY`, `supports_native_web_search`, `agent_disabled_capabilities`, provider-native web-search projection, or web-search result formatting.
title: "Web Search Tool"
---

# Web Search Tool

`web_search` is a backend-owned logical capability. It is not a local-runtime
executable tool and does not go through Electron main or local-runtime Python.

## Execution Modes

private backend implementation chooses one execution mode per
session config:

| Mode | When selected | Model-visible surface |
| --- | --- | --- |
| `native-openai` | provider is OpenAI and selected model advertises `supports_native_web_search` | Backend does not expose the logical `web_search` function tool; the OpenAI Responses request gets native web search directly. |
| `native-gemini` | provider is Gemini and selected model advertises `supports_native_web_search` | Backend exposes logical `web_search`; fulfillment calls a native Google Search grounding request. |
| `backend-brave` | no native route is selected and `BRAVE_SEARCH_API_KEY` resolves | Backend exposes logical `web_search`; fulfillment calls Brave Search. |

If no mode resolves, `web_search` is hidden from the model.

## Visibility Rules

The same capability policy gates every mode:

- `agent_disabled_capabilities=["web_search"]` disables native and Brave-backed
  search
- provider-health unavailable capabilities can remove web search before prompt
  construction
- model catalog flags decide native support through `supports_native_web_search`
- Brave fallback requires a non-empty API key from the configured env var,
  defaulting to `BRAVE_SEARCH_API_KEY`

OpenAI native mode is intentionally different from Gemini/Brave modes: OpenAI
sessions attach provider-native web search to the main model request, so the
backend logical `web_search` tool is not exposed as a function declaration.

## Runtime Behavior

private backend implementation owns backend logical tool fulfillment:

- validates `query`, `count`, `domains`, and `recency_days` through
  `WebSearchArgs`
- sanitizes domain filters into `site:` clauses for Brave
- maps recency days to Brave freshness values
- limits native search source extraction to the requested result count
- returns normalized `data.results[]` entries with URL, optional title,
  snippet, age, provider, rank, and query fields where available
- fails with `"Brave Search is not configured on the backend."` when Brave mode
  is needed but no API key resolves
- fails before external calls when `web_search` is disabled by policy

OpenAI native web search progress is normalized back into SDK/renderer rows as a
provider-neutral synthetic `web_search` tool call/output pair. Gemini native
and Brave logical search still flow through normal backend tool-call/tool-output
handling.

## Configuration

Primary configuration surfaces:

- `selected_model_id`
- `model_provider`
- model catalog `supports_native_web_search`
- `agent_disabled_capabilities`
- `agent_provider_unavailable_capabilities`
- `brave_search.api_key_env`
- `BRAVE_SEARCH_API_KEY`

No renderer setting or client/local-runtime manifest entry enables this tool.
The backend resolves availability from provider/model capability plus policy and
credentials.

## Validation

Focused tests:

- private backend tests
- private backend tests
- private backend tests
- private backend tests
- provider-specific tests such as private backend tests and
  private backend tests when native request payloads change

Useful focused command:

```bash
private backend tests private backend tests -q
```

## Related Docs

- [Tool Policy Profiles and Capabilities](tool_policy_profiles_and_capabilities.md)
- [Tool Schema and Policy Change Workflow](tool_schema_policy_change_workflow.md)
- [Tool Catalog Matrix](tool_catalog_matrix.md)
- [OpenAI Provider](../providers/openai.md)
- [Gemini Provider](../providers/gemini.md)
- Runtime Configuration Matrix (private backend docs)
