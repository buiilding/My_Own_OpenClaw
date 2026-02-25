---
summary: "Deep reference for Browser Use token view models: usage entry schema, cached/new prompt cost decomposition, model pricing metadata, and per-model plus global usage summaries."
read_when:
  - When changing token usage accounting and cost aggregation contracts in Browser Use.
  - When investigating prompt-cache cost splits or by-model invocation/cost rollups.
title: "Token Usage, Pricing, and Aggregate Cost Summary Contract Reference"
---

# Token Usage, Pricing, and Aggregate Cost Summary Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/tokens/views.py`

## Usage Entry Models

`TokenUsageEntry`:

- single invocation usage record
- fields: `model`, `timestamp`, and provider-specific `usage` payload (`ChatInvokeUsage`)

`CachedPricingData`:

- timestamped cache wrapper for external pricing payloads (`dict[str, Any]`)

## Cost Calculation Model

`TokenCostCalculated` splits prompt cost into three buckets:

- `new_prompt_tokens` + `new_prompt_cost`
- cache-read prompt tokens/cost (`prompt_read_cached_*`)
- cache-creation prompt tokens/cost (`prompt_cached_creation_*`, Anthropic-focused)
- completion tokens/cost (`completion_tokens`, `completion_cost`)

Computed properties:

- `prompt_cost` = new + cache-read + cache-creation prompt cost
- `total_cost` = prompt_cost + completion_cost

## Pricing Metadata Model

`ModelPricing` carries cost and limits:

- model name
- input/output per-token cost
- cache-read and cache-creation input-token cost
- token limits (`max_tokens`, `max_input_tokens`, `max_output_tokens`)

## Aggregated Usage Models

`ModelUsageStats`:

- per-model aggregated prompt/completion/total tokens
- total cost and invocation count
- `average_tokens_per_invocation`

`ModelUsageTokens`:

- compact per-model token counters including cached prompt tokens

`UsageSummary`:

- global prompt/completion/total tokens and costs
- cached prompt totals
- `entry_count`
- `by_model` dictionary of `ModelUsageStats`

## Related Docs

- [Frontend Sidecar Browser Use Tokens Docs Hub](README.md)
- [Frontend Sidecar Browser Use Agent Docs Hub](../agent/README.md)
- [Frontend Sidecar Browser Use LLM Docs Hub](../llm/README.md)
