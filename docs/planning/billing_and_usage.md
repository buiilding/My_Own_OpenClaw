---
summary: "Billing & Usage (Planned)"
read_when:
  - When changing billing, usage limits, or metering.
---

# Billing & Usage (Planned)

## Purpose

This document defines the future billing, subscription, and usage enforcement model for the hosted (multi-tenant) backend.

## Plan Model

Plans map to entitlements and limits. Example tiers:

- **Free**: small model access, limited monthly tokens, low tool-call quotas.
- **Pro**: premium models, higher quotas, longer retention.
- **Enterprise**: custom models, dedicated capacity, policy controls, SSO.

## Entitlements

Entitlements are a normalized set of permissions derived from a user’s active plan:

- **Model access**: allowed model IDs and max context size.
- **Tools**: allowlist/denylist (e.g., computer control tools).
- **Concurrency**: max simultaneous requests/sessions.
- **Retention**: memory and conversation retention days.
- **Limits**: token/tool/screenshot monthly budgets.

### Example Entitlements Payload

```json
{
  "plan_id": "pro",
  "models": ["gpt-5.1", "claude-sonnet-4-5-20250929"],
  "max_context_tokens": 200000,
  "tools": {
    "allow": ["mouse_control", "keyboard_control", "scroll_control", "read_file", "write_file"],
    "deny": []
  },
  "limits": {
    "tokens_monthly": 200000,
    "tool_calls_monthly": 2000,
    "screenshots_monthly": 500
  },
  "concurrency": 3,
  "retention_days": 30
}
```

## Usage Metering

### Metered Dimensions

- **Tokens**: input/output tokens per request.
- **Tool calls**: count per tool and total.
- **Screenshots**: number of screenshots captured/stored.
- **Compute time**: optional measurement for long-running tasks.

### Planned Row-Level Token Attribution

Current provider usage payloads are request-level aggregates, not transcript-row allocations. In practice this means the normal completion/stream `usage` metadata is reliable for:

- total input tokens for the whole request
- total output tokens for the whole provider response
- optional cache/reasoning subtotals when the provider exposes them

But it does **not** directly answer:

- which visible user row contributed how many billed input tokens
- which transcript row should own output tokens when one turn contains tool-call JSON plus final assistant text

Planned approach:

1. Keep request-level provider totals as the billing source of truth.
2. Add provider-specific preflight counting for exact input-side attribution when supported.
3. Derive per-row input contribution by counting the exact assembled prompt payload with cumulative-prefix differencing, not by counting isolated message text.
4. Treat output-side attribution as turn-level unless the turn has a single dominant model-generated row.

Suggested provider-specific paths:

- **OpenAI**: use the Responses input-token counting endpoint on the exact assembled request payload before send.
- **Anthropic**: use `messages.count_tokens` on the exact assembled payload before send.
- **Other providers**: keep fallback local estimation until an exact provider-side counting path exists and is validated.

Output attribution policy (planned):

- assistant-text-only turn: attach provider output totals to the completed assistant row
- tool-call-only turn: attach provider output totals to the tool-call row
- mixed tool-call + final-text turn: keep provider output totals at turn scope and label any finer split as derived, not provider-reported

Implementation guardrails:

- never present tokenizer-only estimates as provider-billed truth
- count the exact runtime payload after prompt assembly, compaction, tool-history shaping, and provider-specific normalization
- capability-gate provider-specific counting so unsupported providers fall back cleanly
- persist whether a displayed row token figure is `provider-reported`, `provider-counted-preflight`, or `estimated`

### Usage Ledger (Suggested Schema)

```
usage_events
- id
- user_id
- session_id
- timestamp
- event_type: tokens | tool_call | screenshot | compute
- quantity
- metadata (model_id, tool_name, request_id)
```

### Soft vs Hard Limits

- **Soft**: warning at 80–90% usage; UI banner + email.
- **Hard**: request blocked; return `limit-reached` with upgrade URL.

### Overage Policy (Optional)

If overages are allowed for higher tiers:
- Track overage usage separately from base plan.
- Bill overages at end of cycle.
- Provide UI warnings when entering overage.

## Enforcement Flow

1. Request arrives with auth token + session ID.
2. Gateway checks rate limits (RPS + burst).
3. Backend checks entitlements (models/tools/concurrency).
4. Backend meters usage for each request and tool call.
5. Usage ledger updated.
6. If limit exceeded: return `limit-reached` and stop execution.

## Billing Integration (Stripe Suggested)

- **Checkout**: plan selection and payment.
- **Customer Portal**: manage subscription and invoices.
- **Webhooks**: update entitlements + account status.
- **Proration**: plan upgrades and downgrades.

### Failure States

- **Payment failed**: downgrade to limited mode after grace period.
- **Chargeback**: suspend account and require support review.
- **Subscription canceled**: entitlements revert to free tier at period end.

## Client UX Requirements

- Plan selection page and pricing table.
- Billing portal link.
- Usage meter with remaining quota.
- Upgrade CTA when limits reached.
- Feature gating for higher-tier tools/models.

## Migration Notes

- Local-only mode remains available without billing.
- Hosted mode requires auth + token storage.
- Transition from local settings to cloud profile is opt-in.

## Open Questions

- Overage vs hard cutoffs for Pro plans.
- Enterprise custom contract terms.
- Regional data residency requirements.
