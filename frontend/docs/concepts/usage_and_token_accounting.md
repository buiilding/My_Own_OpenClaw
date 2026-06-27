---
summary: "Conceptual guide to WindieOS token-count events, usage diagnostics, cache metrics, dashboard usage placeholder boundary, and future billing/metering scope."
read_when:
  - When changing token-count events, provider usage diagnostics, renderer token display, cache diagnostics, usage UI, or future billing/metering plans.
  - When debugging `usage_source`, token totals, cached-token metrics, or missing token-count renderer state.
title: "Usage and Token Accounting"
---

# Usage and Token Accounting

WindieOS currently reports per-turn token diagnostics. It does not yet have a complete billing, quota, or subscription metering system.

Keep these concepts separate:

- token-count events: current runtime diagnostics,
- provider usage payloads: provider-reported counts when available,
- local estimates: fallback counts for display/debugging,
- usage dashboard: current placeholder/product surface,
- billing/metering: planned hosted platform work.

## Current Token Event Path

1. Backend prompt construction builds provider-bound prompt messages and tool schemas.
2. Before inference, the backend token service counts the input side using the same prompt messages plus the active provider-bound tool schemas.
3. Backend LLM stream processor completes or aggregates assistant output.
4. Backend token-count helper combines provider diagnostics with local estimates.
5. Backend emits `TokenCountEvent`.
6. Formatter maps it to websocket `token-count`.
7. Renderer chat stream consumes it and updates token display state.

## Token Count Fields

The websocket payload mirrors backend token-count fields:

- `prompt_tokens`
- `visible_output_tokens`
- `thinking_tokens`
- `output_tokens_total`
- `total_tokens`
- `conversation_tokens`
- `usage_source`
- `cached_tokens`
- `cache_hit`
- `cache_status`

`usage_source` is either `provider` or `estimated`.

## Provider vs Estimated Counts

Provider counts win when the provider supplies prompt, completion, and total usage diagnostics. Otherwise WindieOS uses local estimates:

- prompt estimates from token service over the system prompt, contextual prompt/history messages, and active tool schemas,
- output estimates from token service,
- conversation total from backend conversation history cache,
- coarse character-based fallback if tokenizer counting fails.

Provider cache diagnostics can expose cached token counts and hit/miss/unknown status. These are diagnostics, not billing invoices.

## Current Usage UI Boundary

The dashboard usage section is not the source of truth for billing. Treat it as a product surface that can display runtime usage summaries when backed by real data.

Future subscription/usage metering belongs in planning or hosted operations until there is:

- persistent usage storage,
- per-user/tenant identity,
- provider cost attribution,
- quota/entitlement policy,
- billing and audit tests.

## Change Rules

- Do not rename token-count fields without updating backend schemas, formatter tests, renderer event guards, and token display consumers.
- Do not treat local estimates as billable provider cost.
- Do not hide provider missing-usage cases; keep `usage_source="estimated"` visible for diagnostics.
- Treat provider usage capture as request-local during streaming; missing request-local usage must stay visible as unavailable/estimated diagnostics.
- Do not add billing language to current docs unless the billing system exists or the page is explicitly marked planned.

## Debug Routing

| Symptom | Start here |
| --- | --- |
| `token-count` event missing | backend LLM stream processor and formatter path |
| `usage_source` unexpectedly estimated | provider usage diagnostics extraction and provider stream mode |
| cached tokens always unknown | provider cache diagnostics capture and normalization |
| token display does not update | renderer backend event guard and chat stream token handler |
| conversation token count grows too slowly/quickly | backend conversation history cache invalidation |

## Deep Docs

- Token Count Event and Usage Diagnostics Reference (private backend docs)
- Backend Agent LLM Docs Hub (private backend docs)
- Private hosted services Token Docs Hub (private backend docs)
- [Frontend Backend Event Consumer Matrix](../frontend/contracts/backend_event_consumer_matrix_reference.md)
- [Dashboard Usage Section Runtime Reference](../frontend/renderer/dashboard/sections/usage_section_placeholder_panel_and_modal_contract_reference.md)
